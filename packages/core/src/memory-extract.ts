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
/**
 * A time, always given: a model allowed `null` here took it even after writing the date into the text (DeepSeek v4.1
 * Flash left a third of the dates out, S13). No time in the message — precision `none` and an empty date, said outright.
 */
const when = z.object({
  date: z
    .string()
    .describe(
      "YYYY-MM-DD. For a week — the middle of it; for a month — its first day; for a year — 1 January. Empty when precision is none"
    ),
  precision: z.enum(["day", "week", "month", "year", "none"]),
});

export const extractionSchema = z.object({
  new_entities: z
    .array(
      z.object({
        id: z.string().describe("new:<latin-slug>"),
        kind: z.enum(["person", "organization", "project", "group", "thing"]),
        name: z.string(),
        about: z
          .string()
          .describe(
            "Who it is to the user (a role, a company) if the message says so; for a thing — its kind in one or two words, never its name («кот», «автобус», «оборудование»); empty if the message does not say — not what they did in the message"
          ),
      })
    )
    .describe(
      "People, organizations, projects, groups and things mentioned that are not among the known cards"
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
        "Fact or assessment: since when it is true. Event: when it happened or is scheduled. Commitment: when it was given. Precision none only if the message gives no time for it"
      ),
      due: when.describe(
        "Commitment only: the deadline. Precision none if it is not a commitment or the message gives no deadline"
      ),
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
        .describe(
          "Rule only: the period or threshold in days («раз в две недели» — 14). 0 if it is not a rule or has no period"
        ),
      rule_kind: z
        .enum(["rhythm", "wait", "date", "other"])
        .nullable()
        .describe(
          "Rule only: rhythm — how often the user wants to be in touch with someone; wait — how long a reply or result from others may take; date — a day that comes again (a birthday, a payment day, a weekly report); other — anything else"
        ),
      working_days: z
        .boolean()
        .nullable()
        .describe(
          "Rule only: true when the days are working days («пять рабочих дней»)"
        ),
      // Last, so that the order of the fields S13 measured stays as it was (ARCH §19.9.3).
      replaces: z
        .string()
        .describe(
          "«none» for almost every item; the ref of a listed current fact or coming event («f1», «e2») only when the message says that one is no longer true and this item is true instead"
        ),
      repeat: z
        .enum(["none", "year", "month", "week", "day", "weekdays"])
        .describe(
          "Rule of kind date: how often its day comes again — year (a birthday), month (the 20th of every month), week (every Friday). A commitment with remind: how often the reminder comes again — day, weekdays (Monday to Friday), week, month, year. «none» for everything else"
        ),
      remind: z
        .string()
        .describe(
          "Commitment only: when the user asks to be reminded of it — the time of day as HH:MM, 24 hours («в 15:00» — «15:00»), or «morning» when they ask to be reminded with no time named. «none» for everything else, which is almost every item"
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
  moves: z
    .array(
      z.object({
        ref: z.string().describe("An open commitment's ref: «k2»"),
        due: when.describe("The new deadline"),
      })
    )
    .describe(
      "Open commitments whose deadline the message moves («не к пятнице, а к понедельнику»); empty when it moves none"
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

/**
 * A fact that holds now or an event coming up, shown to the model under a short ref («f1», «e2») so that a new item can
 * say it replaces it (ARCH §19.9.3).
 */
export interface KnownRecord {
  ref: string;
  id: string;
  kind: "fact" | "event";
  text: string;
  /** The cards it is about: a replacement has to share one. */
  entityIds: string[];
  /** A fact: since when it holds. An event: when it is. */
  on: Date | null;
}

/** A card the model may point at, under a short ref («c3») instead of its id. */
export interface KnownCard {
  ref: string;
  id: string;
  kind: Exclude<MemoryEntityKind, "self">;
  name: string;
  aliases: string[];
  role: string | null;
  /** Kind `custom`: what kind of thing it is. */
  type?: string | null;
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

/** A card's kind as the writer reads it: a thing of the person's own kind is that kind's word («thing: автобус»). */
const cardKind = (c: KnownCard) => {
  if (c.kind === "custom") {
    return c.type ? `thing: ${c.type}` : "thing";
  }
  return c.kind === "org" ? "organization" : c.kind;
};

const cardLine = (c: KnownCard) => {
  const about = [
    cardKind(c),
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
  // From the near end.
  // oxlint-disable-next-line unicorn/no-array-reverse -- a fresh array; toReversed is past the ES2022 target
  for (const turn of turns.slice(-CONTEXT_TURNS).reverse()) {
    if (left <= 0) {
      break;
    }
    const text = turn.text
      .slice(0, turn.role === "assistant" ? CONTEXT_ANSWER : undefined)
      .slice(0, left);
    kept.push({ role: turn.role, text });
    left -= text.length;
  }
  // oxlint-disable-next-line unicorn/no-array-reverse -- built here; toReversed is past the ES2022 target
  return kept.reverse();
};

/** A line that starts what was forwarded or copied from a letter: everything from it on is someone else's. */
const FORWARDED =
  /^\s*(?:-{2,}\s*)?(?:пересланное сообщение|forwarded message|original message|исходное сообщение|переслано от|forwarded from)(?!\p{L})/iu;
/** A letter's header: two of them in a row start a letter. */
const HEADER =
  /^\s*(?:от|кому|копия|тема|дата|отправлено|from|to|cc|subject|date|sent)\s*:/iu;

/**
 * The person's own words apart from what they pasted (ARCH §19.8.4): lines quoted with «>», and everything from a
 * forwarding line («Пересланное сообщение», «-----Original Message-----») or a letter's headers («От:», «Тема:») on.
 * A text without such marks is all the person's: a letter pasted bare is left to the prompt's rule.
 */
export const splitQuoted = (text: string) => {
  const lines = text.split("\n");
  const own: string[] = [];
  const quoted: string[] = [];
  let rest = false;
  for (const [i, line] of lines.entries()) {
    if (
      !rest &&
      (FORWARDED.test(line) ||
        (HEADER.test(line) && HEADER.test(lines[i + 1] ?? "")))
    ) {
      rest = true;
    }
    if (rest) {
      quoted.push(line);
    } else if (line.trimStart().startsWith(">")) {
      quoted.push(line.replace(/^\s*>\s?/u, ""));
    } else {
      own.push(line);
    }
  }
  return { own: own.join("\n").trim(), quoted: quoted.join("\n").trim() };
};

/**
 * A note typed on a card (P22 «Записать…»): the card comes before it, as a question it answers — «обещал к пятнице»
 * there is about them, unless it names someone else.
 */
export const noteTurn = (card: {
  name: string;
  role: string | null;
}): ChatTurn => ({
  role: "assistant",
  text: `What should I remember about ${card.name}${card.role ? ` (${card.role})` : ""}?`,
});

/** A rule typed on the «Правила» page: the question it answers, so a plain sentence is read as a standing rule. */
export const RULE_TURN: ChatTurn = {
  role: "assistant",
  text: "What standing rule should I remember — how or how often to remind the user, or what to watch for?",
};

/**
 * What the model reads: the message, and before it the chat it follows (`chatContext`) — only to understand «он»,
 * «передумал», an answer to the assistant's question or a story told over a few messages (S13, part 5). A message with
 * something quoted or forwarded in it comes split: the person's words in <user>, the rest in <quoted>.
 */
export const memoryPrompt = (message: string, context: ChatTurn[] = []) => {
  const lines = chatContext(context).map(
    (t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`
  );
  const before =
    lines.length > 0 ? `<context>\n${lines.join("\n")}\n</context>\n` : "";
  const { own, quoted } = splitQuoted(message);
  const body = quoted
    ? `<user>\n${own}\n</user>\n<quoted>\n${quoted}\n</quoted>`
    : message;
  return `${before}<message>\n${body}\n</message>`;
};

/**
 * The block of current facts and coming events, each with the cards it is about, so that an item that replaces it can
 * point at the same ones; nothing at all while there are none, so the prompt stays as measured.
 */
const knownBlock = (
  known: KnownRecord[],
  cards: KnownCard[],
  timeZone: string
) =>
  known.length === 0
    ? ""
    : `Current facts and coming events (ref: text):
${known
  .map((k) => {
    const refs = cards
      .filter((c) => k.entityIds.includes(c.id))
      .map((c) => c.ref);
    const notes = [
      k.on &&
        `${k.kind === "fact" ? "since" : "on"} ${dayIn(k.on, timeZone).iso}`,
      refs.length > 0 && `about ${refs.join(", ")}`,
    ].filter(Boolean);
    return `- ${k.ref}: ${k.text}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`;
  })
  .join("\n")}

`;

/**
 * Things (D42): a pet, a vehicle, a contract. The first wording — a long one with «will come back to» and a list of
 * kinds — cost the «о себе» set a sixth of its answers on DeepSeek (28 of 36 against 33 of 36 without it): the writer
 * grew careful with everything about the user. This short one costs none (33 of 36) and names every thing (16 of 16).
 */
const THINGS_RULE = `- A pet, a vehicle, a machine or a device, a contract or a site, given a name or a number («Барсик», «Автобус 412», «Mac Studio»), is a new_entities item of kind thing; \`about\` is what it is, in the user's word («кот», «автобус»). A thing named in general or in passing («ноутбук», «отчёт») is not a card. A thing always comes with an item about it, with its id in about.
`;

/**
 * Only with the block of current facts and coming events (ARCH §19.9.3): every other message keeps the prompt S13 was
 * measured on, word for word.
 */
const REPLACE_RULE = `
- \`replaces\` is «none» for almost every item. Put there the ref of a current fact or coming event above only when the message says that one is no longer true and the item is what is true instead: a project moved to another stage, a person got another position or employer, a preference turned into another, a meeting was moved or cancelled. The test: if the old one and the item can both be true at once, it is «none» — one more duty («ещё ведёт код-ревью»), a habit or a preference of someone whose position is listed, a detail, one more meeting or one more customer stand beside the old ones. A meeting that is moved is replaced by the new event, with the new day in \`when\`; a cancelled one by an event «…отменена». The item points at the same cards (about) as the one it replaces. When in doubt, «none».`;

/** Only with open commitments listed: the same exception as above. */
const MOVE_RULE = `
- When the message moves the deadline of an open commitment («не к пятнице, а к понедельнику»), put it in moves with the new deadline, and add no new item for it.`;

/**
 * Only for a message with a quote, a letter or a forwarded message in it (ARCH §19.8.4): every other message keeps
 * the prompt S13 was measured on, word for word.
 */
/** The local time of day, `15:30`. */
const localClock = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(at);

/** A message that asks to be reminded: only then the rule on reminders is offered. */
export const asksReminder = (text: string) =>
  /напомин|напомн|remind/iu.test(text);

const REMIND_RULE = (now: string) => `
- The user asks to be reminded («напомни мне завтра в 15:00 позвонить Ольге», «напомни в пятницу про отчёт»). Make it a commitment of the user (debtor «user»), the thing to do as its text. Its deadline (due) is the DAY the reminder goes off, precision day — «через два часа» or «сегодня в 18:00» is today, «завтра» tomorrow; a time of day already past today means tomorrow. Put the time of day in remind as HH:MM in 24 hours («в 15:00» — «15:00», «в три часа дня» — «15:00»); when no time is named, «morning». A reminder that is to come again («каждый понедельник в 10», «каждый день в 9», «по будням в 18:00», «двадцать пятого каждого месяца») is still this one commitment: repeat day, weekdays, week, month or year, and its due the first day it goes off — not a rule of kind date. It is ${now} now (the user's local time). Do not add a second item for the same thing.`;

/** A message that may name a day which comes again: a birthday, a payment day, «каждую пятницу». */
export const repeatsDate = (text: string) =>
  /день рождени|родил(?:ся|ась)|днюх|именин|годовщин|кажд(?:ый|ую|ое|ые|ого|ой)(?![а-яё])|ежедневн|еженедельн|ежемесячн|ежегодн|раз в (?:год|месяц|неделю)|по (?:понедельникам|вторникам|средам|четвергам|пятницам)|birthday|every (?:day|week|month|year|monday|tuesday|wednesday|thursday|friday)|weekly|monthly|yearly|annual/iu.test(
    text
  );

const REPEAT_RULE = `
- The message names a day that comes again — a birthday, a payment day, «каждую пятницу», «двадцатого каждого месяца». Add a rule: kind rule, rule_kind date, the card it is about (or "user" for the user's own) in about, the day in when with precision day (a birthday — that day of the year; «каждую пятницу» — the nearest such day), and repeat: year for a birthday or anniversary, month for a day of every month, week for a weekday of every week. A date said only as a one-time event («встреча 14 ноября») is not a rule, nor is a day the user asks to be reminded on — that is a reminder. A birthday is both: a fact for the person and this rule.`;

const QUOTED_RULE = `
- The message has someone else's text inside <quoted>: a letter, a forwarded message or a quote. It speaks in its author's voice: «я», «мы», «наша компания» there are the author, never the user. An author's promise is the author's commitment, to the user unless it names someone else; a request to the user is the user's commitment to the author. The user's own words are inside <user>. A long quoted text gives the few items that matter to the user, not one per sentence.`;

/**
 * Only for material where someone other than the person speaks in their own voice (a letter, a meeting's lines, И1):
 * every chat message keeps the prompt S13 was measured on, word for word.
 */
const SAID_RULE = `
- Lines inside <said by="…"> are that person's own words — a letter they wrote, what they said at a meeting. «Я», «мы», «наша компания» there are that person, never the user; a card ref in by is their card. Their promise is their commitment, to the user unless it names someone else; their request to the user is the user's commitment to them. What they say they have done settles their open commitment only as unconfirmed — it is said, not seen. Lines inside <user> are the user's own.`;

/** «Today» is when the message was sent, in the person's zone: a write retried tomorrow still reads «вчера» right. */
export const memoryInstructions = ({
  sentAt,
  timeZone,
  cards,
  commitments = [],
  known = [],
  quoted = false,
  said = false,
  repeating = false,
  reminding = false,
}: {
  sentAt: Date;
  timeZone: string;
  cards: KnownCard[];
  commitments?: OpenCommitment[];
  /** Current facts and coming events a new item may replace; the block and its rule are there only when not empty. */
  known?: KnownRecord[];
  /** The message has someone else's text in it (`splitQuoted`): the rule on it is added, and only then. */
  quoted?: boolean;
  /** Someone other than the person speaks in the material (`othersSpeak`): the rule on their lines is added, and only then. */
  said?: boolean;
  /** The message may name a day that comes again (`repeatsDate`): the rule on date rules is added, and only then. */
  repeating?: boolean;
  /** The message asks to be reminded (`asksReminder`): the rule on reminders is added, and only then. */
  reminding?: boolean;
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

${knownBlock(known, cards, timeZone)}Rules:
- Kinds: fact — a lasting state or attribute (role, stage, preference, birthday); assessment — the user's own opinion or judgement of someone («часто срывает сроки»), never turned into a fact; event — something that happened or is scheduled at a time; commitment — someone owes someone an action, with or without a deadline; rule — the user's standing instruction about reminders or what to highlight.
- A rule with a period: rhythm — how often the user wants to meet or talk with someone («один на один с Андреем раз в две недели» — 14 days, the person as ref; «с каждым из моей команды» — the group as ref, not its people); wait — how long a reply or result from others may take before it is worth asking («ответа от контрагента ждём пять рабочих дней» — 5, working days; the party as ref if named, none if it is anyone). «Раз в неделю» is 7, «раз в месяц» 30.
- Groups: people the user names as one — «моя команда», «отдел продаж», «бухгалтерия», «подрядчики» — are a card of kind group; a department of the user's own company is a group too, while another company is an organization. «Работает в отделе продаж» means being in that group. When the message says someone is in a group («Павел — новый разработчик в моей команде», «в отделе продаж теперь Игорь»), add a fact with both refs in about: the person and the group. When it says someone is no longer in a known group («Марина ушла из команды»), put them in leaves and add no fact for it. A rule for everyone in a group points at the group.
${THINGS_RULE}- Refs: use a known card ref, "user", an id from new_entities or an id from asks. Pick a card only when the message makes it clear (a surname, a company, a role, the topic); a person not in the cards goes to new_entities. When a mention fits two or more known cards and nothing in the message tells which, do not guess: add it to asks with those cards as candidates, and use the ask id as the ref in the item (in about, debtor or creditor) instead of a card. The topic tells too: work on what a card is known for («API», «закупки») points at that card, and then it is not a question.
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
- Do not add judgements or guesses that the message does not state.${known.length > 0 ? REPLACE_RULE : ""}${commitments.length > 0 ? MOVE_RULE : ""}${quoted ? QUOTED_RULE : ""}${said ? SAID_RULE : ""}${repeating ? REPEAT_RULE : ""}${reminding ? REMIND_RULE(localClock(sentAt, timeZone)) : ""}`;
};

/** Does the answer point at the user anywhere — then their own card has to exist before the plan is made. */
export const mentionsUser = (extraction: Extraction) =>
  extraction.items.some(
    (i) =>
      i.about.includes("user") || i.debtor === "user" || i.creditor === "user"
  );

/** A calendar day's midnight in a zone, as an instant; null for anything that is not a real `YYYY-MM-DD`. */
/** A day (`2026-11-12`) and a time of it (`15:30`) in a zone, as the moment; null — not a real day or time. */
export const localInstant = (date: string, time: string, timeZone: string) => {
  const clock = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/u.exec(
    time
  )?.groups;
  if (!clock) {
    return null;
  }
  const groups = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(
    date
  )?.groups;
  if (!groups) {
    return null;
  }
  const [year, month, day] = [groups.year, groups.month, groups.day].map(
    Number
  ) as [number, number, number];
  const guess = Date.UTC(
    year,
    month - 1,
    day,
    Number(clock.hour),
    Number(clock.minute)
  );
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

export const localMidnight = (date: string, timeZone: string) =>
  localInstant(date, "00:00", timeZone);

type Item = Extraction["items"][number];
type Planned = MemoryWritePlan["records"][number];
type Link = Planned["entities"][number];

const ENTITY_KINDS = {
  group: "group",
  organization: "org",
  person: "person",
  project: "project",
  thing: "custom",
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
const ruleOf = (
  item: Item,
  at: { at: Date; precision: string } | null
): Planned["rule"] => {
  // A day that comes again: it needs the day itself, and how often.
  if (item.kind === "rule" && item.rule_kind === "date") {
    return (item.repeat === "year" ||
      item.repeat === "month" ||
      item.repeat === "week") &&
      at?.precision === "day"
      ? { days: 0, kind: "date", repeat: item.repeat, workingDays: false }
      : undefined;
  }
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

/** A rule's part of its record: what it counts by, and — a date rule — the day it stands on. */
const ruleParts = (
  item: Item,
  at: { at: Date; precision: string } | null
): Pick<Planned, "occurred" | "rule"> | undefined => {
  const rule = ruleOf(item, at);
  if (!rule) {
    return undefined;
  }
  return rule.kind === "date" && at
    ? { occurred: at as NonNullable<Planned["occurred"]>, rule }
    : { rule };
};

type Fresh = MemoryWritePlan["entities"][number];
type Ask = Extraction["asks"][number] & { ids: string[] };
type Draft = MemoryWritePlan["drafts"][number];

/** New cards by the model's id; one named exactly like a known card is that card (in `asKnown`). */
/**
 * The word for what a thing is (D42): «кот», «автобус». A model sometimes puts the name there, or a description
 * («рабочая станция Mac Studio M3 Ultra на 256 гигов») — then the card has no type and waits among «Другое», where the
 * person can name it; a wrong word would start a section of its own.
 */
const MAX_TYPE_WORDS = 3;
export const kindWord = (about: string, name: string) => {
  const word = about.trim().toLowerCase();
  const own = normalize(name);
  const said = normalize(word);
  const words = word.split(/\s+/u).length;
  // The kind inside the name is fine («автобус» in «Автобус 412»); the name inside the kind, or a long phrase, is not;
  // several words that are part of the name are the name again.
  if (
    !word ||
    words > MAX_TYPE_WORDS ||
    said.includes(own) ||
    (words > 1 && own.includes(said))
  ) {
    return null;
  }
  return word;
};

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
    // A thing with no id of its own gets one from its name: the card is still made, `linkThings` finds its records.
    const id =
      e.id || (e.kind === "thing" && name ? `new:${normalize(name)}` : "");
    // The id is the model's: «new_pavel» instead of «new:pavel» is still that card — only a clash with a known ref is not.
    if (!(name && id) || known.has(id) || id === "user") {
      continue;
    }
    const same = byName.get(normalize(name));
    if (same) {
      asKnown.set(id, same);
      continue;
    }
    // A thing: «about» is what kind of thing it is, the card's type (D42); the other kinds — who it is to the user.
    const thing = e.kind === "thing";
    fresh.set(id, {
      kind: ENTITY_KINDS[e.kind],
      name,
      ref: id,
      role: thing ? null : e.about.trim() || null,
      ...(thing ? { type: kindWord(e.about, name) } : {}),
    });
  }
  return fresh;
};

/**
 * A thing the writer named and no item points at (D42): the card would not be made. Models leave it out of `about` —
 * the item stands as one about «user» (S15 «вещи»: DeepSeek links 21 of 24, Qwen 3.7 Flash 2 of 24) — so a record
 * whose text has the thing's name is linked to it, as «about» (or as a participant of an event). Only things: a person
 * or an organization the writer does not link stays as it was measured.
 */
const linkThings = (records: Planned[], fresh: Map<string, Fresh>) => {
  const linked = new Set(
    records.flatMap((r) =>
      r.entities.flatMap((l) => ("newRef" in l ? [l.newRef] : []))
    )
  );
  const loose = [...fresh.values()].filter(
    (e) => e.kind === "custom" && !linked.has(e.ref)
  );
  if (loose.length === 0) {
    return records;
  }
  return records.map((r) => {
    const text = normalize(r.text);
    const named = loose.filter((e) => text.includes(normalize(e.name)));
    return named.length === 0
      ? r
      : {
          ...r,
          entities: [
            ...r.entities,
            ...named.map((e): Link => ({
              newRef: e.ref,
              role: r.kind === "event" ? "participant" : "about",
            })),
          ],
        };
  });
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
/** The time of day «morning» means, when the user asks to be reminded with none named. */
const MORNING = "09:00";

/**
 * When to remind: the time of day the user named, on the day of the promise (its deadline). A reminder needs a day — the
 * writer is told to give the deadline the day it is to go off; without one there is nothing to remind on.
 */
const remindOf = (
  item: Item,
  clock: (date: string, time: string) => Date | null
) => {
  const time = item.remind === "morning" ? MORNING : item.remind;
  return item.due.precision === "day" && /^\d{2}:\d{2}$/u.test(time)
    ? (clock(item.due.date, time) ?? undefined)
    : undefined;
};

const toPlanned = (
  item: Item,
  link: (ref: string | null, role: MemoryRole) => Link | null,
  day: (w: Item["when"]) => { at: Date; precision: MemoryPrecision } | null,
  clock: (date: string, time: string) => Date | null
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
  Object.assign(record, ruleParts(item, at));
  // The model's ref until `resolveReplaces` has checked it; then a record's id, or nothing.
  if ((item.kind === "fact" || item.kind === "event") && item.replaces.trim()) {
    record.replaces = item.replaces.trim();
  }
  if (item.kind === "commitment") {
    record.givenAt = at?.at;
    record.dueAt = day(item.due)?.at;
    record.remindAt = remindOf(item, clock);
    if (record.remindAt && item.repeat !== "none") {
      record.remindRepeat = item.repeat;
    }
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
 * What the code lets a replacement through (ARCH §19.9.3): the ref is one that was shown, the kind is the same (a fact
 * replaces a fact, an event an event), the two share a card, and the old one is not replaced twice in one answer.
 * Anything else loses `replaces` and the record is added beside the old one. A record that waits for a question has no
 * card yet to share, so it replaces nothing.
 */
const resolveReplaces = (records: Planned[], known: KnownRecord[]) => {
  const byRef = new Map(known.map((k) => [k.ref, k]));
  const taken = new Set<string>();
  return records.map(({ replaces, ...record }): Planned => {
    const old = replaces ? byRef.get(replaces) : undefined;
    const cards = new Set(
      record.entities.flatMap((l) => ("entityId" in l ? [l.entityId] : []))
    );
    if (
      !old ||
      old.kind !== record.kind ||
      taken.has(old.id) ||
      !old.entityIds.some((id) => cards.has(id))
    ) {
      return record;
    }
    taken.add(old.id);
    return { ...record, replaces: old.id };
  });
};

/** A question's records never replace: they wait for a card (the ref goes, the record stays). */
const withoutReplaces = (draft: Draft): Draft => ({
  ...draft,
  records: draft.records.map(({ replaces: _ref, ...r }) => r),
});

/**
 * The new deadlines the message gives open commitments: a ref to nothing, no day, the same day, a second word on the
 * same one or a commitment the message settles in the same answer change nothing.
 */
const moved = (
  extraction: Extraction,
  commitments: OpenCommitment[],
  statuses: MemoryWritePlan["statuses"],
  day: (w: Item["when"]) => { at: Date } | null
) => {
  const byRef = new Map(commitments.map((c) => [c.ref, c]));
  const settling = new Set(statuses.map((s) => s.recordId));
  const dues = new Map<string, MemoryWritePlan["dues"][number]>();
  for (const m of extraction.moves) {
    const c = byRef.get(m.ref);
    const to = day(m.due);
    if (
      c &&
      to &&
      !settling.has(c.id) &&
      !dues.has(c.id) &&
      c.due?.getTime() !== to.at.getTime()
    ) {
      dues.set(c.id, { dueAt: to.at, recordId: c.id });
    }
  }
  return [...dues.values()];
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
    knownRecords = [],
    selfId,
    timeZone,
  }: {
    cards: KnownCard[];
    commitments?: OpenCommitment[];
    /** The facts and events shown to the model under refs: what a new record may replace. */
    knownRecords?: KnownRecord[];
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
    // «No time» is said outright (precision `none`); a date that is not a day is no time either.
    const at = w.precision === "none" ? null : localMidnight(w.date, timeZone);
    return at && w.precision !== "none" ? { at, precision: w.precision } : null;
  };
  // The moment of a day's time of day in the person's zone: where a reminder goes off.
  const clock = (date: string, time: string) =>
    localInstant(date, time, timeZone);
  const records = asMemberships(
    extraction.items.flatMap((item) => toPlanned(item, link, day, clock) ?? []),
    new Set(cards.filter((c) => c.kind === "group").map((c) => c.id)),
    new Set(
      [...fresh.values()].filter((e) => e.kind === "group").map((e) => e.ref)
    )
  );
  const sorted = sortOut(records, asks);
  const drafts = sorted.drafts.map(withoutReplaces);
  const ready = linkThings(resolveReplaces(sorted.ready, knownRecords), fresh);
  const used = new Set(
    [...ready, ...drafts.flatMap((d) => d.records)].flatMap((r) =>
      r.entities.flatMap((l) => ("newRef" in l ? [l.newRef] : []))
    )
  );
  const statuses = settled(extraction, commitments);
  return {
    drafts,
    dues: moved(extraction, commitments, statuses, day),
    ends: leftGroups(extraction, cards, facts),
    entities: [...fresh.values()].filter((e) => used.has(e.ref)),
    records: ready,
    statuses,
  };
};

/**
 * Material written about a card (a note typed on it, P22): a record that names no one but the person — «вчера
 * виделись» came back with only «user» — is linked to the card, so it lies where it was typed. One naming someone
 * else («Андрей обещал ему…») is left as the model read it.
 */
export const onCard = (
  records: Planned[],
  cardId: string,
  selfId: string | null
) =>
  records.map((r): Planned => {
    const others = r.entities.filter(
      (l) => !("entityId" in l && l.entityId === selfId)
    );
    if (others.length > 0) {
      return r;
    }
    const has = (role: string) => r.entities.some((l) => l.role === role);
    let role: Planned["entities"][number]["role"] = "about";
    if (r.kind === "event") {
      role = "participant";
    } else if (r.kind === "commitment") {
      role = has("debtor") ? "creditor" : "debtor";
      if (has("debtor") && has("creditor")) {
        role = "about";
      }
    }
    return { ...r, entities: [...r.entities, { entityId: cardId, role }] };
  });
