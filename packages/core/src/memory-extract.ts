import type {
  MemoryEntityKind,
  MemoryPrecision,
  MemoryRole,
} from "@metobe/contracts/memory";
import { z } from "zod";

import type { MemoryWritePlan } from "./memory";

// The silent writer's side of ARCH §19.4, free of the DB so it can be tested directly: what the «Память» model is
// asked (prompt v2 of S13, which every model needed: «ждём ответа» is the other side's commitment, a commitment's
// `when` is not its deadline, everyone mentioned gets a ref), and how its answer becomes a plan for the store.

// The keys keep the order of S13, not the alphabet: a model writes them in this order, and the order is part of the
// prompt — the kind before the text, the new cards before the records that point at them. Sorted, Gemini Flash-Lite
// fell from 100 % to 83 % of records on the S13 set: events became commitments, new people went unnamed.
/* oxlint-disable sort-keys */
const when = z
  .object({
    date: z
      .string()
      .describe(
        "YYYY-MM-DD. For a week — the middle of it; for a month — its first day; for a year — 1 January"
      ),
    precision: z.enum(["day", "week", "month", "year"]),
  })
  .nullable();

export const extractionSchema = z.object({
  new_entities: z
    .array(
      z.object({
        id: z.string().describe("new:<latin-slug>"),
        kind: z.enum(["person", "organization", "project"]),
        name: z.string(),
        about: z.string().describe("Who it is to the user, one line"),
      })
    )
    .describe(
      "People, organizations and projects mentioned that are not among the known cards"
    ),
  asks: z
    .array(
      z.object({
        id: z.string().describe("ask:<latin-slug>"),
        name: z.string().describe("How the message calls them: «Андрей»"),
        candidates: z
          .array(z.string())
          .describe("Refs of the known cards it could be — two or more"),
        question: z
          .string()
          .describe(
            "A short question to the user in the message's language, naming what was said: «Какой Андрей уходит в отпуск 10 ноября?»"
          ),
      })
    )
    .describe(
      "Mentions that fit two or more known cards when the message does not tell which. Items use the ask id as the ref"
    ),
  items: z.array(
    z.object({
      kind: z.enum(["fact", "assessment", "event", "commitment", "rule"]),
      text: z
        .string()
        .describe(
          "One short self-contained sentence in the message's language, with full names"
        ),
      about: z
        .array(z.string())
        .describe(
          'Refs: the subject of a fact, assessment or rule, the participants of an event, debtor and creditor of a commitment. Each one a known card ref, "user", a new_entities id or an asks id'
        ),
      debtor: z
        .string()
        .nullable()
        .describe("Commitment only: who has to do it"),
      creditor: z.string().nullable().describe("Commitment only: for whom"),
      when: when.describe(
        "Fact or assessment: since when it is true. Event: when it happened or is scheduled. Commitment: when it was given. Null if unknown"
      ),
      due: when.describe("Commitment only: the deadline, null if none"),
      interval_days: z
        .number()
        .nullable()
        .describe("Rule only: the period or threshold in days"),
    })
  ),
});
/* oxlint-enable sort-keys */
export type Extraction = z.infer<typeof extractionSchema>;

/** A card the model may point at, under a short ref («c3») instead of its id. */
export interface KnownCard {
  ref: string;
  id: string;
  kind: Exclude<MemoryEntityKind, "self">;
  name: string;
  aliases: string[];
  role: string | null;
}

const dayIn = (at: Date, timeZone: string) => ({
  iso: new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(at),
  text: new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone,
    weekday: "long",
    year: "numeric",
  }).format(at),
});

const cardLine = (c: KnownCard) => {
  const about = [
    c.kind === "org" ? "organization" : c.kind,
    c.role,
    c.aliases.length > 0 ? `also: ${c.aliases.join(", ")}` : null,
  ].filter(Boolean);
  return `- ${c.ref}: ${c.name} (${about.join("; ")})`;
};

