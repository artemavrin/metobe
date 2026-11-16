import "server-only";
import type {
  MemorySuggestion,
  MemorySuggestionReason,
} from "@metobe/contracts/memory";

import { listMailboxes } from "./mailboxes";
import {
  listDismissals,
  listEntities,
  listMailWaits,
  listRecords,
  writeChats,
} from "./memory";
import type { Dismissals, MemoryEntity, MemoryRecord } from "./memory";
import { groupMembers } from "./memory-groups";
import { DEFAULT_WAIT, waitedPast, workingDaysBetween } from "./memory-mail";
import { REACH, nextRepeat } from "./memory-repeat";

// «Не упустить» on the new chat screen (ARCH §19.6, P17): open commitments that need the person now — past their day,
// due today or tomorrow, said to be done by someone else, marked important, or waiting for others longer than a rule
// allows («ответа ждём пять рабочих дней») — and people the person wants to be in touch with more often than they have
// been («один на один раз в две недели»). Gathered by plain reads when the screen opens, without a model.

/** Days in the person's zone: `2026-11-09`. */
export const dayKey = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(at);

const DAY_MS = 24 * 60 * 60 * 1000;
export const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  );

const ORDER: Record<MemorySuggestionReason, number> = {
  date: 3.5,
  important: 6,
  overdue: 0,
  reminded: 2.5,
  rhythm: 5,
  today: 3,
  tomorrow: 4,
  unconfirmed: 1,
  waiting: 2,
};

/** What is kept per card: how long a reply may take (a rule), how often to be in touch (a schedule, D45). */
type PerCard = "wait" | "rhythm";

const perCardOf = (r: MemoryRecord): PerCard | null => {
  if (r.rule?.kind === "wait") {
    return "wait";
  }
  return r.schedule?.kind === "rhythm" ? "rhythm" : null;
};

/** A rhythm's period: every how many days. */
const rhythmOf = (r: MemoryRecord) =>
  r.schedule?.kind === "rhythm" ? r.schedule : null;

/**
 * A rule's cards: whom it is about (none — anyone). The person's own card is not one: «если контрагент не отвечает…»
 * came back about «user», and means anyone.
 */
const subjectsOf = (r: MemoryRecord, self: ReadonlySet<string>) =>
  r.entities
    .filter(
      (e) =>
        (e.role === "subject" || e.role === "about") && !self.has(e.entityId)
    )
    .map((e) => e.entityId);

/** Keeps the newer of two rules for a card. */
const keepNewer = (
  map: Map<string, MemoryRecord>,
  card: string,
  r: MemoryRecord
) => {
  const had = map.get(card);
  if (!had || had.recordedAt < r.recordedAt) {
    map.set(card, r);
  }
};

/**
 * The rule of a kind for each card: the newest naming it, and the newest naming none (`""`) — «теперь раз в неделю»
 * said later wins over «раз в две недели», without anyone closing the old one. A group a rule names (`expand`) stands
 * for whoever is in it now; a rule naming the person themselves wins over their group's.
 */
const rulesByCard = (
  rules: MemoryRecord[],
  kind: PerCard,
  self: ReadonlySet<string>,
  expand: (card: string) => string[] | null
) => {
  const direct = new Map<string, MemoryRecord>();
  const viaGroup = new Map<string, MemoryRecord>();
  for (const r of rules) {
    if (perCardOf(r) !== kind) {
      continue;
    }
    const cards = subjectsOf(r, self);
    for (const card of cards.length > 0 ? cards : [""]) {
      const members = expand(card);
      if (members) {
        for (const member of members) {
          keepNewer(viaGroup, member, r);
        }
      } else {
        keepNewer(direct, card, r);
      }
    }
  }
  return new Map([...viaGroup, ...direct]);
};

/** The latest event each card took part in, up to now: «давно не было» counts from when it happened. */
const lastContacts = (events: MemoryRecord[], now: Date) => {
  const last = new Map<string, Date>();
  for (const e of events) {
    if (!e.occurredAt || e.occurredAt > now) {
      continue;
    }
    for (const { entityId } of e.entities) {
      const had = last.get(entityId);
      if (!had || had < e.occurredAt) {
        last.set(entityId, e.occurredAt);
      }
    }
  }
  return last;
};

/** Why it is in the list today, if it is: the first that fits of past due, said done, today, tomorrow, important. */
const reasonOf = (
  r: MemoryRecord,
  days: number | null
): MemorySuggestionReason | null => {
  if (days !== null && days < 0) {
    return "overdue";
  }
  if (r.status === "unconfirmed") {
    return "unconfirmed";
  }
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "tomorrow";
  }
  return r.important ? "important" : null;
};

