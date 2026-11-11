import "server-only";
import type {
  MemorySuggestion,
  MemorySuggestionReason,
} from "@metobe/contracts/memory";

import {
  dismissalKey,
  listDismissals,
  listEntities,
  listRecords,
} from "./memory";
import type { MemoryEntity, MemoryRecord } from "./memory";
import { groupMembers } from "./memory-groups";

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
  important: 6,
  overdue: 0,
  rhythm: 5,
  today: 3,
  tomorrow: 4,
  unconfirmed: 1,
  waiting: 2,
};

/** Working days after `from`, up to and including `to`: Saturdays and Sundays do not count. */
const workingDaysBetween = (from: string, to: string) => {
  let count = 0;
  const end = Date.parse(`${to}T00:00:00Z`);
  for (
    let at = Date.parse(`${from}T00:00:00Z`) + DAY_MS;
    at <= end;
    at += DAY_MS
  ) {
    const weekday = new Date(at).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      count += 1;
    }
  }
  return count;
};

type Rule = NonNullable<MemoryRecord["rule"]>;

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
  kind: Rule["kind"],
  self: ReadonlySet<string>,
  expand: (card: string) => string[] | null
) => {
  const direct = new Map<string, MemoryRecord>();
  const viaGroup = new Map<string, MemoryRecord>();
  for (const r of rules) {
    if (r.rule?.kind !== kind) {
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
  gone: { dueAt: Date | null; status: string | null } | undefined
) =>
  Boolean(gone) &&
  gone?.status === r.status &&
  (gone?.dueAt?.getTime() ?? null) === (r.dueAt?.getTime() ?? null);

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
const waitedTooLong = (
  r: MemoryRecord,
  debtor: string | undefined,
  waits: Map<string, MemoryRecord>,
  today: string,
  timeZone: string
) => {
  const by = ((debtor ? waits.get(debtor) : undefined) ?? waits.get(""))?.rule;
  if (!by) {
    return null;
  }
  const since = dayKey(r.givenAt ?? r.recordedAt, timeZone);
  const waited = by.workingDays
    ? workingDaysBetween(since, today)
    : daysBetween(since, today);
  return waited >= by.days ? waited : null;
};

/**
 * People a rhythm rule keeps in touch with, now longer without contact than it says: days since the last event with
 * them, or — none yet — since the rule was said. Taken away stays away until there is a new contact.
 */
const rhythmRows = (
  rules: MemoryRecord[],
  events: MemoryRecord[],
  cards: Map<string, MemoryEntity>,
  dismissed: Awaited<ReturnType<typeof listDismissals>>,
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
      if (!(card && card.kind !== "self" && r.rule)) {
        return [];
      }
      const contact = last.get(cardId) ?? null;
      const days = daysBetween(
        dayKey(contact ?? r.recordedAt, timeZone),
        today
      );
      const gone = dismissed.get(dismissalKey(r.id, cardId));
      const away =
        gone &&
        (gone.dueAt?.getTime() ?? null) === (contact?.getTime() ?? null);
      if (days < r.rule.days || away) {
        return [];
      }
      return [
        {
          days,
          dueAt: null,
          id: r.id,
          important: false,
          key: dismissalKey(r.id, cardId),
          kind: "rhythm",
          reason: "rhythm",
          rhythm: { every: r.rule.days, since: contact?.toISOString() ?? null },
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
    listRecords(ownerId, { kinds: ["rule"] }),
    listRecords(ownerId, { kinds: ["fact"] }),
  ]);
  const kinds = new Map(entities.map((e) => [e.id, e.kind]));
  const self = new Set(
    entities.filter((e) => e.kind === "self").map((e) => e.id)
  );
  const members = groupMembers(facts, now);
  const expand = (card: string) =>
    kinds.get(card) === "group" ? [...(members.get(card) ?? [])] : null;
  const rule = rulesByCard(rules, "rhythm", self, expand).get(cardId)?.rule;
  const live = events.filter((e) => e.kind === "event" && !e.supersededAt);
  return {
    every: rule?.days ?? null,
    last: lastContacts(live, now).get(cardId) ?? null,
  };
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
      listRecords(ownerId, { kinds: ["rule"] }),
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
    if (isDismissed(r, dismissed.get(r.id))) {
      return [];
    }
    const days = r.dueAt ? daysBetween(today, dayKey(r.dueAt, timeZone)) : null;
    const { side, who } = sidesOf(r, cards);
    const waited =
      side === "theirs" && !r.dueAt && r.status === "open"
        ? waitedTooLong(r, who?.id, waits, today, timeZone)
        : null;
    let reason = reasonOf(r, days);
    if (waited !== null && (!reason || reason === "important")) {
      reason = "waiting";
    }
    if (!reason) {
      return [];
    }
    return [
      {
        days: reason === "waiting" ? (waited ?? 0) : Math.max(0, -(days ?? 0)),
        dueAt: r.dueAt?.toISOString() ?? null,
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
  rows.push(
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
      b.days - a.days ||
      (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999")
  );
};