/** «Today» is when the message was sent, in the person's zone: a write retried tomorrow still reads «вчера» right. */
export const memoryInstructions = ({
  sentAt,
  timeZone,
  cards,
}: {
  sentAt: Date;
  timeZone: string;
  cards: KnownCard[];
}) => {
  const today = dayIn(sentAt, timeZone);
  return `You maintain the long-term memory of one user of a work assistant. From the user's message inside <message> tags, extract what is worth remembering about their work: facts, assessments, events, commitments and the user's standing rules for the assistant.

Today is ${today.text} (${today.iso}), time zone ${timeZone}.

Known cards (ref: description):
${[...cards.map(cardLine), "- user: the user themselves"].join("\n")}

Rules:
- Kinds: fact — a lasting state or attribute (role, stage, preference, birthday); assessment — the user's own opinion or judgement of someone («часто срывает сроки»), never turned into a fact; event — something that happened or is scheduled at a time; commitment — someone owes someone an action, with or without a deadline; rule — the user's standing instruction about reminders or what to highlight.
- Refs: use a known card ref, "user", an id from new_entities or an id from asks. Pick a card only when the message makes it clear (a surname, a company, a role, the topic); a person not in the cards goes to new_entities. When a mention fits two or more known cards and nothing in the message tells which, do not guess: add it to asks with those cards as candidates, and use the ask id as the ref in the item (in about, debtor or creditor) instead of a card. The topic tells too: work on what a card is known for («API», «закупки») points at that card, and then it is not a question.
- Dates: resolve relative dates against today and against the moment they refer to («в прошлый вторник сказал, что через две недели» — two weeks from that Tuesday). Past tense with a weekday means the latest such day before today. Set precision honestly: «на днях» is a week, «в начале октября» is a month. Never invent a date that the message does not imply.
- In the text, turn a relative date the message gives into an absolute one («вчера» → «8 ноября», «до пятницы» → «до 13 ноября»); keep a vague time vague («на днях»), and never add a date or a deadline the message does not give.
- Waiting for someone's reply, decision or result («ждём ответа», «обещала прислать») is that party's commitment to the user, besides any event.
- For a commitment, \`when\` is the day it was given or said, \`due\` is the deadline; never put the deadline into \`when\`.
- Every person or organization mentioned gets a ref: a known card, "user", or a new_entities id — also when unnamed («поставщик упаковки»).
- Requests to the assistant itself (count, write, plan), questions and small talk produce no items — return empty arrays.
- Do not add judgements or guesses that the message does not state.`;
};

/** Does the answer point at the user anywhere — then their own card has to exist before the plan is made. */
export const mentionsUser = (extraction: Extraction) =>
  extraction.items.some(
    (i) =>
      i.about.includes("user") || i.debtor === "user" || i.creditor === "user"
  );

/** A calendar day's midnight in a zone, as an instant; null for anything that is not a real `YYYY-MM-DD`. */
export const localMidnight = (date: string, timeZone: string) => {
  const groups = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(
    date
  )?.groups;
  if (!groups) {
    return null;
  }
  const [year, month, day] = [groups.year, groups.month, groups.day].map(
    Number
  ) as [number, number, number];
  const guess = Date.UTC(year, month - 1, day);
  const check = new Date(guess);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  // The zone's offset at a moment: its wall clock read as UTC, minus the moment.
  const offset = (at: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        second: "2-digit",
        timeZone,
        year: "numeric",
      })
        .formatToParts(new Date(at))
        .map((p) => [p.type, Number(p.value)])
    ) as Record<string, number>;
    return (
      Date.UTC(
        parts.year ?? 0,
        (parts.month ?? 1) - 1,
        parts.day ?? 1,
        parts.hour ?? 0,
        parts.minute ?? 0,
        parts.second ?? 0
      ) - at
    );
  };
  // Twice: the first guess may stand on the other side of a clock change.
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
};

type Item = Extraction["items"][number];
type Planned = MemoryWritePlan["records"][number];
type Link = Planned["entities"][number];

const ENTITY_KINDS = {
  organization: "org",
  person: "person",
  project: "project",
} as const;

/** How the cards of a record that is not a commitment take part in it. */
const roleOf = (kind: Item["kind"]): MemoryRole => {
  if (kind === "event") {
    return "participant";
  }
  return kind === "rule" ? "subject" : "about";
};

const normalize = (name: string) =>
  name.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");

type Fresh = MemoryWritePlan["entities"][number];
type Ask = Extraction["asks"][number] & { ids: string[] };
type Draft = MemoryWritePlan["drafts"][number];

/** New cards by the model's id; one named exactly like a known card is that card (in `asKnown`). */
const freshCards = (
  extraction: Extraction,
  cards: KnownCard[],
  known: Map<string, string>,
  asKnown: Map<string, string>
) => {
  const byName = new Map<string, string>();
  for (const c of cards) {
    for (const name of [c.name, ...c.aliases]) {
      byName.set(normalize(name), c.id);
    }
  }
  const fresh = new Map<string, Fresh>();
  for (const e of extraction.new_entities) {
    const name = e.name.trim();
    // The id is the model's: «new_pavel» instead of «new:pavel» is still that card — only a clash with a known ref is not.
    if (!(name && e.id) || known.has(e.id) || e.id === "user") {
      continue;
    }
    const same = byName.get(normalize(name));
    if (same) {
      asKnown.set(e.id, same);
      continue;
    }
    fresh.set(e.id, {
      kind: ENTITY_KINDS[e.kind],
      name,
      ref: e.id,
      role: e.about.trim() || null,
    });
  }
  return fresh;
};