/** Taken away while its deadline and status were these: not again until one of them changes. */
const isDismissed = (
  r: MemoryRecord,
  gone: { asOf: Date | null; status: string | null } | undefined
) =>
  Boolean(gone) &&
  gone?.status === r.status &&
  (gone?.asOf?.getTime() ?? null) === (r.dueAt?.getTime() ?? null);

/** Who is on the other side: the debtor when the person is owed, the creditor when the person owes. */
export const sidesOf = (r: MemoryRecord, cards: Map<string, MemoryEntity>) => {
  const card = (role: "debtor" | "creditor") =>
    cards.get(r.entities.find((e) => e.role === role)?.entityId ?? "");
  const debtor = card("debtor");
  const creditor = card("creditor");
  if (creditor?.kind === "self") {
    return { side: "theirs" as const, who: debtor };
  }
  if (debtor?.kind === "self") {
    return { side: "mine" as const, who: creditor };
  }
  return { side: "between" as const, who: debtor };
};

export const cardOf = (who: MemoryEntity | undefined) =>
  who && who.kind !== "self"
    ? { id: who.id, kind: who.kind, name: who.name }
    : null;

/**
 * Days someone has kept the person waiting with no deadline, if that is longer than the wait rule for them (or the one
 * for anyone) allows; null when no rule says or it is not that long yet.
 */
/** The wait rule for a debtor: theirs, else the one for anyone; undefined — no rule says. */
const waitOf = (waits: Map<string, MemoryRecord>, debtor: string | undefined) =>
  ((debtor ? waits.get(debtor) : undefined) ?? waits.get(""))?.rule;

/** Days from `since` to `today` as a wait counts them: working days or all. */
const waitedSince = (
  since: string,
  today: string,
  by: { workingDays?: boolean | null }
) =>
  by.workingDays ? workingDaysBetween(since, today) : daysBetween(since, today);

const waitedTooLong = (
  r: MemoryRecord,
  debtor: string | undefined,
  waits: Map<string, MemoryRecord>,
  today: string,
  timeZone: string
) => {
  const by = waitOf(waits, debtor);
  if (!by) {
    return null;
  }
  const waited = waitedSince(
    dayKey(r.givenAt ?? r.recordedAt, timeZone),
    today,
    by
  );
  return waited >= by.days ? waited : null;
};

/** How long an answer to a reminder letter is waited for when no rule says: five working days (D41). */
const REMINDED_WAIT = { days: 5, workingDays: true };

/**
 * A promise the person reminded of by letter (Г2.4): `hold` — the one who owes still has the wait to answer (their
 * wait rule, or anyone's, or five working days), so the row is away; a number — the wait is over with no change, the
 * row is back, days since the letter; null — no letter, or the deadline or status changed since, so it counts as any.
 */
const afterReminder = (
  r: MemoryRecord,
  letter: { at: Date; asOf: Date | null; status: string | null } | undefined,
  by: { days: number; workingDays?: boolean | null },
  today: string,
  timeZone: string
): "hold" | number | null => {
  if (
    !letter ||
    letter.status !== r.status ||
    (letter.asOf?.getTime() ?? null) !== (r.dueAt?.getTime() ?? null)
  ) {
    return null;
  }
  const waited = waitedSince(dayKey(letter.at, timeZone), today, by);
  return waited < by.days ? "hold" : waited;
};

/**
 * People a rhythm rule keeps in touch with, now longer without contact than it says: days since the last event with
 * them, or — none yet — since the rule was said. Taken away stays away until there is a new contact.
 */
const rhythmRows = (
  rules: MemoryRecord[],
  events: MemoryRecord[],
  cards: Map<string, MemoryEntity>,
  dismissed: Dismissals,
  {
    expand,
    now,
    timeZone,
    today,
  }: {
    expand: (card: string) => string[] | null;
    now: Date;
    timeZone: string;
    today: string;
  }
): MemorySuggestion[] => {
  const last = lastContacts(events, now);
  const self = new Set(
    [...cards.values()].filter((e) => e.kind === "self").map((e) => e.id)
  );
  return [...rulesByCard(rules, "rhythm", self, expand)].flatMap(
    ([cardId, r]) => {
      const card = cards.get(cardId);
      const rhythm = rhythmOf(r);
      if (!(card && card.kind !== "self" && rhythm)) {
        return [];
      }
      const contact = last.get(cardId) ?? null;
      const days = daysBetween(
        dayKey(contact ?? r.recordedAt, timeZone),
        today
      );
      const gone = dismissed.get({
        entityId: cardId,
        kind: "rhythm",
        recordId: r.id,
      });
      const away =
        gone && (gone.asOf?.getTime() ?? null) === (contact?.getTime() ?? null);
      if (days < rhythm.days || away) {
        return [];
      }
      return [
        {
          days,
          dueAt: null,
          id: r.id,
          important: false,
          key: `${r.id}:${cardId}`,
          kind: "rhythm",
          reason: "rhythm",
          rhythm: { every: rhythm.days, since: contact?.toISOString() ?? null },
          side: "mine",
          status: null,
          text: r.text,
          who: cardOf(card),
        },
      ];
    }
  );
};

