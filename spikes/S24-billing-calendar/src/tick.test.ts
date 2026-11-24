import { describe, expect, it } from "vitest";

import {
  addSeatsSurcharge,
  applyAll,
  markPaid,
  tick,
  upgradeSurcharge,
} from "./billing";
import type {
  BillingAction,
  Invoice,
  OrgBillingState,
  SeatChange,
} from "./billing";
import { NORMAL, PRO, org } from "./fixtures";
import {
  localParts,
  monthStart,
  nextPeriod,
  periodKey,
  zonedInstant,
} from "./time";

const ZONES = [
  "Europe/Moscow", // no DST
  "Asia/Vladivostok", // no DST, +10
  "Europe/Berlin", // DST: 29 Mar and 25 Oct 2026 (the 25th is the invoice day!)
  "America/New_York", // DST: 8 Mar and 1 Nov 2026 (the 1st is the due day!)
  "Asia/Kolkata", // +5:30
];

/** Local wall time → instant. */
const at = (tz: string, y: number, m: number, d: number, h = 0, min = 0) =>
  zonedInstant(tz, y, m, d, h, min);
const minus = (d: Date, minutes: number) =>
  new Date(d.getTime() - minutes * 60_000);
const kinds = (a: BillingAction[]) => a.map((x) => x.kind);
const only = <K extends BillingAction["kind"]>(a: BillingAction[], kind: K) =>
  a.filter((x): x is Extract<BillingAction, { kind: K }> => x.kind === kind);

/** A settled invoice that does not disturb the case. */
const settled = (period: string, tz: string, paid = true): Invoice => ({
  billedSeats: { normal: 10 },
  dueAt: monthStart(period, tz),
  issuedAt: minus(monthStart(period, tz), 7 * 24 * 60),
  lines: [],
  net: 0,
  paidAt: paid ? monthStart(period, tz) : null,
  period,
  status: paid ? "paid" : "issued",
  total: 0,
  vat: 0,
});

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

describe.each(ZONES)("calendar in %s", (tz) => {
  describe.each(MONTHS)("month 2026-%i", (m) => {
    const cur = periodKey(2026, m);
    const next = nextPeriod(cur);
    const ny = m === 12 ? 2027 : 2026;
    const nm = m === 12 ? 1 : m + 1;

    it("invoice for the next month appears at 00:00 on the 25th, not a minute earlier", () => {
      const s = org({
        invoices: [settled(cur, tz)],
        lastRollover: cur,
        timeZone: tz,
      });
      const start = at(tz, 2026, m, 25);
      expect(kinds(tick(s, minus(start, 1)))).not.toContain("issueInvoice");
      const acts = tick(s, start);
      const inv = only(acts, "issueInvoice");
      expect(inv).toHaveLength(1);
      const i = inv[0]!.invoice;
      expect(i.period).toBe(next);
      // 10 × 1 000,00 + 22 % VAT
      expect([i.net, i.vat, i.total]).toEqual([1_000_000, 220_000, 1_220_000]);
      // due 00:00 on the 1st of the invoiced month (the first minute that exists)
      expect(i.dueAt).toEqual(monthStart(next, tz));
      expect(localParts(i.dueAt, tz)).toMatchObject({
        day: 1,
        month: nm,
        year: ny,
      });
    });

    it("rollover at 00:00 on the 1st, not a minute earlier", () => {
      const prev = periodKey(m === 1 ? 2025 : 2026, m === 1 ? 12 : m - 1);
      const s = org({
        invoices: [settled(cur, tz)],
        lastRollover: prev,
        seats: { normal: { occupied: 10, seats: 10, seatsNext: 12 } },
        timeZone: tz,
      });
      const start = monthStart(cur, tz);
      expect(kinds(tick(s, minus(start, 1)))).not.toContain("rollover");
      const r = only(tick(s, start), "rollover");
      expect(r).toHaveLength(1);
      expect(r[0]!.period).toBe(cur);
      expect(r[0]!.seatsAfter).toEqual({ normal: 12 });
    });

    it("an unpaid invoice disables the organization at 00:00 on the 1st; a paid one does not", () => {
      const due = monthStart(cur, tz);
      const unpaid = {
        ...settled(cur, tz, false),
        dueAt: due,
        issuedAt: minus(due, 6 * 24 * 60),
      };
      const s = org({
        invoices: [unpaid],
        lastRollover: cur,
        timeZone: tz,
      });
      const before = tick(s, minus(due, 1));
      expect(kinds(before)).not.toContain("disableOrg");
      expect(kinds(before)).not.toContain("markOverdue");
      const acts = tick(s, due);
      expect(kinds(acts)).toEqual(["markOverdue", "disableOrg"]);
      expect(only(acts, "disableOrg")[0]!.effectiveAt).toEqual(due);

      const paid = org({
        invoices: [settled(cur, tz, true)],
        lastRollover: cur,
        timeZone: tz,
      });
      expect(tick(paid, due)).toEqual([]);
    });
  });
});