/** A question with two or more known cards waits for the person; with one it is that card (in `asKnown`), with none — nothing. */
const openAsks = (
  extraction: Extraction,
  known: Map<string, string>,
  asKnown: Map<string, string>
) => {
  const asks = new Map<string, Ask>();
  for (const a of extraction.asks) {
    const ids = [...new Set(a.candidates.flatMap((r) => known.get(r) ?? []))];
    if (ids.length > 1 && a.question.trim()) {
      asks.set(a.id, { ...a, ids });
    } else if (ids[0]) {
      asKnown.set(a.id, ids[0]);
    }
  }
  return asks;
};

/** An item as a record: its cards by role, and its dates where its kind keeps them. */
const toPlanned = (
  item: Item,
  link: (ref: string | null, role: MemoryRole) => Link | null,
  day: (w: Item["when"]) => { at: Date; precision: MemoryPrecision } | null
): Planned | null => {
  const text = item.text.trim();
  if (!text) {
    return null;
  }
  const sides = new Set([item.debtor, item.creditor]);
  const links =
    item.kind === "commitment"
      ? [
          link(item.debtor, "debtor"),
          link(item.creditor, "creditor"),
          ...item.about
            .filter((r) => !sides.has(r))
            .map((r) => link(r, "about")),
        ]
      : item.about.map((r) => link(r, roleOf(item.kind)));
  const at = day(item.when);
  const record: Planned = {
    entities: links.filter((l): l is Link => l !== null),
    kind: item.kind,
    text,
  };
  if (item.kind === "event" && at) {
    record.occurred = at;
  }
  if ((item.kind === "fact" || item.kind === "assessment") && at) {
    record.validFrom = at.at;
  }
  if (item.kind === "commitment") {
    record.givenAt = at?.at;
    record.dueAt = day(item.due)?.at;
  }
  return record;
};

/** A record that points at a question waits with it — at the first, if it points at two; the rest are ready. */
const sortOut = (records: Planned[], asks: Map<string, Ask>) => {
  const drafts = new Map<string, Draft>();
  const ready: Planned[] = [];
  for (const r of records) {
    const ask = r.entities.find((l): l is Link & { ask: string } => "ask" in l);
    const a = ask ? asks.get(ask.ask) : undefined;
    if (!ask) {
      ready.push(r);
    } else if (a) {
      const draft = drafts.get(a.id) ?? {
        candidates: a.ids,
        name: a.name.trim(),
        question: a.question.trim(),
        records: [],
      };
      draft.records.push({
        ...r,
        entities: r.entities.filter((l) => !("ask" in l) || l.ask === a.id),
      });
      drafts.set(a.id, draft);
    }
  }
  return { drafts: [...drafts.values()], ready };
};

/**
 * The model's answer as a plan for the store. Refs become cards: a known one, the user's own, a new one, or the one
 * the person will pick (P18); a new card named exactly like a known one is the known one; a ref to nothing is
 * dropped, and so is a new card no record points at. Dates become instants at midnight in the person's zone.
 */
export const planWrite = (
  extraction: Extraction,
  {
    cards,
    selfId,
    timeZone,
  }: { cards: KnownCard[]; selfId: string | null; timeZone: string }
): MemoryWritePlan => {
  const known = new Map(cards.map((c) => [c.ref, c.id]));
  const asKnown = new Map<string, string>();
  const fresh = freshCards(extraction, cards, known, asKnown);
  const asks = openAsks(extraction, known, asKnown);
  const link = (ref: string | null, role: MemoryRole): Link | null => {
    if (!ref) {
      return null;
    }
    if (asks.has(ref)) {
      return { ask: ref, role };
    }
    if (ref === "user") {
      return selfId ? { entityId: selfId, role } : null;
    }
    const id = known.get(ref) ?? asKnown.get(ref);
    if (id) {
      return { entityId: id, role };
    }
    return fresh.has(ref) ? { newRef: ref, role } : null;
  };
  const day = (w: Item["when"]) => {
    const at = w ? localMidnight(w.date, timeZone) : null;
    return at && w ? { at, precision: w.precision as MemoryPrecision } : null;
  };
  const records = extraction.items.flatMap(
    (item) => toPlanned(item, link, day) ?? []
  );
  const { drafts, ready } = sortOut(records, asks);
  const used = new Set(
    [...ready, ...drafts.flatMap((d) => d.records)].flatMap((r) =>
      r.entities.flatMap((l) => ("newRef" in l ? [l.newRef] : []))
    )
  );
  return {
    drafts,
    entities: [...fresh.values()].filter((e) => used.has(e.ref)),
    records: ready,
  };
};
