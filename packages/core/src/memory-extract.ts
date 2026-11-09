import type {
  MemoryEntityKind,
  MemoryPrecision,
  MemoryRole,
} from "@metobe/contracts/memory";
import { z } from "zod";

import type { MemoryRecord, MemoryWritePlan } from "./memory";
import { membershipFacts } from "./memory-groups";

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
        kind: z.enum(["person", "organization", "project", "group"]),
        name: z.string(),
        about: z
          .string()
          .describe(
            "Who it is to the user (a role, a company) if the message says so; empty if it does not — not what they did in the message"
          ),
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
          "One short self-contained sentence in the message's language, with full names. The user is «я» or left out («Позвонить Андрею Седову 10 ноября»), never «пользователь»"
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
      role: z
        .string()
        .nullable()
        .describe(
          "Fact only: when the fact is who a person or organization is to the user now — position, job, company — that in a few words («тимлид бэкенда»); null otherwise"
        ),
      important: z
        .boolean()
        .describe(
          "Commitment only: true when the message itself calls it important or urgent («критично», «горит», «главное»); false otherwise"
        ),
      interval_days: z
        .number()
        .nullable()
        .describe("Rule only: the period or threshold in days"),
      rule_kind: z
        .enum(["rhythm", "wait", "other"])
        .nullable()
        .describe(
          "Rule only: rhythm — how often the user wants to be in touch with someone; wait — how long a reply or result from others may take; other — anything else"
        ),
      working_days: z
        .boolean()
        .nullable()
        .describe(
          "Rule only: true when the days are working days («пять рабочих дней»)"
        ),
    })
  ),
  updates: z
    .array(
      z.object({
        ref: z.string().describe("An open commitment's ref: «k2»"),
        status: z.enum(["done", "cancelled", "unconfirmed"]),
      })
    )
    .describe(
      "Open commitments whose state the message changes: done, no longer needed, or said to be done by someone else"
    ),
  leaves: z
    .array(
      z.object({
        person: z.string().describe("The person's card ref"),
        group: z.string().describe("The group's card ref"),
      })
    )
    .describe(
      "People the message says are no longer in a known group («Марина ушла из команды»)"
    ),
});
/* oxlint-enable sort-keys */
export type Extraction = z.infer<typeof extractionSchema>;

/** An open commitment the message may close, under a short ref («k2»). */
export interface OpenCommitment {
  ref: string;
  id: string;
  text: string;
  status: "open" | "unconfirmed";
  due: Date | null;
}

/** A card the model may point at, under a short ref («c3») instead of its id. */
export interface KnownCard {
  ref: string;
  id: string;
  kind: Exclude<MemoryEntityKind, "self">;
  name: string;
  aliases: string[];
  role: string | null;
  /** A group's people now, by their refs. */
  members?: string[];
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
    c.kind === "group"
      ? `members: ${c.members?.length ? c.members.join(", ") : "none yet"}`
      : null,
  ].filter(Boolean);
  return `- ${c.ref}: ${c.name} (${about.join("; ")})`;
};

/** A message of the chat before the one being read, in words only. */
export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** The chat before a message, at most (ARCH §19.8.2): a story told over a few messages fits, a long chat does not. */
export const CONTEXT_TURNS = 6;
const CONTEXT_CHARS = 4000;
/** An answer is mostly the assistant's own words: its start says what it was about. */
const CONTEXT_ANSWER = 800;

/**
 * The chat before a message, oldest first, cut from the far end: the last `CONTEXT_TURNS` messages, an answer to
 * `CONTEXT_ANSWER` characters, `CONTEXT_CHARS` in all. The nearest message always comes in, cut to fit if it is long.
 */
export const chatContext = (turns: ChatTurn[]) => {
  const kept: ChatTurn[] = [];
  let left = CONTEXT_CHARS;
  for (const turn of turns.slice(-CONTEXT_TURNS).toReversed()) {
    if (left <= 0) {
      break;
    }
    const text = turn.text
      .slice(0, turn.role === "assistant" ? CONTEXT_ANSWER : undefined)
      .slice(0, left);
    kept.push({ role: turn.role, text });
    left -= text.length;
  }
  return kept.toReversed();
};

/**
 * What the model reads: the message, and before it the chat it follows (`chatContext`) — only to understand «он»,
 * «передумал», an answer to the assistant's question or a story told over a few messages (S13, part 5).
 */
