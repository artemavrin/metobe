import { prorate, vatSplit } from "./money";
import type { Kopecks, Vat } from "./money";
import {
  localParts,
  monthStart,
  nextPeriod,
  periodKey,
  periodOf,
  startOfLocalDayPlus,
  zonedInstant,
} from "./time";

// Billing calendar for one organization (ARCH §20.10, ORGS-PLAN §6): rollover on the 1st, invoice on the 25th, due date,
// disabling for non-payment, reminders. `tick(state, now)` is a pure function: it reads a snapshot and answers which
// actions are due. `apply(state, action)` is the same actions' effect on the snapshot (the model of what the database
// executor does). Idempotence is two-fold: every action has a key (`state.applied`, `billing_actions.key` unique in
// Postgres), and every action is only due while the state does not already show its effect.

export interface Tariff {
  id: string;
  /** Per seat per month, in the price basis of `vat`. */
  price: Kopecks;
  vat: Vat;
}

export type SeatChangeKind =
  | "add"
  | "next"
  | "upgrade"
  | "downgrade"
  | "rollover";

/** A row of `seat_changes`. `amount` is the surcharge in the tariff's price basis; 0 for «next» and «downgrade». */
export interface SeatChange {
  id: string;
  tariffId: string;
  at: Date;
  kind: SeatChangeKind;
  amount: Kopecks;
  /** Period of the invoice that billed it; null while unbilled. */
  invoicedIn: string | null;
}

export interface InvoiceLine {
  id: string;
  kind: "seats" | "surcharge";
  tariffId: string;
  quantity: number;
  unit: Kopecks;
  amount: Kopecks;
  net: Kopecks;
  vat: Kopecks;
  gross: Kopecks;
}

export type InvoiceStatus = "issued" | "paid" | "overdue";

export interface Invoice {
  /** 'YYYY-MM' the invoice is for; unique within the organization. */
  period: string;
  status: InvoiceStatus;
  issuedAt: Date;
  /** The instant the organization is disabled at if the invoice is not paid. Stored, so «перенести срок» is an edit. */
  dueAt: Date;
  paidAt: Date | null;
  lines: InvoiceLine[];
  net: Kopecks;
  vat: Kopecks;
  total: Kopecks;
  /** Seats per tariff the invoice charged for the month; the rollover bills what exceeds it. */
  billedSeats: Record<string, number>;
}

export interface SeatRow {
  /** Paid for the current month. */
  seats: number;
  /** The owner's number for the next month. */
  seatsNext: number;
  /** Active people plus pending invitations. */
  occupied: number;
}

export interface BillingSettings {
  /** Day of the month the next month's invoice is issued on, 1–28. */
  invoiceDay: number;
  /** Day of the invoice's own month it falls due on, 1–28. */
  dueDay: number;
  /** An invoice issued late still gets this many days to pay (guess, not in ARCH). */
  minNoticeDays: number;
  /** Days before the due date the owner gets a reminder. */
  ownerReminderDays: number[];
  /** Days before the due date the superuser gets the list. */
  superuserReminderDays: number[];
  /** Local hour reminders are sent from. */
  reminderHour: number;
}

export const DEFAULT_SETTINGS: BillingSettings = {
  dueDay: 1,
  invoiceDay: 25,
  minNoticeDays: 3,
  ownerReminderDays: [5, 1],
  reminderHour: 9,
  superuserReminderDays: [3],
};

export interface OrgBillingState {
  orgId: string;
  timeZone: string;
  status: "active" | "disabled";
  disabledReason: "unpaid" | "manual" | null;
  trialEndsAt: Date | null;
  /** When the first seat was bought. A month that started before it has no invoice «for the month already running». */
  billingStartedAt: Date;
  /** Period of the last rollover; the creation month for a new organization. */
  lastRollover: string;
  tariffs: Record<string, Tariff>;
  seats: Record<string, SeatRow>;
  seatChanges: SeatChange[];
  invoices: Invoice[];
  /** Keys of executed actions. */
  applied: ReadonlySet<string>;
  settings: BillingSettings;
}

interface Base {
  /** Idempotency key: kind, organization and the period or invoice it concerns. */
  key: string;
  orgId: string;
  period: string;
}

