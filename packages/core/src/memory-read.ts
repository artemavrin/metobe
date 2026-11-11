import "server-only";
import { MEMORY_SHOWN } from "@metobe/contracts/memory";
import type {
  MemoryCard,
  MemoryRecordView,
  ShowCardOutput,
  ShowPromisesOutput,
} from "@metobe/contracts/memory";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

import { listEntities, listRecords } from "./memory";
import type { MemoryEntity, MemoryRecord } from "./memory";
import { mentionedCards } from "./memory-candidates";
import { memoryCard, searchMemory, viewsOf } from "./memory-page";

// The chat reads the memory (ARCH §19.5, Б4): the cards a message mentions go to the model as a short block in front
// of the message — what is open with them, what is known, when they last met; the rest it asks for with three tools.
// It reads, it never writes: the memory keeps itself after the answer (§19.4).

export const SEARCH_MEMORY = "search_memory";
export const MEMORY_CARD = "memory_card";
export const LIST_COMMITMENTS = "list_commitments";
export const LIST_CARDS = "list_cards";
/** What stands in the answer as a card or a list the person can act on (not read silently). */
export const SHOW_CARD = "show_card";
export const SHOW_PROMISES = "show_promises";
export const MEMORY_TOOLS = [
  SEARCH_MEMORY,
  MEMORY_CARD,
  LIST_COMMITMENTS,
  LIST_CARDS,
];

/** Cards in the block, and what of each: enough to answer «что с Ольгой?», short enough for every message. */
const MAX_CARDS = 5;
const MAX_KNOWN = 5;
const MAX_EVENTS = 2;
/** What the user told about themselves — goals, ways of working — goes with every message: a few, the newest. */
const MAX_SELF = 8;
const MAX_FOUND = 30;
/** `list_cards`: everyone, with what is known about each — the model matches by meaning («SQL» for «анализ данных»). */
const MAX_PEOPLE = 100;
const MAX_PER_PERSON = 8;
/** `memory_card`: all of one card, the open first — enough for a long history, short of a whole archive. */
const MAX_CARD = 80;
/** A card's id as the model sees it: the first eight of its uuid — short, and unique among one person's cards. */
const ID_LENGTH = 8;

export const shortId = (id: string) => id.slice(0, ID_LENGTH);
const tag = (e: { id: string }) => `[${shortId(e.id)}]`;
const day = (d: Date | string | null, timeZone: string) =>
  d
    ? new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone,
        year: "numeric",
      }).format(new Date(d))
    : null;

const OPEN = new Set(["open", "unconfirmed"]);

/**
 * A record's kind as the model reads it. The words it reads are the words it answers in: «commitment» and «fact» came
 * back to the user as «обязательство» and «запись» (`apps/cli/dev/memory-voice-check.ts`), so the block names things
 * the way a person would.
 */
const SAID_AS: Record<MemoryRecord["kind"], string> = {
  assessment: "the user's view",
  commitment: "promise",
  event: "happened",
  fact: "known",
  rule: "rule",
};

/** A record as the model reads it: its text and what goes with it, compact. */
const lineOf = (
  r: MemoryRecord | MemoryRecordView,
  names: Map<string, Pick<MemoryEntity, "kind" | "name">>,
  timeZone: string
) => {
  const ids = r.entities.map((e) => ("entityId" in e ? e.entityId : e.id));
  const who = (role: string) => {
    const at = r.entities.findIndex((e) => e.role === role);
    const entity = at === -1 ? undefined : names.get(ids[at] ?? "");
    if (!entity) {
      return null;
    }
    return entity.kind === "self" ? "the user" : entity.name;
  };
  const notes = [
    r.kind === "commitment" &&
      `by ${who("debtor") ?? "?"} to ${who("creditor") ?? "?"}`,
    r.status && r.status !== "open" && r.status,
    r.important && "important",
    r.dueAt && `due ${day(r.dueAt, timeZone)}`,
    r.givenAt && `given ${day(r.givenAt, timeZone)}`,
    r.occurredAt &&
      `on ${day(r.occurredAt, timeZone)}${r.occurredPrecision && r.occurredPrecision !== "day" ? ` (${r.occurredPrecision})` : ""}`,
    r.validFrom && `since ${day(r.validFrom, timeZone)}`,
    r.validTo && `until ${day(r.validTo, timeZone)}`,
    "supersededAt" in r && r.supersededAt && "replaced by a later message",
  ].filter(Boolean);
  return `${SAID_AS[r.kind]}: «${r.text}»${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`;
};