describe("DST edge cases on the invoice and due days", () => {
  it("Berlin, 25 Oct 2026 (clocks go back at 03:00): one invoice, at 00:00 CEST, no second one after the 25-hour day", () => {
    const tz = "Europe/Berlin";
    const s = org({
      invoices: [settled("2026-10", tz)],
      lastRollover: "2026-10",
      timeZone: tz,
    });
    expect(kinds(tick(s, new Date("2026-10-24T21:59:00Z")))).toEqual([]);
    const first = tick(s, new Date("2026-10-24T22:00:00Z"));
    expect(kinds(first)).toEqual(["issueInvoice"]);
    const after = applyAll(s, first);
    // 02:30 CET, after the clock went back: nothing new
    expect(tick(after, new Date("2026-10-25T01:30:00Z"))).toEqual([]);
    expect(tick(after, new Date("2026-10-25T22:59:00Z"))).toEqual([]);
  });

  it("New York, 1 Nov 2026 (clocks go back at 02:00 EDT): due at 04:00Z, the day is 25 hours", () => {
    const tz = "America/New_York";
    const unpaid = {
      ...settled("2026-11", tz, false),
      dueAt: new Date("2026-11-01T04:00:00Z"),
    };
    const s = org({
      invoices: [unpaid],
      lastRollover: "2026-11",
      timeZone: tz,
    });
    expect(tick(s, new Date("2026-11-01T03:59:00Z"))).not.toContainEqual(
      expect.objectContaining({ kind: "disableOrg" })
    );
    expect(kinds(tick(s, new Date("2026-11-01T04:00:00Z")))).toContain(
      "disableOrg"
    );
  });

  it("America/Havana, invoice day 8 = 8 Mar 2026: 00:00 does not exist, the invoice comes at 01:00 CDT", () => {
    const tz = "America/Havana";
    const s = org({
      invoices: [settled("2026-03", tz)],
      lastRollover: "2026-03",
      settings: { ...org().settings, invoiceDay: 8 },
      timeZone: tz,
    });
    expect(tick(s, new Date("2026-03-08T04:59:00Z"))).toEqual([]);
    expect(kinds(tick(s, new Date("2026-03-08T05:00:00Z")))).toEqual([
      "issueInvoice",
    ]);
  });
});