/**
 * Days that come again, near enough to say so (ARCH §19.8.7): a birthday three days before, a monthly or weekly day
 * today and tomorrow. «Уже сделано» (a `date` dismissal for that day) keeps the day away until the next one.
 */
const dateRows = (
  rules: MemoryRecord[],
  cards: Map<string, MemoryEntity>,
  dismissed: Dismissals,
  { timeZone, today }: { timeZone: string; today: string }
): MemorySuggestion[] => {
  const self = new Set(
    [...cards.values()].filter((e) => e.kind === "self").map((e) => e.id)
  );
  return rules.flatMap((r): MemorySuggestion[] => {
    const repeat = r.schedule?.kind === "date" ? r.schedule.repeat : undefined;
    if (!(repeat && r.occurredAt)) {
      return [];
    }
    const day = nextRepeat(dayKey(r.occurredAt, timeZone), repeat, today);
    const ahead = daysBetween(today, day);
    if (
      ahead > REACH[repeat] ||
      dismissed.has({ day, kind: "date", recordId: r.id })
    ) {
      return [];
    }
    const [subject] = subjectsOf(r, self);
    return [
      {
        date: { day, repeat },
        days: ahead,
        dueAt: null,
        id: r.id,
        important: false,
        key: `date:${r.id}:${day}`,
        kind: "date",
        reason: "date",
        rhythm: null,
        side: "mine",
        status: null,
        text: r.text,
        who: cardOf(subject ? cards.get(subject) : undefined),
      },
    ];
  });
};

/**
 * Letters the person sent with no answer longer than the wait rule for whom they went to (or for anyone, or five
 * working days) — Г3.1. «Убрать» keeps one away until the person writes again in the thread.
 */
const mailRows = async (
  ownerId: string,
  cards: Map<string, MemoryEntity>,
  dismissed: Dismissals,
  {
    waits,
    timeZone,
    today,
  }: { waits: Map<string, MemoryRecord>; timeZone: string; today: string }
): Promise<MemorySuggestion[]> => {
  const letters = await listMailWaits(ownerId);
  if (letters.length === 0) {
    return [];
  }
  const owned = await listMailboxes(ownerId);
  const boxes = new Map(owned.map((b) => [b.id, b.address]));
  return letters.flatMap((w): MemorySuggestion[] => {
    const card = cards.get(w.entityId);
    const box = boxes.get(w.mailboxId);
    const gone = dismissed.get({
      kind: "mail",
      letter: w.key,
      mailboxId: w.mailboxId,
    });
    const rule = waitOf(waits, w.entityId) ?? DEFAULT_WAIT;
    const days = waitedPast(dayKey(w.sentAt, timeZone), today, rule);
    if (
      !(card && box) ||
      days === null ||
      gone?.asOf?.getTime() === w.sentAt.getTime()
    ) {
      return [];
    }
    return [
      {
        days,
        dueAt: null,
        email: w.to,
        id: w.id,
        important: false,
        key: `mail:${w.mailboxId}:${w.key}`,
        kind: "mail",
        mail: {
          box,
          sentAt: w.sentAt.toISOString(),
          subject: w.subject,
          workingDays: Boolean(rule.workingDays),
        },
        reason: "waiting",
        rhythm: null,
        side: "theirs",
        status: null,
        text: w.subject,
        who: cardOf(card),
      },
    ];
  });
};

/**
 * A card's «что сейчас» (P22): the last contact with it — the latest event it took part in, up to now — and how often a
 * rhythm rule wants one, in days (its own rule, or its group's). `events` — the card's own events.
 */
export const cardContact = async (
  ownerId: string,
  cardId: string,
  events: MemoryRecord[],
  entities: MemoryEntity[],
  now = new Date()
) => {
  const [rules, facts] = await Promise.all([
    listRecords(ownerId, { kinds: ["rule", "schedule"] }),
    listRecords(ownerId, { kinds: ["fact"] }),
  ]);
  const kinds = new Map(entities.map((e) => [e.id, e.kind]));
  const self = new Set(
    entities.filter((e) => e.kind === "self").map((e) => e.id)
  );
  const members = groupMembers(facts, now);
  const expand = (card: string) =>
    kinds.get(card) === "group" ? [...(members.get(card) ?? [])] : null;
  const found = rulesByCard(rules, "rhythm", self, expand).get(cardId);
  const rule = found ? rhythmOf(found) : null;
  const live = events.filter((e) => e.kind === "event" && !e.supersededAt);
  return {
    every: rule?.days ?? null,
    last: lastContacts(live, now).get(cardId) ?? null,
  };
};