/** What the memory has about one card, in a few lines. */
const cardBlock = (
  card: MemoryEntity,
  records: MemoryRecord[],
  names: Map<string, MemoryEntity>,
  timeZone: string
) => {
  const mine = records.filter((r) =>
    r.entities.some((e) => e.entityId === card.id)
  );
  const open = mine.filter(
    (r) => r.kind === "commitment" && OPEN.has(r.status ?? "")
  );
  const known = mine
    .filter((r) => (r.kind === "fact" || r.kind === "assessment") && !r.validTo)
    .slice(0, MAX_KNOWN);
  const events = mine.filter((r) => r.kind === "event").slice(0, MAX_EVENTS);
  const lines = [...open, ...known, ...events].map(
    (r) => `  - ${lineOf(r, names, timeZone)}`
  );
  const reach = [
    card.email && `email ${card.email}`,
    card.phone && `phone ${card.phone}`,
  ].filter(Boolean);
  if (reach.length > 0) {
    lines.unshift(`  - reach: ${reach.join(", ")}`);
  }
  const about = [card.kind === "org" ? "organization" : card.kind, card.role]
    .filter(Boolean)
    .join("; ");
  return [`- ${card.name} ${tag(card)} (${about})`, ...lines].join("\n");
};

/** The user's own lasting facts — their goals and ways of working — newest first. */
const selfLines = (self: MemoryEntity | undefined, records: MemoryRecord[]) =>
  self
    ? records
        .filter(
          (r) =>
            r.kind === "fact" &&
            !r.validTo &&
            r.entities.some((e) => e.entityId === self.id && e.role === "about")
        )
        .slice(0, MAX_SELF)
        .map((r) => `  - «${r.text}»`)
    : [];

/**
 * The block in front of the person's message: what they told about themselves, then the cards the message mentions
 * and what is kept about them. Empty when there is neither — the model can still search.
 */
export const memoryBrief = async (
  ownerId: string,
  text: string,
  timeZone: string,
  /** Cards the person named with `@` (Д4), by id: they come first, whatever the words say. */
  named: string[] = []
) => {
  const entities = await listEntities(ownerId);
  const cards = [
    ...new Set([
      ...entities.filter((e) => e.kind !== "self" && named.includes(e.id)),
      ...mentionedCards(entities, text),
    ]),
  ].slice(0, MAX_CARDS);
  const self = entities.find((e) => e.kind === "self");
  if (cards.length === 0 && !self) {
    return "";
  }
  const records = await listRecords(ownerId);
  const own = selfLines(self, records);
  if (cards.length === 0 && own.length === 0) {
    return "";
  }
  const names = new Map(entities.map((e) => [e.id, e]));
  const parts = [
    own.length > 0 &&
      `About the user — their goals and ways of working, from what they told; keep them in mind:\n${own.join("\n")}`,
    cards.length > 0 &&
      `About who this message mentions:\n${cards.map((c) => cardBlock(c, records, names, timeZone)).join("\n")}`,
  ].filter(Boolean);
  return `<memory>
What you remember of the user's work (dates are days in ${timeZone}; «the user» is the person you talk to). Use it when it helps; ask ${SEARCH_MEMORY}, ${MEMORY_CARD}, ${LIST_COMMITMENTS} or ${LIST_CARDS} for more. The [ids] are for ${MEMORY_CARD}; never show them to the user. It may be out of date or wrong — the user's words now come first.
${parts.join("\n")}
</memory>`;
};

const RANK: Record<string, number> = {
  assessment: 1,
  commitment: 0,
  event: 2,
  fact: 1,
  rule: 3,
};