describe("month length", () => {
  // Days between the invoice (25th) and the due date (1st): 4 in a 28-day month, 7 in a 31-day one.
  it.each([
    ["2026-02", 4],
    ["2028-02", 5], // leap
    ["2026-04", 6],
    ["2026-05", 7],
  ])("%s: %i days from invoice to due date", (cur, days) => {
    const tz = "Europe/Moscow";
    const [y, m] = cur.split("-").map(Number) as [number, number];
    const s = org({
      invoices: [settled(cur, tz)],
      lastRollover: cur,
      timeZone: tz,
    });
    const i = only(tick(s, at(tz, y, m, 25)), "issueInvoice")[0]!.invoice;
    expect((i.dueAt.getTime() - at(tz, y, m, 25).getTime()) / 86_400_000).toBe(
      days
    );
  });

  it("28-day February: the 5-days-before reminder falls before the invoice and is not sent; the 1-day one is", () => {
    const tz = "Europe/Moscow";
    let s = org({
      invoices: [settled("2027-02", tz)],
      lastRollover: "2027-02",
      timeZone: tz,
    });
    s = applyAll(s, tick(s, at(tz, 2027, 2, 25)));
    const sent = (t: Date) => {
      const acts = tick(s, t);
      s = applyAll(s, acts);
      return only(acts, "notify").map((n) => `${n.to}-${n.daysBefore}`);
    };
    expect(sent(at(tz, 2027, 2, 25, 12))).toEqual([]);
    expect(sent(at(tz, 2027, 2, 26, 9))).toEqual(["superuser-3"]); // 3 days before 1 Mar = 26 Feb
    expect(sent(at(tz, 2027, 2, 28, 9))).toEqual(["owner-1"]);
    expect(sent(at(tz, 2027, 2, 28, 15))).toEqual([]); // nothing twice
  });

  it("31-day month: reminders 5, 3 and 1 day before", () => {
    const tz = "Europe/Moscow";
    let s = org({
      invoices: [settled("2026-12", tz)],
      lastRollover: "2026-12",
      timeZone: tz,
    });
    s = applyAll(s, tick(s, at(tz, 2026, 12, 25)));
    const day = (d: number, h = 9) => {
      const acts = tick(s, at(tz, 2026, 12, d, h));
      s = applyAll(s, acts);
      return only(acts, "notify").map((n) => `${n.to}-${n.daysBefore}`);
    };
    expect(day(25, 12)).toEqual([]); // the day of issue
    expect(day(27, 8)).toEqual([]); // before 09:00
    expect(day(27)).toEqual(["owner-5"]); // due 1 Jan
    expect(day(29)).toEqual(["superuser-3"]);
    expect(day(31)).toEqual(["owner-1"]);
    expect(day(31, 20)).toEqual([]);
  });
});

describe("a tick that is late, skipped or repeated", () => {
  const tz = "Europe/Moscow";
  const base = () =>
    org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      timeZone: tz,
    });

  it("two days late on the 25th: the same invoice with the same due date", () => {
    const i = only(tick(base(), at(tz, 2026, 11, 27, 15)), "issueInvoice")[0]!
      .invoice;
    expect(i.total).toBe(1_220_000);
    expect(i.dueAt).toEqual(at(tz, 2026, 12, 1));
  });

  it("five days late (29 Nov): due date moves to give three days", () => {
    const i = only(tick(base(), at(tz, 2026, 11, 29, 15)), "issueInvoice")[0]!
      .invoice;
    expect(i.dueAt).toEqual(at(tz, 2026, 12, 2));
  });

  it("no tick from the 25th to 1 Dec: a late invoice for December, with rollover, and nobody is disabled", () => {
    const acts = tick(base(), at(tz, 2026, 12, 1, 0, 30));
    expect(kinds(acts)).toEqual(["rollover", "issueInvoice"]);
    const inv = only(acts, "issueInvoice")[0]!;
    expect(inv.late).toBe(true);
    expect(inv.invoice.period).toBe("2026-12");
    expect(inv.invoice.dueAt).toEqual(at(tz, 2026, 12, 4));
    // and it falls due, three days later
    const s = applyAll(base(), acts);
    expect(kinds(tick(s, at(tz, 2026, 12, 3, 23, 59)))).not.toContain(
      "disableOrg"
    );
    expect(kinds(tick(s, at(tz, 2026, 12, 4)))).toEqual([
      "markOverdue",
      "disableOrg",
    ]);
  });

  it("down for 3 weeks over the due date: disabled when it comes back, with the nominal moment, and no reminders after the due date", () => {
    let s = base();
    s = applyAll(s, tick(s, at(tz, 2026, 11, 25)));
    const acts = tick(s, at(tz, 2026, 12, 20));
    expect(kinds(acts)).toEqual(["rollover", "markOverdue", "disableOrg"]);
    expect(only(acts, "disableOrg")[0]!.effectiveAt).toEqual(
      at(tz, 2026, 12, 1)
    );
  });

  it("catching up reminders: only the latest owner reminder, never the older one as well", () => {
    let s = base();
    s = applyAll(s, tick(s, at(tz, 2026, 11, 25)));
    const n = only(tick(s, at(tz, 2026, 11, 30, 10)), "notify").map(
      (x) => `${x.to}-${x.daysBefore}`
    );
    expect(n).toEqual(["owner-1", "superuser-3"]);
  });

  it("a repeated tick at the same moment changes nothing", () => {
    for (const t of [
      at(tz, 2026, 11, 25),
      at(tz, 2026, 12, 1),
      at(tz, 2026, 12, 1, 12),
    ]) {
      let s = base();
      s = applyAll(s, tick(s, at(tz, 2026, 11, 25)));
      const first = tick(s, t);
      const after = applyAll(s, first);
      expect(tick(after, t)).toEqual([]);
      expect(
        tick(after, new Date(t.getTime() + 3_600_000)).filter(
          (a) => a.kind === "issueInvoice" || a.kind === "rollover"
        )
      ).toEqual([]);
    }
  });

  it("the keys alone stop a repeat when the state was not refreshed (stale snapshot)", () => {
    const s = base();
    const t = at(tz, 2026, 11, 25);
    const acts = tick(s, t);
    const keys = new Set(acts.map((a) => a.key));
    expect(tick({ ...s, applied: keys }, t)).toEqual([]);
  });

  it("the state alone stops a repeat when the keys were lost", () => {
    const s = base();
    const t = at(tz, 2026, 11, 25);
    const after = applyAll(s, tick(s, t));
    expect(tick({ ...after, applied: new Set() }, t)).toEqual([]);
  });

  it("an organization with several tariffs gets one action per kind", () => {
    const s = org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      seats: {
        normal: { occupied: 10, seats: 10, seatsNext: 10 },
        pro: { occupied: 2, seats: 2, seatsNext: 2 },
      },
      timeZone: tz,
    });
    const acts = tick(s, at(tz, 2026, 11, 25));
    expect(kinds(acts)).toEqual(["issueInvoice"]);
    const i = only(acts, "issueInvoice")[0]!.invoice;
    expect(i.lines.map((l) => l.id)).toEqual(["seats:normal", "seats:pro"]);
    expect(i.net).toBe(10 * NORMAL.price + 2 * PRO.price);
  });
});

