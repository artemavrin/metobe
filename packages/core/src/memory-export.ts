import "server-only";
import type {
  MemoryCard,
  MemoryOverview,
  MemoryRecordView,
} from "@metobe/contracts/memory";

import { memoryCard, memoryOverview } from "./memory-page";

// «Выгрузить память» (Д7.3): everything the person's memory holds as one Markdown file — what a person reads and
// another model takes as it is. By cards: what is open, what is known, what was before, what happened, what is closed;
// then the rules and what the person told about themselves. Read the way the page reads, so the file holds what the
// page shows; the owner's own records only, as everywhere.

type Language = "en" | "ru";

const WORDS = {
  en: {
    about: "About me",
    aliases: "Other names",
    before: "Before",
    by: "by",
    cancelled: "cancelled",
    closed: "Closed",
    date: "Dates are days in",
    done: "done",
    events: "History",
    given: "given",
    heading: "Memory",
    important: "important",
    kinds: {
      custom: "Thing",
      group: "Group",
      org: "Organization",
      person: "Person",
      project: "Project",
    },
    known: "Known",
    members: "Members",
    nothing: "Nothing is kept yet.",
    open: "Open",
    replaced: "Replaced by a later message",
    rules: "Rules",
    since: "since",
    unconfirmed: "waiting to be confirmed",
    until: "until",
    you: "you",
  },
  ru: {
    about: "Обо мне",
    aliases: "Другие имена",
    before: "Раньше",
    by: "срок",
    cancelled: "отменено",
    closed: "Закрыто",
    date: "Даты — дни в поясе",
    done: "выполнено",
    events: "История",
    given: "дано",
    heading: "Память",
    important: "важно",
    kinds: {
      custom: "Предмет",
      group: "Группа",
      org: "Организация",
      person: "Человек",
      project: "Проект",
    },
    known: "Известно",
    members: "Участники",
    nothing: "Пока ничего не записано.",
    open: "Открыто",
    replaced: "Заменено более поздним сообщением",
    rules: "Правила",
    since: "с",
    unconfirmed: "ждёт подтверждения",
    until: "до",
    you: "вы",
  },
} satisfies Record<Language, Record<string, unknown>>;

const OPEN = new Set(["open", "unconfirmed"]);

/** A day in the person's zone, `yyyy-mm-dd`. */
const dayOf = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(new Date(iso));

/** One line of a card's list: the text and what goes with it. */
const line = (
  r: MemoryRecordView,
  w: (typeof WORDS)[Language],
  timeZone: string,
  lead?: string
) => {
  const day = (iso: string | null) => (iso ? dayOf(iso, timeZone) : null);
  const notes = [
    r.kind === "commitment" && r.status === "unconfirmed" && w.unconfirmed,
    r.kind === "commitment" &&
      r.status === "done" &&
      `${w.done} ${day(r.doneAt) ?? ""}`.trim(),
    r.kind === "commitment" && r.status === "cancelled" && w.cancelled,
    r.dueAt && `${w.by} ${day(r.dueAt)}`,
    r.givenAt && r.kind === "commitment" && `${w.given} ${day(r.givenAt)}`,
    r.occurredAt && day(r.occurredAt),
    r.validFrom && r.kind === "fact" && `${w.since} ${day(r.validFrom)}`,
    r.validTo && `${w.until} ${day(r.validTo)}`,
    r.important && w.important,
  ].filter(Boolean);
  const head = lead ? `${lead}: ` : "";
  const tail = notes.length > 0 ? ` (${notes.join("; ")})` : "";
  return `- ${head}${r.text.replaceAll("\n", " ")}${tail}`;
};

/** Who owes whom, in words: «Ирина Белова → вы». */
const direction = (r: MemoryRecordView, w: (typeof WORDS)[Language]) => {
  const name = (role: string) => {
    const e = r.entities.find((x) => x.role === role);
    if (!e) {
      return "?";
    }
    return e.kind === "self" ? w.you : e.name;
  };
  return r.kind === "commitment"
    ? `${name("debtor")} → ${name("creditor")}`
    : undefined;
};

const section = (title: string, lines: string[]) =>
  lines.length > 0 ? [`### ${title}`, ...lines, ""] : [];

const cardText = (
  data: MemoryCard,
  w: (typeof WORDS)[Language],
  timeZone: string
) => {
  const { card, records } = data;
  const reach = [
    w.kinds[card.kind],
    card.type,
    card.role,
    card.email,
    card.phone,
  ].filter(Boolean);
  const commitments = records.filter((r) => r.kind === "commitment");
  const known = records.filter(
    (r) => (r.kind === "fact" || r.kind === "assessment") && !r.deletedAt
  );
  const events = records.filter((r) => r.kind === "event");
  const l = (r: MemoryRecordView, lead = false) =>
    line(r, w, timeZone, lead ? direction(r, w) : undefined);
  return [
    `## ${card.name}`,
    reach.join(" · "),
    card.aliases.length > 0 ? `${w.aliases}: ${card.aliases.join(", ")}` : "",
    "",
    ...(data.members && data.members.length > 0
      ? [`${w.members}: ${data.members.map((m) => m.name).join(", ")}`, ""]
      : []),
    ...section(
      w.open,
      commitments.filter((r) => OPEN.has(r.status ?? "")).map((r) => l(r, true))
    ),
    ...section(
      w.known,
      known.filter((r) => !r.validTo).map((r) => l(r))
    ),
    ...section(
      w.before,
      known.filter((r) => r.validTo).map((r) => l(r))
    ),
    ...section(
      w.events,
      events.filter((r) => !r.supersededAt).map((r) => l(r))
    ),
    ...section(
      w.replaced,
      events.filter((r) => r.supersededAt).map((r) => l(r))
    ),
    ...section(
      w.closed,
      commitments
        .filter((r) => !OPEN.has(r.status ?? ""))
        .map((r) => l(r, true))
    ),
  ];
};

/** The memory as one Markdown file, from the cards and the lists the page reads. */
export const memoryMarkdown = ({
  cards,
  language,
  me,
  now,
  rules,
  timeZone,
}: {
  cards: MemoryCard[];
  language: Language;
  me: MemoryRecordView[];
  now: Date;
  rules: MemoryRecordView[];
  timeZone: string;
}) => {
  const w = WORDS[language];
  const empty = cards.length + rules.length + me.length === 0;
  return `${[
    `# ${w.heading} · ${dayOf(now.toISOString(), timeZone)}`,
    "",
    `${w.date} ${timeZone}.`,
    "",
    ...(empty ? [w.nothing, ""] : []),
    ...cards.flatMap((c) => cardText(c, w, timeZone)),
    ...(rules.length > 0
      ? [`## ${w.rules}`, ...rules.map((r) => line(r, w, timeZone)), ""]
      : []),
    ...(me.length > 0
      ? [`## ${w.about}`, ...me.map((r) => line(r, w, timeZone)), ""]
      : []),
  ]
    .join("\n")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trimEnd()}\n`;
};

/** The owner's memory as Markdown. */
export const exportMemory = async (
  ownerId: string,
  options: { language: Language; timeZone: string }
) => {
  const overview: Omit<MemoryOverview, "on"> = await memoryOverview(ownerId);
  const read = await Promise.all(
    overview.cards.map((c) => memoryCard(ownerId, c.id))
  );
  const cards = read.filter((c): c is MemoryCard => c !== null);
  return memoryMarkdown({
    cards,
    language: options.language,
    me: overview.me,
    now: new Date(),
    rules: overview.rules,
    timeZone: options.timeZone,
  });
};