export type BillingAction =
  | (Base & {
      kind: "rollover";
      /** Nominal moment: 00:00 on the 1st in the organization's zone. */
      effectiveAt: Date;
      /** `seats` after the rollover, by tariff. The executor recomputes it under the lock with `rollSeats`. */
      seatsAfter: Record<string, number>;
      /** Journal rows (`kind: 'rollover'`); a row with `amount` bills seats the issued invoice did not cover. */
      changes: SeatChange[];
    })
  | (Base & { kind: "issueInvoice"; invoice: Invoice; late: boolean })
  | (Base & { kind: "markOverdue" })
  | (Base & {
      kind: "disableOrg";
      reason: "unpaid";
      /** The due moment; the actual time is when the action ran. */
      effectiveAt: Date;
    })
  | (Base & {
      kind: "notify";
      to: "owner" | "superuser";
      daysBefore: number;
      dueAt: Date;
      total: Kopecks;
    })
  | (Base & { kind: "markPaid"; paidAt: Date })
  | (Base & { kind: "enableOrg" });

// ───────────────────────────── surcharges (written to seat_changes at the moment of the change)

/** Adding `delta` seats of a tariff: price × remaining days / days in the month, the day of the change included. */
export const addSeatsSurcharge = (
  tariff: Tariff,
  delta: number,
  at: Date,
  timeZone: string
) => {
  if (!Number.isInteger(delta) || delta <= 0) {
    throw new RangeError("delta must be a positive integer");
  }
  return prorate(delta * tariff.price, at, timeZone);
};

/** Raising a person's tariff: the difference of prices × the same share. Lowering costs nothing now. */
export const upgradeSurcharge = (
  from: Tariff,
  to: Tariff,
  at: Date,
  timeZone: string
) => (to.price > from.price ? prorate(to.price - from.price, at, timeZone) : 0);

// ───────────────────────────── helpers

/** What `seats` becomes on the 1st: the owner's number, but not below those who occupy seats. */
export const rollSeats = (row: SeatRow) =>
  Math.max(row.seatsNext, row.occupied);

const dateKey = (p: { year: number; month: number; day: number }) =>
  (p.year * 100 + p.month) * 100 + p.day;

const validate = (s: OrgBillingState) => {
  const { invoiceDay, dueDay, reminderHour } = s.settings;
  for (const [name, v] of [
    ["invoiceDay", invoiceDay],
    ["dueDay", dueDay],
  ] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 28) {
      throw new RangeError(`${name} must be 1–28 (every month has these days)`);
    }
  }
  if (
    !Number.isInteger(reminderHour) ||
    reminderHour < 0 ||
    reminderHour > 23
  ) {
    throw new RangeError("reminderHour must be 0–23");
  }
  for (const id of Object.keys(s.seats)) {
    if (!s.tariffs[id]) {
      throw new RangeError(`unknown tariff ${id}`);
    }
  }
  localParts(new Date(0), s.timeZone); // throws on an unknown zone
};

/** First period that is billed: periods that start before the trial ends are free. */
const firstPaidPeriod = (s: OrgBillingState) => {
  if (!s.trialEndsAt) {
    return "0000-00";
  }
  const p = periodOf(s.trialEndsAt, s.timeZone);
  return monthStart(p, s.timeZone) >= s.trialEndsAt ? p : nextPeriod(p);
};

const hasInvoice = (s: OrgBillingState, period: string) =>
  s.invoices.some((i) => i.period === period);

const line = (
  id: string,
  kind: InvoiceLine["kind"],
  tariff: Tariff,
  quantity: number,
  unit: Kopecks,
  amount: Kopecks
): InvoiceLine => ({
  id,
  kind,
  quantity,
  tariffId: tariff.id,
  unit,
  amount,
  ...vatSplit(amount, tariff.vat),
});

// ───────────────────────────── planning of single actions

const planRollover = (s: OrgBillingState, period: string): BillingAction => {
  const effectiveAt = monthStart(period, s.timeZone);
  const issued = s.invoices.find((i) => i.period === period);
  const seatsAfter: Record<string, number> = {};
  const changes: SeatChange[] = [];
  for (const [tariffId, row] of Object.entries(s.seats).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const to = rollSeats(row);
    seatsAfter[tariffId] = to;
    // The invoice of 25th charged for `billedSeats`; whoever came after it (a seat added, a person over the number)
    // is billed here for the full month. Nothing is returned if there are fewer.
    const billed = issued ? (issued.billedSeats[tariffId] ?? 0) : to;
    const price = s.tariffs[tariffId]?.price ?? 0;
    const amount = to > billed ? (to - billed) * price : 0;
    if (to !== row.seats || amount > 0) {
      changes.push({
        amount,
        at: effectiveAt,
        id: `rollover:${s.orgId}:${period}:${tariffId}`,
        invoicedIn: null,
        kind: "rollover",
        tariffId,
      });
    }
  }
  return {
    changes,
    effectiveAt,
    key: `rollover:${s.orgId}:${period}`,
    kind: "rollover",
    orgId: s.orgId,
    period,
    seatsAfter,
  };
};