describe("seats and surcharges", () => {
  const tz = "Europe/Moscow";
  const change = (
    id: string,
    tariffId: string,
    when: Date,
    kind: SeatChange["kind"],
    amount: number
  ): SeatChange => ({
    amount,
    at: when,
    id,
    invoicedIn: null,
    kind,
    tariffId,
  });

  it("ORGS-PLAN example: 12 × price + 2 × price × 13/30, VAT per line", () => {
    const when = at(tz, 2026, 11, 18, 12);
    const surcharge = addSeatsSurcharge(NORMAL, 2, when, tz);
    expect(surcharge).toBe(86_667);
    const s = org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      seatChanges: [change("c1", "normal", when, "add", surcharge)],
      seats: { normal: { occupied: 12, seats: 12, seatsNext: 12 } },
      timeZone: tz,
    });
    const acts = tick(s, at(tz, 2026, 11, 25));
    const i = only(acts, "issueInvoice")[0]!.invoice;
    expect(i.lines.map((l) => [l.id, l.amount, l.vat])).toEqual([
      ["seats:normal", 1_200_000, 264_000],
      ["surcharge:c1", 86_667, 19_067],
    ]);
    expect([i.net, i.vat, i.total]).toEqual([1_286_667, 283_067, 1_569_734]);
    // the change is billed once: the next invoice (a month later) has no surcharge
    let after = applyAll(s, acts);
    expect(after.seatChanges[0]!.invoicedIn).toBe("2026-12");
    after = applyAll(after, markPaid(after, "2026-12", at(tz, 2026, 11, 26)));
    after = applyAll(after, tick(after, at(tz, 2026, 12, 1)));
    after = applyAll(after, tick(after, at(tz, 2026, 12, 25)));
    const jan = after.invoices.find((x) => x.period === "2027-01")!;
    expect(jan.lines.map((l) => l.kind)).toEqual(["seats"]);
  });

  it("upgrade: difference of prices × the same share; downgrade is free and from the next month", () => {
    const when = at(tz, 2026, 11, 18, 12);
    // (3 000,00 − 1 000,00) × 13/30 = 866,67
    expect(upgradeSurcharge(NORMAL, PRO, when, tz)).toBe(86_667);
    expect(upgradeSurcharge(PRO, NORMAL, when, tz)).toBe(0);
  });

  it("the invoice charges max(owner's number, occupied): «в декабре 8 мест, а занято 10 — счёт за 10»", () => {
    const s = org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      seats: { normal: { occupied: 10, seats: 12, seatsNext: 8 } },
      timeZone: tz,
    });
    const i = only(tick(s, at(tz, 2026, 11, 25)), "issueInvoice")[0]!.invoice;
    expect(i.lines[0]).toMatchObject({ quantity: 10 });
    // two people were disabled before the 25th: 8
    const s2 = org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      seats: { normal: { occupied: 8, seats: 12, seatsNext: 8 } },
      timeZone: tz,
    });
    expect(
      only(tick(s2, at(tz, 2026, 11, 25)), "issueInvoice")[0]!.invoice.lines[0]
    ).toMatchObject({ quantity: 8 });
  });

  it("a seat added after the invoice (28 Nov): November share by surcharge, December by the rollover — nothing is lost, nothing twice", () => {
    const base = org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      timeZone: tz,
    });
    let s = applyAll(base, tick(base, at(tz, 2026, 11, 25))); // invoice for December: 10 seats
    s = applyAll(s, markPaid(s, "2026-12", at(tz, 2026, 11, 26)));
    const when = at(tz, 2026, 11, 28, 10);
    s = {
      ...s,
      seatChanges: [
        ...s.seatChanges,
        change(
          "c9",
          "normal",
          when,
          "add",
          addSeatsSurcharge(NORMAL, 1, when, tz)
        ),
      ],
      seats: { normal: { occupied: 11, seats: 11, seatsNext: 11 } },
    };
    expect(s.seatChanges[0]!.amount).toBe(10_000); // 3 of 30 days
    const roll = tick(s, at(tz, 2026, 12, 1));
    expect(only(roll, "rollover")[0]!.changes).toEqual([
      expect.objectContaining({
        amount: 100_000,
        id: "rollover:org1:2026-12:normal",
      }),
    ]);
    s = applyAll(s, roll);
    s = applyAll(s, tick(s, at(tz, 2026, 12, 25)));
    const jan = s.invoices.find((x) => x.period === "2027-01")!;
    expect(jan.lines.map((l) => [l.id, l.amount])).toEqual([
      ["seats:normal", 1_100_000],
      ["surcharge:c9", 10_000],
      ["surcharge:rollover:org1:2026-12:normal", 100_000],
    ]);
  });

  it("nobody added after the invoice: the rollover bills nothing and is silent when seats did not change", () => {
    const base = org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      timeZone: tz,
    });
    let s = applyAll(base, tick(base, at(tz, 2026, 11, 25)));
    const roll = only(tick(s, at(tz, 2026, 12, 1)), "rollover")[0]!;
    expect(roll.changes).toEqual([]);
    s = applyAll(s, [roll]);
    expect(s.lastRollover).toBe("2026-12");
  });

  it("fewer seats next month: rollover lowers seats, nothing is returned", () => {
    const s = org({
      invoices: [settled("2026-12", tz)],
      lastRollover: "2026-11",
      seats: { normal: { occupied: 6, seats: 10, seatsNext: 8 } },
      timeZone: tz,
    });
    const r = only(tick(s, at(tz, 2026, 12, 1)), "rollover")[0]!;
    expect(r.seatsAfter).toEqual({ normal: 8 });
    expect(r.changes[0]!.amount).toBe(0);
  });

  it("VAT included in the price: the surcharge keeps the gross amount", () => {
    const incl = { ...NORMAL, vat: { included: true, rateBp: 2200 } };
    const s = org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      seats: { normal: { occupied: 10, seats: 10, seatsNext: 10 } },
      tariffs: { normal: incl, pro: PRO },
      timeZone: tz,
    });
    const i = only(tick(s, at(tz, 2026, 11, 25)), "issueInvoice")[0]!.invoice;
    expect([i.net, i.vat, i.total]).toEqual([
      819_672 + 0 * 1,
      180_328,
      1_000_000,
    ]);
  });
});