export const memoryPrompt = (message: string, context: ChatTurn[] = []) => {
  const lines = chatContext(context).map(
    (t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`
  );
  const before =
    lines.length > 0 ? `<context>\n${lines.join("\n")}\n</context>\n` : "";
  return `${before}<message>\n${message}\n</message>`;
};

/** «Today» is when the message was sent, in the person's zone: a write retried tomorrow still reads «вчера» right. */
export const memoryInstructions = ({
  sentAt,
  timeZone,
  cards,
  commitments = [],
}: {
  sentAt: Date;
  timeZone: string;
  cards: KnownCard[];
  commitments?: OpenCommitment[];
}) => {
  const today = dayIn(sentAt, timeZone);
  const promises =
    commitments.length > 0
      ? commitments.map((c) => {
          const notes = [
            c.due && `due ${dayIn(c.due, timeZone).iso}`,
            c.status === "unconfirmed" && "said to be done, not confirmed",
          ].filter(Boolean);
          return `- ${c.ref}: ${c.text}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`;
        })
      : ["- none"];
  return `You maintain the long-term memory of one user of a work assistant. From the user's message inside <message> tags, extract what is worth remembering about their work: facts, assessments, events, commitments and the user's standing rules for the assistant.

Today is ${today.text} (${today.iso}), time zone ${timeZone}.

Known cards (ref: description):
${[...cards.map(cardLine), "- user: the user themselves"].join("\n")}

Open commitments (ref: text):
${promises.join("\n")}

Rules:
- Kinds: fact — a lasting state or attribute (role, stage, preference, birthday); assessment — the user's own opinion or judgement of someone («часто срывает сроки»), never turned into a fact; event — something that happened or is scheduled at a time; commitment — someone owes someone an action, with or without a deadline; rule — the user's standing instruction about reminders or what to highlight.
- A rule with a period: rhythm — how often the user wants to meet or talk with someone («один на один с Андреем раз в две недели» — 14 days, the person as ref; «с каждым из моей команды» — the group as ref, not its people); wait — how long a reply or result from others may take before it is worth asking («ответа от контрагента ждём пять рабочих дней» — 5, working days; the party as ref if named, none if it is anyone). «Раз в неделю» is 7, «раз в месяц» 30.
- Groups: people the user names as one — «моя команда», «отдел продаж», «бухгалтерия», «подрядчики» — are a card of kind group; a department of the user's own company is a group too, while another company is an organization. «Работает в отделе продаж» means being in that group. When the message says someone is in a group («Павел — новый разработчик в моей команде», «в отделе продаж теперь Игорь»), add a fact with both refs in about: the person and the group. When it says someone is no longer in a known group («Марина ушла из команды»), put them in leaves and add no fact for it. A rule for everyone in a group points at the group.
- Refs: use a known card ref, "user", an id from new_entities or an id from asks. Pick a card only when the message makes it clear (a surname, a company, a role, the topic); a person not in the cards goes to new_entities. When a mention fits two or more known cards and nothing in the message tells which, do not guess: add it to asks with those cards as candidates, and use the ask id as the ref in the item (in about, debtor or creditor) instead of a card. The topic tells too: work on what a card is known for («API», «закупки») points at that card, and then it is not a question.
- Dates: resolve relative dates against today and against the moment they refer to («в прошлый вторник сказал, что через две недели» — two weeks from that Tuesday). Past tense with a weekday means the latest such day before today. Set precision honestly: «на днях» is a week, «в начале октября» is a month. Never invent a date that the message does not imply.
- In the text, turn a relative date the message gives into an absolute one («вчера» → «8 ноября», «до пятницы» → «до 13 ноября»); keep a vague time vague («на днях»), and never add a date or a deadline the message does not give.
- Waiting for someone's reply, decision or result («ждём ответа», «обещала прислать») is that party's commitment to the user, besides any event.
- For a commitment, \`when\` is the day it was given or said, \`due\` is the deadline; never put the deadline into \`when\`.
- A commitment is important only when the message says so in words («критично», «горит», «это главное», «в первую очередь»). A deadline, a boss or money alone do not make it important.
- Every person or organization mentioned gets a ref: a known card, "user", or a new_entities id — also when unnamed («поставщик упаковки»).
- When the message says an open commitment is settled, put it in updates: done — the user did it or saw it done («Ольга прислала договор», «отправил смету»); unconfirmed — only someone else says it is done («Андрей говорит, API готов»); cancelled — it no longer has to be done («Андрей передумал», «встречу отменили»). Only when the message makes clear which commitment it is; a plan, a hope or a partial step («почти готово», «на этой неделе сделает») changes nothing. Do not also add the settled commitment as a new item. When what the message says is done or cancelled is not among the open commitments, record it as an event instead («Ольга Ли прислала договор»).
- The user's own lasting goals, aims and ways of working («развиваю своих подчинённых», «хочу, чтобы команда сама принимала решения», «держу фокус на качестве») are facts about "user", even when said as a wish for the assistant to know them.
- A person's skills, strengths and what they work on are facts about them, one per skill; the user's judgement of how good they are is an assessment.
- When a fact says who someone is now — a new position, job or company («Андрей теперь тимлид»), set role to that in a few words.
- Requests to the assistant itself (count, write, plan), questions and small talk produce no items — return empty arrays.
- Earlier conversation may come before the message, inside <context> tags. Use it only to understand the message: who «он», «она» or «Андрей» is, what «передумал» or «перенесли» is about, which option the user picks when answering the assistant's question. Record only what the message itself says; never record again what the context already said.
- Do not record an item you cannot state in full («Андрей передумал» — about what?). If the message makes no sense without context and the context does not tell, return nothing for it.
- One item per thing: never the same item twice in other words, or once for each side of an agreement.
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
  group: "group",
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

/** A rule's period over a year is no rhythm to keep. */
const MAX_RULE_DAYS = 366;

/** A rule's period «Не упустить» can count by: rhythm or wait, a day to a year. */
const ruleOf = (item: Item): Planned["rule"] => {
  const days = Math.round(item.interval_days ?? 0);
  if (
    item.kind !== "rule" ||
    (item.rule_kind !== "rhythm" && item.rule_kind !== "wait") ||
    days <= 0 ||
    days > MAX_RULE_DAYS
  ) {
    return undefined;
  }
  return {
    days,
    kind: item.rule_kind,
    workingDays: item.working_days === true,
  };
};

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
  if (item.kind === "fact" && item.role?.trim()) {
    record.role = item.role.trim();
  }
  const rule = ruleOf(item);
  if (rule) {
    record.rule = rule;
  }
  if (item.kind === "commitment") {
    record.givenAt = at?.at;
    record.dueAt = day(item.due)?.at;
    if (item.important) {
      record.important = true;
    }
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
 * A fact naming a group is who is in it: the group's link becomes `group`, the people stay `about` — so «Павел — в моей
 * команде» counts for «с каждым из команды» (core/memory-groups).
 */
const asMemberships = (
  records: Planned[],
  groups: ReadonlySet<string>,
  freshGroups: ReadonlySet<string>
) =>
  records.map((r) =>
    r.kind === "fact"
      ? {
          ...r,
          entities: r.entities.map((l) =>
            l.role === "about" &&
            (("entityId" in l && groups.has(l.entityId)) ||
              ("newRef" in l && freshGroups.has(l.newRef)))
              ? { ...l, role: "group" as const }
              : l
          ),
        }
      : r
  );

/** «Марина ушла из команды»: the facts that put her in it, to end — refs to nothing and no membership change nothing. */
const leftGroups = (
  extraction: Extraction,
  cards: KnownCard[],
  facts: MemoryRecord[]
) => {
  const byRef = new Map(cards.map((c) => [c.ref, c]));
  const ends = new Set<string>();
  for (const leave of extraction.leaves) {
    const person = byRef.get(leave.person);
    const group = byRef.get(leave.group);
    if (person && group?.kind === "group") {
      for (const f of membershipFacts(facts, person.id, group.id)) {
        ends.add(f.id);
      }
    }
  }
  return [...ends];
};

/** What the message settles: a ref to nothing, a second word on the same one and «unconfirmed» twice are dropped. */
const settled = (extraction: Extraction, commitments: OpenCommitment[]) => {
  const byRef = new Map(commitments.map((c) => [c.ref, c]));
  const statuses = new Map<string, MemoryWritePlan["statuses"][number]>();
  for (const u of extraction.updates) {
    const c = byRef.get(u.ref);
    if (c && !statuses.has(c.id) && c.status !== u.status) {
      statuses.set(c.id, { recordId: c.id, status: u.status });
    }
  }
  return [...statuses.values()];
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
    commitments = [],
    facts = [],
    selfId,
    timeZone,
  }: {
    cards: KnownCard[];
    commitments?: OpenCommitment[];
    /** The facts kept now: who is in which group, for «ушёл из команды». */
    facts?: MemoryRecord[];
    selfId: string | null;
    timeZone: string;
  }
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
  const records = asMemberships(
    extraction.items.flatMap((item) => toPlanned(item, link, day) ?? []),
    new Set(cards.filter((c) => c.kind === "group").map((c) => c.id)),
    new Set(
      [...fresh.values()].filter((e) => e.kind === "group").map((e) => e.ref)
    )
  );
  const { drafts, ready } = sortOut(records, asks);
  const used = new Set(
    [...ready, ...drafts.flatMap((d) => d.records)].flatMap((r) =>
      r.entities.flatMap((l) => ("newRef" in l ? [l.newRef] : []))
    )
  );
  return {
    drafts,
    ends: leftGroups(extraction, cards, facts),
    entities: [...fresh.values()].filter((e) => used.has(e.ref)),
    records: ready,
    statuses: settled(extraction, commitments),
  };
};