/** Closed, or no longer true. */
const isPast = (r: MemoryRecordView) =>
  Boolean(r.validTo) ||
  Boolean(r.supersededAt) ||
  (r.kind === "commitment" && !OPEN.has(r.status ?? ""));

/** A card's records for the model: open commitments, what is true now, events — then what is closed or past. */
const cardOrder = (records: MemoryRecordView[]) =>
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
  [...records].sort(
    (a, b) =>
      Number(isPast(a)) - Number(isPast(b)) ||
      (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9)
  );

/** Open commitments: «важно» first, then the nearest deadline, those without one last. */
const byUrgency = (a: MemoryRecordView, b: MemoryRecordView) =>
  Number(b.important) - Number(a.important) ||
  (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
  b.recordedAt.localeCompare(a.recordedAt);

const isOpen = (r: MemoryRecordView) =>
  r.kind === "commitment" && OPEN.has(r.status ?? "");

/** What `show_card` leaves in the answer, from a card as the page reads it: its open promises, the urgent first. */
export const shownCard = (data: MemoryCard): ShowCardOutput => {
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts the filter's own copy
  const open = data.records.filter(isOpen).sort(byUrgency);
  return {
    card: data.card,
    contact: data.contact,
    found: true,
    moreOpen: Math.max(0, open.length - MEMORY_SHOWN),
    open: open.slice(0, MEMORY_SHOWN),
  };
};

/** What `show_promises` leaves in the answer, from the open promises already ordered. */
export const shownPromises = (
  records: MemoryRecordView[],
  today: string,
  card: ShowPromisesOutput["card"]
): ShowPromisesOutput => ({
  card,
  more: Math.max(0, records.length - MEMORY_SHOWN),
  records: records.slice(0, MEMORY_SHOWN),
  today,
});

/** The names of the cards a view points at, enough for `lineOf`. */
const namesIn = (records: MemoryRecordView[]) =>
  new Map(records.flatMap((r) => r.entities.map((e) => [e.id, e] as const)));

/**
 * What the model is told of a widget that is already on screen: the same lines `memory_card` and `list_commitments`
 * give, and that it must not say them again. The cards' full ids never go to it.
 */
export const toldOfShown = (
  output: ShowCardOutput | ShowPromisesOutput,
  timeZone: string
) => {
  if ("found" in output) {
    if (!output.found) {
      return {
        type: "json" as const,
        value: output.candidates
          ? {
              candidates: output.candidates,
              note: "No widget: several cards fit. Ask the user which one.",
            }
          : { found: false },
      };
    }
    const names = namesIn(output.open);
    const lines = output.open.map((r) => `- ${lineOf(r, names, timeZone)}`);
    const more =
      output.moreOpen > 0 ? `\n(and ${output.moreOpen} more open)` : "";
    return {
      type: "text" as const,
      value: `The card of ${output.card.name} [${shortId(output.card.id)}] is on screen with the open promises; the user can mark them done and move deadlines there. Do not repeat the list — say in a sentence what matters.\n${lines.length > 0 ? lines.join("\n") : "Nothing open."}${more}`,
    };
  }
  const names = namesIn(output.records);
  const lines = output.records.map((r) => `- ${lineOf(r, names, timeZone)}`);
  const more = output.more > 0 ? `\n(and ${output.more} more open)` : "";
  return {
    type: "text" as const,
    value: `The list of open promises${output.card ? ` of ${output.card.name}` : ""} is on screen (today is ${output.today}); the user can mark them done and move deadlines there. Do not repeat the list — say in a sentence what matters.\n${lines.length > 0 ? lines.join("\n") : "Nothing open."}${more}`,
  };
};

/** A card by its [id] or by a name: the one card, or the ones a name fits when it is more than one. */
const resolveCard = async (
  ownerId: string,
  { id, name }: { id?: string; name?: string }
) => {
  const entities = await listEntities(ownerId);
  const cards = entities.filter((e) => e.kind !== "self");
  const wanted = id?.replaceAll(/[[\]\s]/gu, "").toLowerCase();
  const byId = wanted ? cards.filter((e) => e.id.startsWith(wanted)) : [];
  return byId.length > 0 ? byId : mentionedCards(cards, name ?? "");
};

const candidatesOf = (fits: MemoryEntity[]) =>
  fits.map((e) => ({ id: shortId(e.id), name: e.name, role: e.role }));

const cardInput = z.object({
  id: z
    .string()
    .optional()
    .describe("The card's id as the memory shows it: «a1b2c3d4»"),
  name: z
    .string()
    .optional()
    .describe("Or the name as the user says it: «Ольга», «Вектор»"),
});

/**
 * The tools that put a card or a list of promises in the answer, where the person acts on them (Д1). Apart from the
 * reading tools: the model reads a card silently before a letter or an advice, and a widget at every read would be noise.
 * The chat has them; a task's run does not — its letter has no buttons.
 */
export const memoryShowTools = (
  ownerId: string,
  timeZone: string
): ToolSet => ({
  [SHOW_CARD]: tool({
    description:
      "Shows one person, organization or project as a card in the answer, with its open promises the user can mark done or move. Use it when the user asks what is going on with someone: «что у меня с Ольгой?», «покажи Вектор». Not for reading a card to write a letter or give advice — read it with memory_card then. After it say in a sentence what matters; do not repeat the list.",
    execute: async (input): Promise<ShowCardOutput> => {
      const fits = await resolveCard(ownerId, input);
      if (fits.length > 1) {
        return { candidates: candidatesOf(fits), found: false };
      }
      const [card] = fits;
      const data = card ? await memoryCard(ownerId, card.id) : null;
      return data ? shownCard(data) : { found: false };
    },
    inputSchema: cardInput,
    toModelOutput: ({ output }) => toldOfShown(output, timeZone),
  }),
  [SHOW_PROMISES]: tool({
    description:
      "Shows the open promises as a list in the answer — the user can mark them done or move deadlines there. For «что горит», «что я обещал», «кто мне должен», «что просрочено»; with `card` — only that person's, organization's or project's. Not for reading them to write something — read them with list_commitments then. After it say in a sentence what matters; do not repeat the list.",
    execute: async ({
      card: ref,
      overdueOnly,
    }): Promise<ShowPromisesOutput> => {
      const today = day(new Date(), timeZone) ?? "";
      let card: ShowPromisesOutput["card"] = null;
      let entityId: string | undefined;
      if (ref) {
        const fits = await resolveCard(ownerId, { id: ref, name: ref });
        // A name that fits several cards, or none: the list of everyone's is better than a guess.
        if (fits.length === 1 && fits[0]) {
          entityId = fits[0].id;
          card = { id: fits[0].id, name: fits[0].name };
        }
      }
      const all = await listRecords(ownerId, {
        entityId,
        kinds: ["commitment"],
      });
      const records = await viewsOf(
        ownerId,
        all.filter((r) => OPEN.has(r.status ?? ""))
      );
      const open = records
        .filter(
          (r) =>
            !overdueOnly || (r.dueAt && (day(r.dueAt, timeZone) ?? "") < today)
        )
        // oxlint-disable-next-line unicorn/no-array-sort -- sorts the filter's own copy
        .sort(byUrgency);
      return shownPromises(open, today, card);
    },
    inputSchema: z.object({
      card: z
        .string()
        .optional()
        .describe("Only this card's: its id or the name as the user says it"),
      overdueOnly: z
        .boolean()
        .optional()
        .describe("Only those past their deadline"),
    }),
    toModelOutput: ({ output }) => toldOfShown(output, timeZone),
  }),
});

/** The memory's tools: read only. */
export const memoryTools = (ownerId: string, timeZone: string): ToolSet => {
  const lines = async (records: (MemoryRecord | MemoryRecordView)[]) => {
    const entities = await listEntities(ownerId);
    const names = new Map(entities.map((e) => [e.id, e]));
    return records.map((r) => lineOf(r, names, timeZone));
  };
  return {
    [LIST_COMMITMENTS]: tool({
      description:
        "The promises still open — what others promised the user and what the user promised others — with deadlines, nearest first. For «что я обещал», «кто мне должен», «что горит», «что просрочено».",
      execute: async ({ overdueOnly }) => {
        const all = await listRecords(ownerId, { kinds: ["commitment"] });
        const today = day(new Date(), timeZone) ?? "";
        const open = all
          .filter((r) => OPEN.has(r.status ?? ""))
          .filter(
            (r) =>
              !overdueOnly ||
              (r.dueAt && (day(r.dueAt, timeZone) ?? "") < today)
          )
          // oxlint-disable-next-line unicorn/no-array-sort -- sorts the filter's own copy
          .sort(
            (a, b) =>
              Number(b.important) - Number(a.important) ||
              (a.dueAt?.getTime() ?? Infinity) -
                (b.dueAt?.getTime() ?? Infinity)
          );
        return { promises: await lines(open.slice(0, MAX_FOUND)), today };
      },
      inputSchema: z.object({
        overdueOnly: z
          .boolean()
          .optional()
          .describe("Only those past their deadline"),
      }),
    }),
    [LIST_CARDS]: tool({
      description:
        "Everyone you remember of one kind — people, organizations or projects — each with its [id], role and what is known: skills, what they work on, what the user thinks of them. For questions by meaning, not by name: «кому поручить анализ данных», «кто разбирается в базах», «какой поставщик возит оборудование» — read the list and pick by sense.",
      execute: async ({ kind }) => {
        const entities = await listEntities(ownerId);
        const records = await listRecords(ownerId, {
          kinds: ["fact", "assessment"],
        });
        const known = records.filter((r) => !r.validTo);
        return {
          cards: entities
            .filter((e) => e.kind === (kind ?? "person"))
            .slice(0, MAX_PEOPLE)
            .map((e) => ({
              id: shortId(e.id),
              known: known
                .filter((r) => r.entities.some((l) => l.entityId === e.id))
                .slice(0, MAX_PER_PERSON)
                .map((r) =>
                  r.kind === "assessment" ? `оценка: ${r.text}` : r.text
                ),
              name: e.name,
              role: e.role,
            })),
        };
      },
      inputSchema: z.object({
        kind: z
          .enum(["person", "org", "project"])
          .optional()
          .describe("People by default; organizations or projects"),
      }),
    }),
    [MEMORY_CARD]: tool({
      description:
        "Everything you remember about one person, organization or project: who they are, open promises first, then what is known, what happened, and what is done or no longer true. Give its [id] from the <memory> block or another tool; a name works too — when it fits several, they come back to choose from, and then ask the user which one they mean.",
      execute: async (input) => {
        const fits = await resolveCard(ownerId, input);
        if (fits.length > 1) {
          return { candidates: candidatesOf(fits), found: false };
        }
        const [card] = fits;
        const data = card ? await memoryCard(ownerId, card.id) : null;
        if (!data) {
          return { found: false };
        }
        return {
          email: data.card.email,
          found: true,
          id: shortId(data.card.id),
          name: data.card.name,
          phone: data.card.phone,
          records: await lines(cardOrder(data.records).slice(0, MAX_CARD)),
          role: data.card.role,
        };
      },
      inputSchema: cardInput,
    }),
    [SEARCH_MEMORY]: tool({
      description:
        "Searches what you remember by words — not by meaning: people, organizations, projects and what is kept about them (what is known, what happened, promises, rules), done and cancelled ones too. A line is found only when it has every word of the query, so search a few times with other words for the same thing («SQL», then «базы данных», then «аналитика»); for who fits a task, read list_cards instead.",
      execute: async ({ query }) => {
        const found = await searchMemory(ownerId, query);
        return {
          cards: found.cards.map((c) => ({
            id: shortId(c.id),
            name: c.name,
            role: c.role,
          })),
          records: await lines(found.records.slice(0, MAX_FOUND)),
        };
      },
      inputSchema: z.object({
        query: z
          .string()
          .describe("Words to look for: «договор», «отпуск Андрея»"),
      }),
    }),
  };
};