/** What a reminder to the other side needs of a promise: when it was given, and where to write to them. */
const reminderOf = (r: MemoryRecord, who: MemoryEntity | undefined) => ({
  email: who?.email ?? null,
  givenAt: r.givenAt?.toISOString() ?? null,
});

/** Where each promise was said: the chat of the message that put it in, for a reminder to point back to. */
const attachChats = async (
  ownerId: string,
  records: MemoryRecord[],
  rows: MemorySuggestion[]
) => {
  const writes = await writeChats(
    ownerId,
    records.flatMap((r) => (r.writeId ? [r.writeId] : []))
  );
  const chatOf = new Map(
    records.map((r) => [
      r.id,
      (r.writeId && writes.get(r.writeId)?.chatId) || null,
    ])
  );
  for (const row of rows) {
    if (row.kind === "commitment") {
      row.chatId = chatOf.get(row.id) ?? null;
    }
  }
};

/** The row's number: days since the letter, of waiting, or past the deadline. */
const daysOfRow = (
  reason: MemorySuggestionReason,
  {
    days,
    reminded,
    waited,
  }: { days: number | null; reminded: number | null; waited: number | null }
) => {
  if (reason === "reminded") {
    return reminded ?? 0;
  }
  return reason === "waiting" ? (waited ?? 0) : Math.max(0, -(days ?? 0));
};

/** The rows, «важно» first, then past due (the longest first), said done, today, tomorrow, the rest important. */
export const todaySuggestions = async (
  ownerId: string,
  timeZone: string,
  now = new Date()
): Promise<MemorySuggestion[]> => {
  const [records, rules, events, facts, entities, dismissed] =
    await Promise.all([
      listRecords(ownerId, { kinds: ["commitment"] }),
      listRecords(ownerId, { kinds: ["rule", "schedule"] }),
      listRecords(ownerId, { kinds: ["event"] }),
      listRecords(ownerId, { kinds: ["fact"] }),
      listEntities(ownerId),
      listDismissals(ownerId),
    ]);
  const cards = new Map(entities.map((e) => [e.id, e]));
  const today = dayKey(now, timeZone);
  const self = new Set(
    entities.filter((e) => e.kind === "self").map((e) => e.id)
  );
  // A group in a rule is whoever is in it now (core/memory-groups).
  const members = groupMembers(facts, now);
  const expand = (card: string) =>
    cards.get(card)?.kind === "group" ? [...(members.get(card) ?? [])] : null;
  const waits = rulesByCard(rules, "wait", self, expand);
  const rows = records.flatMap((r): MemorySuggestion[] => {
    if (r.status !== "open" && r.status !== "unconfirmed") {
      return [];
    }
    if (isDismissed(r, dismissed.get({ kind: "commitment", recordId: r.id }))) {
      return [];
    }
    const days = r.dueAt ? daysBetween(today, dayKey(r.dueAt, timeZone)) : null;
    const { side, who } = sidesOf(r, cards);
    const reminded = afterReminder(
      r,
      dismissed.get({ kind: "reminded", recordId: r.id }),
      waitOf(waits, who?.id) ?? REMINDED_WAIT,
      today,
      timeZone
    );
    if (reminded === "hold") {
      return [];
    }
    const waited =
      side === "theirs" && !r.dueAt && r.status === "open"
        ? waitedTooLong(r, who?.id, waits, today, timeZone)
        : null;
    let reason = reasonOf(r, days);
    if (waited !== null && (!reason || reason === "important")) {
      reason = "waiting";
    }
    // Back after a letter with no answer: that is what is said, whatever else is true of it.
    if (reminded !== null) {
      reason = "reminded";
    }
    if (!reason) {
      return [];
    }
    return [
      {
        days: daysOfRow(reason, { days, reminded, waited }),
        dueAt: r.dueAt?.toISOString() ?? null,
        ...reminderOf(r, who),
        id: r.id,
        important: r.important,
        key: r.id,
        kind: "commitment",
        reason,
        rhythm: null,
        side,
        status: r.status,
        text: r.text,
        who: cardOf(who),
      },
    ];
  });
  await attachChats(ownerId, records, rows);
  rows.push(
    ...(await mailRows(ownerId, cards, dismissed, { timeZone, today, waits })),
    ...dateRows(rules, cards, dismissed, { timeZone, today }),
    ...rhythmRows(rules, events, cards, dismissed, {
      expand,
      now,
      timeZone,
      today,
    })
  );
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own array
  return rows.sort(
    (a, b) =>
      Number(b.important) - Number(a.important) ||
      ORDER[a.reason] - ORDER[b.reason] ||
      (a.reason === "date" ? a.days - b.days : b.days - a.days) ||
      (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999")
  );
};