/**
 * The invoice for `period`. `next`: the month starts later, quantity = what the 1st will make of the seats
 * (owner's number, not below the occupied). `current`: the month is already running, quantity = `seats`.
 * Null when there is nothing to charge.
 */
const planInvoice = (
  s: OrgBillingState,
  period: string,
  now: Date,
  basis: "next" | "current"
): BillingAction | null => {
  const lines: InvoiceLine[] = [];
  const billedSeats: Record<string, number> = {};
  for (const [tariffId, row] of Object.entries(s.seats).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const tariff = s.tariffs[tariffId];
    const quantity = basis === "next" ? rollSeats(row) : row.seats;
    billedSeats[tariffId] = quantity;
    if (tariff && quantity > 0 && tariff.price > 0) {
      lines.push(
        line(
          `seats:${tariffId}`,
          "seats",
          tariff,
          quantity,
          tariff.price,
          quantity * tariff.price
        )
      );
    }
  }
  // Surcharges: every unbilled change from a paid month, whatever month it was made in.
  const paidFrom = monthStart(
    s.trialEndsAt ? firstPaidPeriod(s) : "1970-01",
    s.timeZone
  );
  const unbilled = s.seatChanges
    .filter((c) => c.invoicedIn === null && c.amount > 0 && c.at >= paidFrom)
    .sort(
      (a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id)
    );
  for (const c of unbilled) {
    const tariff = s.tariffs[c.tariffId];
    if (tariff) {
      lines.push(
        line(`surcharge:${c.id}`, "surcharge", tariff, 1, c.amount, c.amount)
      );
    }
  }
  if (lines.length === 0) {
    return null;
  }
  const { year, month } = {
    year: Number(period.slice(0, 4)),
    month: Number(period.slice(5)),
  };
  const nominalDue = zonedInstant(s.timeZone, year, month, s.settings.dueDay);
  const minDue = startOfLocalDayPlus(now, s.timeZone, s.settings.minNoticeDays);
  const dueAt = nominalDue > minDue ? nominalDue : minDue;
  const net = lines.reduce((a, l) => a + l.net, 0);
  const vat = lines.reduce((a, l) => a + l.vat, 0);
  const invoice: Invoice = {
    billedSeats,
    dueAt,
    issuedAt: now,
    lines,
    net,
    paidAt: null,
    period,
    status: "issued",
    total: net + vat,
    vat,
  };
  return {
    invoice,
    key: `invoice:${s.orgId}:${period}`,
    kind: "issueInvoice",
    late: basis === "current",
    orgId: s.orgId,
    period,
  };
};

/** Reminder days of one audience → the one that is due now: the latest, never one sent before the invoice existed. */
const dueReminder = (
  s: OrgBillingState,
  inv: Invoice,
  days: number[],
  now: Date
) => {
  const due = localParts(inv.dueAt, s.timeZone);
  const issuedKey = dateKey(localParts(inv.issuedAt, s.timeZone));
  let best: { n: number; at: Date } | null = null;
  for (const n of days) {
    const d = new Date(Date.UTC(due.year, due.month - 1, due.day - n));
    const day = {
      day: d.getUTCDate(),
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
    };
    const at = zonedInstant(
      s.timeZone,
      day.year,
      day.month,
      day.day,
      s.settings.reminderHour
    );
    // After the issue date (the invoice notice itself goes out that day), already reached, and not after the due date.
    if (dateKey(day) > issuedKey && at <= now && now < inv.dueAt) {
      if (!best || at > best.at) {
        best = { at, n };
      }
    }
  }
  return best;
};

// ───────────────────────────── tick

