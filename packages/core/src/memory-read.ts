import "server-only";
import type { MemoryRecordView } from "@metobe/contracts/memory";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

import { listEntities, listRecords } from "./memory";
import type { MemoryEntity, MemoryRecord } from "./memory";
import { memoryCard, searchMemory } from "./memory-page";

// The chat reads the memory (ARCH §19.5, Б4): the cards a message mentions go to the model as a short block in front
// of the message — what is open with them, what is known, when they last met; the rest it asks for with three tools.
// It reads, it never writes: the memory keeps itself after the answer (§19.4).

export const SEARCH_MEMORY = "search_memory";
export const MEMORY_CARD = "memory_card";
export const LIST_COMMITMENTS = "list_commitments";
export const MEMORY_TOOLS = [SEARCH_MEMORY, MEMORY_CARD, LIST_COMMITMENTS];

/** Cards in the block, and what of each: enough to answer «что с Ольгой?», short enough for every message. */
const MAX_CARDS = 5;
const MAX_KNOWN = 5;
const MAX_EVENTS = 2;
const MAX_FOUND = 30;
const MIN_STEM = 4;

const normalize = (s: string) => s.toLocaleLowerCase("ru").replaceAll("ё", "е");

const wordsOf = (s: string) =>
  normalize(s)
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);

/**
 * Do two words name the same thing, declined: «Ольге» and «Ольга», «Седову» and «Седов», «Вектора» and «Вектор».
 * They share the start but for the last two letters, and at least four letters — «Ли» and «ли» never match.
 */
const sameWord = (a: string, b: string) => {
  const need = Math.max(MIN_STEM, Math.min(a.length, b.length) - 2);
  if (a.length < MIN_STEM || b.length < MIN_STEM) {
    return false;
  }
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) {
    common += 1;
  }
  return common >= need;
};

/** The cards a text mentions by a name or an other name, by any word of it. */
export const mentionedCards = (entities: MemoryEntity[], text: string) => {
  const said = wordsOf(text);
  return entities.filter(
    (e) =>
      e.kind !== "self" &&
      [e.name, ...e.aliases].some((name) =>
        wordsOf(name).some((w) => said.some((s) => sameWord(w, s)))
      )
  );
};

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

/** A record as the model reads it: its text and the facts around it, compact. */
const lineOf = (
  r: MemoryRecord | MemoryRecordView,
  names: Map<string, MemoryEntity>,
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
      `${who("debtor") ?? "?"} owes ${who("creditor") ?? "?"}`,
    r.status && r.status !== "open" && r.status,
    r.important && "important",
    r.dueAt && `due ${day(r.dueAt, timeZone)}`,
    r.givenAt && `given ${day(r.givenAt, timeZone)}`,
    r.occurredAt &&
      `on ${day(r.occurredAt, timeZone)}${r.occurredPrecision && r.occurredPrecision !== "day" ? ` (${r.occurredPrecision})` : ""}`,
    r.validFrom && `since ${day(r.validFrom, timeZone)}`,
    r.validTo && `until ${day(r.validTo, timeZone)}`,
  ].filter(Boolean);
  return `${r.kind}: «${r.text}»${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`;
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
  const about = [card.kind === "org" ? "organization" : card.kind, card.role]
    .filter(Boolean)
    .join("; ");
  return [`- ${card.name} (${about})`, ...lines].join("\n");
};

/**
 * The block in front of the person's message: the cards it mentions and what is kept about them. Empty when it
 * mentions none — the model can still search.
 */
export const memoryBrief = async (
  ownerId: string,
  text: string,
  timeZone: string
) => {
  const entities = await listEntities(ownerId);
  const cards = mentionedCards(entities, text).slice(0, MAX_CARDS);
  if (cards.length === 0) {
    return "";
  }
  const records = await listRecords(ownerId);
  const names = new Map(entities.map((e) => [e.id, e]));
  return `<memory>
What the user's memory keeps about who this message mentions (dates are days in ${timeZone}; «the user» is the person you talk to). Use it when it helps; ask ${SEARCH_MEMORY}, ${MEMORY_CARD} or ${LIST_COMMITMENTS} for more. It may be out of date or wrong — the user's words now come first.
${cards.map((c) => cardBlock(c, records, names, timeZone)).join("\n")}
</memory>`;
};

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
        "The user's open commitments from their memory — what others owe the user and what the user owes others — with deadlines, nearest first. For «что я обещал», «кто мне должен», «что горит», «что просрочено».",
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
        return { commitments: await lines(open.slice(0, MAX_FOUND)), today };
      },
      inputSchema: z.object({
        overdueOnly: z
          .boolean()
          .optional()
          .describe("Only those past their deadline"),
      }),
    }),
    [MEMORY_CARD]: tool({
      description:
        "Everything the user's memory keeps about one person, organization or project: who they are, open and closed commitments, facts, assessments, events.",
      execute: async ({ name }) => {
        const entities = await listEntities(ownerId);
        const [card] = mentionedCards(entities, name);
        const data = card ? await memoryCard(ownerId, card.id) : null;
        if (!data) {
          return { found: false };
        }
        return {
          found: true,
          name: data.card.name,
          records: await lines(data.records.slice(0, MAX_FOUND)),
          role: data.card.role,
        };
      },
      inputSchema: z.object({
        name: z
          .string()
          .describe("The name as the user says it: «Ольга», «Вектор»"),
      }),
    }),
    [SEARCH_MEMORY]: tool({
      description:
        "Searches the user's memory by words: people, organizations, projects and the records about them (facts, events, commitments, rules), done and cancelled ones too.",
      execute: async ({ query }) => {
        const found = await searchMemory(ownerId, query);
        return {
          cards: found.cards.map((c) => ({ name: c.name, role: c.role })),
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