describe("who is billed", () => {
  const tz = "Europe/Moscow";

  it("trial until 12 Dec: no invoice for December; the first is for January, and December's changes are not billed", () => {
    const when = at(tz, 2026, 12, 15, 12);
    const s = org({
      invoices: [],
      lastRollover: "2026-11",
      seatChanges: [
        {
          amount: 5_000,
          at: when,
          id: "t1",
          invoicedIn: null,
          kind: "add",
          tariffId: "normal",
        },
      ],
      timeZone: tz,
      trialEndsAt: at(tz, 2026, 12, 12),
    });
    expect(tick(s, at(tz, 2026, 11, 25))).toEqual([]); // December is free: no invoice
    const s2 = s;
    expect(kinds(tick(s2, at(tz, 2026, 12, 1, 1)))).toEqual(["rollover"]); // no «late invoice» for the free month
    const rolled = applyAll(s2, tick(s2, at(tz, 2026, 12, 1, 1)));
    const jan = only(tick(rolled, at(tz, 2026, 12, 25)), "issueInvoice")[0]!
      .invoice;
    expect(jan.period).toBe("2027-01");
    expect(jan.lines.map((l) => l.kind)).toEqual(["seats"]);
  });

  it("trial that ends exactly at the month's start: December is billed", () => {
    const s = org({
      invoices: [],
      lastRollover: "2026-11",
      timeZone: tz,
      trialEndsAt: at(tz, 2026, 12, 1),
    });
    const i = only(tick(s, at(tz, 2026, 11, 25)), "issueInvoice")[0]!.invoice;
    expect(i.period).toBe("2026-12");
  });

  it("an organization created on 10 Dec has no late invoice for December; January is invoiced on the 25th with December's surcharges", () => {
    const when = at(tz, 2026, 12, 10, 12);
    const sur = addSeatsSurcharge(NORMAL, 10, when, tz);
    const s = org({
      billingStartedAt: when,
      invoices: [],
      lastRollover: "2026-12",
      seatChanges: [
        {
          amount: sur,
          at: when,
          id: "first",
          invoicedIn: null,
          kind: "add",
          tariffId: "normal",
        },
      ],
      timeZone: tz,
    });
    expect(tick(s, at(tz, 2026, 12, 11))).toEqual([]);
    const i = only(tick(s, at(tz, 2026, 12, 25)), "issueInvoice")[0]!.invoice;
    expect(i.period).toBe("2027-01");
    expect(i.lines.map((l) => [l.id, l.amount])).toEqual([
      ["seats:normal", 1_000_000],
      ["surcharge:first", sur],
    ]);
    expect(sur).toBe(Math.round((10 * 100_000 * 22) / 31)); // 22 of 31 days
  });

  it("an organization created on the 28th gets its December invoice at once, due on 1 Dec", () => {
    const when = at(tz, 2026, 11, 28, 12);
    const s = org({
      billingStartedAt: when,
      invoices: [],
      lastRollover: "2026-11",
      timeZone: tz,
    });
    const i = only(tick(s, at(tz, 2026, 11, 28, 13)), "issueInvoice")[0]!
      .invoice;
    expect(i.period).toBe("2026-12");
    expect(i.dueAt).toEqual(at(tz, 2026, 12, 1));
  });

  it("no seats: no invoice", () => {
    const s = org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      seats: { normal: { occupied: 0, seats: 0, seatsNext: 0 } },
      timeZone: tz,
    });
    expect(tick(s, at(tz, 2026, 11, 25))).toEqual([]);
  });

  it("a disabled organization gets no new invoices and no reminders, but its rollover goes on", () => {
    const s = org({
      disabledReason: "unpaid",
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      status: "disabled",
      timeZone: tz,
    });
    expect(tick(s, at(tz, 2026, 11, 25))).toEqual([]);
    expect(kinds(tick(s, at(tz, 2026, 12, 1)))).toEqual(["rollover"]);
  });

  it("disabled for non-payment, paid on 10 Jan: enabled, and the first tick after issues the late invoice for January", () => {
    const due = at(tz, 2026, 12, 1);
    let s = org({
      invoices: [{ ...settled("2026-12", tz, false), dueAt: due }],
      lastRollover: "2026-12",
      timeZone: tz,
    });
    s = applyAll(s, tick(s, due));
    s = applyAll(s, tick(s, at(tz, 2026, 12, 25))); // disabled: no January invoice
    expect(s.invoices.map((i) => i.period)).toEqual(["2026-12"]);
    s = applyAll(s, tick(s, at(tz, 2027, 1, 1))); // rollover only
    const t = at(tz, 2027, 1, 10, 12);
    s = applyAll(s, markPaid(s, "2026-12", t));
    expect(s.status).toBe("active");
    const acts = tick(s, t);
    expect(kinds(acts)).toEqual(["issueInvoice"]);
    const inv = only(acts, "issueInvoice")[0]!;
    expect([inv.late, inv.invoice.period, inv.invoice.dueAt]).toEqual([
      true,
      "2027-01",
      at(tz, 2027, 1, 13),
    ]);
  });

  it("disabled by hand with an overdue invoice: the invoice is marked, the organization is left as the superuser set it", () => {
    const due = at(tz, 2026, 12, 1);
    const s = org({
      disabledReason: "manual",
      invoices: [{ ...settled("2026-12", tz, false), dueAt: due }],
      lastRollover: "2026-12",
      status: "disabled",
      timeZone: tz,
    });
    expect(kinds(tick(s, due))).toEqual(["markOverdue"]);
  });

  it("the superuser enabled it by hand after the unpaid disable: it is not disabled again for the same invoice", () => {
    const due = at(tz, 2026, 12, 1);
    let s = org({
      invoices: [{ ...settled("2026-12", tz, false), dueAt: due }],
      lastRollover: "2026-12",
      timeZone: tz,
    });
    s = applyAll(s, tick(s, due));
    expect(s.status).toBe("disabled");
    s = { ...s, disabledReason: null, status: "active" };
    expect(tick(s, at(tz, 2026, 12, 2))).toEqual([]);
  });

  it("paid after the disable: enabled; with a second overdue invoice or a manual disable: not", () => {
    const due = at(tz, 2026, 12, 1);
    let s = org({
      invoices: [{ ...settled("2026-12", tz, false), dueAt: due }],
      lastRollover: "2026-12",
      timeZone: tz,
    });
    s = applyAll(s, tick(s, due));
    const paid = markPaid(s, "2026-12", at(tz, 2026, 12, 3));
    expect(kinds(paid)).toEqual(["markPaid", "enableOrg"]);
    expect(applyAll(s, paid)).toMatchObject({
      disabledReason: null,
      status: "active",
    });
    // repeated press of the button
    expect(markPaid(applyAll(s, paid), "2026-12", at(tz, 2026, 12, 3))).toEqual(
      []
    );
    // manual disable: not enabled by payment
    expect(
      kinds(markPaid({ ...s, disabledReason: "manual" }, "2026-12", due))
    ).toEqual(["markPaid"]);
    // another overdue invoice
    const two = {
      ...s,
      invoices: [
        ...s.invoices,
        { ...settled("2026-11", tz, false), status: "overdue" as const },
      ],
    };
    expect(kinds(markPaid(two, "2026-12", due))).toEqual(["markPaid"]);
  });

  it("paid in advance: no overdue, no disable, no reminders", () => {
    const due = at(tz, 2026, 12, 1);
    let s = org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      timeZone: tz,
    });
    s = applyAll(s, tick(s, at(tz, 2026, 11, 25)));
    s = applyAll(s, markPaid(s, "2026-12", at(tz, 2026, 11, 26)));
    expect(tick(s, at(tz, 2026, 11, 30, 12))).toEqual([]);
    expect(kinds(tick(s, due))).toEqual(["rollover"]);
  });

  it("bad settings and zones are refused, not guessed", () => {
    expect(() =>
      tick(org({ settings: { ...org().settings, invoiceDay: 29 } }), new Date())
    ).toThrow(RangeError);
    expect(() => tick(org({ timeZone: "Mars/Olympus" }), new Date())).toThrow();
    expect(() =>
      tick(
        org({ seats: { gold: { occupied: 1, seats: 1, seatsNext: 1 } } }),
        new Date()
      )
    ).toThrow(RangeError);
  });
});

describe("state in, nothing mutated", () => {
  it("tick does not change its input", () => {
    const tz = "Europe/Moscow";
    const s = org({
      invoices: [settled("2026-11", tz)],
      lastRollover: "2026-11",
      timeZone: tz,
    });
    const frozen = structuredClone({ ...s, applied: [...s.applied] });
    tick(s, at(tz, 2026, 11, 25));
    expect({ ...s, applied: [...s.applied] }).toEqual(frozen);
  });
});

export type { OrgBillingState };