export const tick = (state: OrgBillingState, now: Date): BillingAction[] => {
  validate(state);
  const out: BillingAction[] = [];
  let s = state;
  const emit = (a: BillingAction | null) => {
    if (a && !s.applied.has(a.key)) {
      out.push(a);
      s = apply(s, a);
    }
  };
  const local = localParts(now, s.timeZone);
  const current = periodKey(local.year, local.month);

  // 1. Rollover on the 1st: once for the running month, however late the tick is.
  if (s.lastRollover < current) {
    emit(planRollover(s, current));
  }

  // 2. Due date: the invoice becomes overdue, and an active organization is disabled for it.
  for (const inv of s.invoices) {
    if (inv.status === "issued" && inv.dueAt <= now) {
      emit({
        key: `overdue:${s.orgId}:${inv.period}`,
        kind: "markOverdue",
        orgId: s.orgId,
        period: inv.period,
      });
    }
  }
  const overdue = s.invoices.find((i) => i.status === "overdue");
  if (overdue && s.status === "active") {
    emit({
      effectiveAt: overdue.dueAt,
      key: `disable:${s.orgId}:${overdue.period}`,
      kind: "disableOrg",
      orgId: s.orgId,
      period: overdue.period,
      reason: "unpaid",
    });
  }

  // 3. Invoices: not for a disabled organization.
  if (s.status === "active") {
    const paidFrom = firstPaidPeriod(s);
    // The month is running and has no invoice (the tick was down on the 25th, or the organization was disabled):
    // a late invoice with a few days to pay. A month the organization started in is billed by surcharges instead.
    if (
      !hasInvoice(s, current) &&
      current >= paidFrom &&
      s.billingStartedAt < monthStart(current, s.timeZone)
    ) {
      emit(planInvoice(s, current, now, "current"));
    }
    const next = nextPeriod(current);
    const invoiceFrom = zonedInstant(
      s.timeZone,
      local.year,
      local.month,
      s.settings.invoiceDay
    );
    if (now >= invoiceFrom && !hasInvoice(s, next) && next >= paidFrom) {
      emit(planInvoice(s, next, now, "next"));
    }
  }

  // 4. Reminders on invoices that are still to be paid.
  if (s.status === "active") {
    for (const inv of s.invoices) {
      if (inv.status !== "issued") {
        continue;
      }
      for (const [to, days] of [
        ["owner", s.settings.ownerReminderDays],
        ["superuser", s.settings.superuserReminderDays],
      ] as const) {
        const r = dueReminder(s, inv, days, now);
        if (r) {
          emit({
            daysBefore: r.n,
            dueAt: inv.dueAt,
            key: `notify:${to}:${r.n}d:${s.orgId}:${inv.period}`,
            kind: "notify",
            orgId: s.orgId,
            period: inv.period,
            to,
            total: inv.total,
          });
        }
      }
    }
  }
  return out;
};

// ───────────────────────────── effect of actions on the snapshot

export const apply = (
  s: OrgBillingState,
  a: BillingAction
): OrgBillingState => {
  const applied = new Set(s.applied).add(a.key);
  switch (a.kind) {
    case "rollover": {
      const seats = { ...s.seats };
      for (const [id, n] of Object.entries(a.seatsAfter)) {
        const row = seats[id];
        if (row) {
          seats[id] = { ...row, seats: n };
        }
      }
      return {
        ...s,
        applied,
        lastRollover: a.period,
        seatChanges: [...s.seatChanges, ...a.changes],
        seats,
      };
    }
    case "issueInvoice": {
      const billed = new Set(
        a.invoice.lines
          .filter((l) => l.kind === "surcharge")
          .map((l) => l.id.slice("surcharge:".length))
      );
      return {
        ...s,
        applied,
        invoices: [...s.invoices, a.invoice],
        seatChanges: s.seatChanges.map((c) =>
          billed.has(c.id) ? { ...c, invoicedIn: a.period } : c
        ),
      };
    }
    case "markOverdue":
      return {
        ...s,
        applied,
        invoices: s.invoices.map((i) =>
          i.period === a.period ? { ...i, status: "overdue" } : i
        ),
      };
    case "disableOrg":
      return { ...s, applied, disabledReason: a.reason, status: "disabled" };
    case "markPaid":
      return {
        ...s,
        applied,
        invoices: s.invoices.map((i) =>
          i.period === a.period ? { ...i, paidAt: a.paidAt, status: "paid" } : i
        ),
      };
    case "enableOrg":
      return { ...s, applied, disabledReason: null, status: "active" };
    case "notify":
      return { ...s, applied };
    default:
      return s;
  }
};

/** «Оплачен»: marks the invoice and, if the organization was disabled for non-payment and nothing else is overdue, enables it. */
export const markPaid = (
  state: OrgBillingState,
  period: string,
  now: Date
): BillingAction[] => {
  const inv = state.invoices.find((i) => i.period === period);
  if (!inv || inv.status === "paid") {
    return [];
  }
  const paid: BillingAction = {
    key: `paid:${state.orgId}:${period}`,
    kind: "markPaid",
    orgId: state.orgId,
    paidAt: now,
    period,
  };
  if (state.applied.has(paid.key)) {
    return [];
  }
  const after = apply(state, paid);
  const restOverdue = after.invoices.some((i) => i.status === "overdue");
  if (
    after.status === "disabled" &&
    after.disabledReason === "unpaid" &&
    !restOverdue
  ) {
    return [
      paid,
      {
        key: `enable:${state.orgId}:${period}`,
        kind: "enableOrg",
        orgId: state.orgId,
        period,
      },
    ];
  }
  return [paid];
};

/** Applies a list of actions in order. */
export const applyAll = (s: OrgBillingState, actions: BillingAction[]) =>
  actions.reduce(apply, s);
