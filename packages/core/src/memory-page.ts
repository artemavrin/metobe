import "server-only";
import { setTimeout as sleep } from "node:timers/promises";

import type {
  MemoryCard,
  MemoryCardItem,
  MemoryNoteResult,
  MemoryOverview,
  MemoryRecordSource,
  MemoryRecordView,
  MemorySearch,
} from "@metobe/contracts/memory";
import { chats, messages } from "@metobe/db/schema/chat";
import { and, eq } from "drizzle-orm";

import { getDb } from "./db";
import {
  CHAT_SOURCE,
  NOTE_SOURCE,
  commitmentCounts,
  createEntity,
  listEntities,
  listQuestions,
  listRecords,
  materialOf,
  mergeSuggestions,
  recordHistory,
  writeChats,
  writeStatus,
} from "./memory";
import type { MemoryEntity, MemoryRecord, WriteMaterial } from "./memory";
import { groupMembers } from "./memory-groups";
import { queueMemoryWrite } from "./memory-queue";
import { cardContact } from "./memory-today";

// The «Память» page (ARCH §19, P16), put together from the store: the list of cards, a card, search and «Откуда».
// Owner checks stay in core/memory.ts; here — what the page shows. The memory is a person's thousands of records,
// opened in the process, so search runs over them here too (D39: the texts are sealed, Postgres cannot search them).

const MAX_FOUND = 100;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const normalize = (s: string) => s.toLocaleLowerCase("ru").replaceAll("ё", "е");

type Card = MemoryEntity & { kind: MemoryCardItem["kind"] };
const isCard = (e: MemoryEntity): e is Card => e.kind !== "self";

const cardItems = async (ownerId: string, entities: MemoryEntity[]) => {
  const counts = await commitmentCounts(ownerId);
  return entities.filter(isCard).map((e): MemoryCardItem => ({
    aliases: e.aliases,
    email: e.email,
    id: e.id,
    kind: e.kind,
    name: e.name,
    open: counts.get(e.id)?.open ?? 0,
    overdue: counts.get(e.id)?.overdue ?? 0,
    phone: e.phone,
    role: e.role,
    type: e.type,
  }));
};

/** Records as the page shows them: card names in place of ids, the chat each came from. */
const views = async (
  ownerId: string,
  records: MemoryRecord[],
  entities: MemoryEntity[]
): Promise<MemoryRecordView[]> => {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const origins = await writeChats(
    ownerId,
    records.flatMap((r) => (r.writeId ? [r.writeId] : []))
  );
  return records.map((r) => {
    const origin = r.writeId ? origins.get(r.writeId) : undefined;
    return {
      chatId: origin?.chatId ?? null,
      deletedAt: iso(r.deletedAt),
      doneAt: iso(r.doneAt),
      dueAt: iso(r.dueAt),
      entities: r.entities.flatMap((l) => {
        const e = byId.get(l.entityId);
        return e
          ? [{ id: e.id, kind: e.kind, name: e.name, role: l.role }]
          : [];
      }),
      fromChat: origin?.source === CHAT_SOURCE,
      givenAt: iso(r.givenAt),
      id: r.id,
      important: r.important,
      kind: r.kind,
      occurredAt: iso(r.occurredAt),
      occurredPrecision: r.occurredPrecision,
      recordedAt: r.recordedAt.toISOString(),
      status: r.status,
      supersededAt: iso(r.supersededAt),
      text: r.text,
      validFrom: iso(r.validFrom),
      validTo: iso(r.validTo),
    };
  });
};

/** A side of a «Один человек?» pair as the page shows it. */
const mergeSide = (c: MemoryEntity) => ({
  id: c.id,
  // The person's own card is never in a pair, nor a card of a kind the page does not name.
  kind: c.kind as Exclude<MemoryEntity["kind"], "self">,
  name: c.name,
  role: c.role,
});

/** People, organizations and projects with their open and overdue commitments; the questions; the rules. */
export const memoryOverview = async (
  ownerId: string
): Promise<Omit<MemoryOverview, "on">> => {
  const entities = await listEntities(ownerId);
  const self = entities.find((e) => e.kind === "self");
  const [cards, questions, pairs, rules, mine] = await Promise.all([
    cardItems(ownerId, entities),
    listQuestions(ownerId),
    mergeSuggestions(ownerId),
    listRecords(ownerId, { kinds: ["rule"] }),
    self
      ? listRecords(ownerId, {
          entityId: self.id,
          kinds: ["fact", "assessment"],
        })
      : [],
  ]);
  // «Обо мне»: what is about the person themselves, not what others say of them or what they owe.
  const about = mine.filter((r) =>
    r.entities.some((l) => l.entityId === self?.id && l.role === "about")
  );
  return {
    cards,
    me: await views(ownerId, about, entities),
    merges: pairs
      .filter((p) => p.keep.kind !== "self" && p.gone.kind !== "self")
      .map((p) => ({ gone: mergeSide(p.gone), keep: mergeSide(p.keep) })),
    questions: questions.map((q) => ({
      candidates: q.candidates,
      id: q.id,
      messageId: q.messageId,
      question: q.question,
      writeId: q.writeId,
    })),
    rules: await views(ownerId, rules, entities),
  };
};

/**
 * A card's records, and with them the events a later message replaced («Раньше»; ARCH §19.9.3). An old version of a
 * hand correction is not one: it has the message its correction has. A replaced one whose replacement was deleted
 * is out of sight with it.
 */
const withReplacedEvents = async (ownerId: string, entityId: string) => {
  const all = await listRecords(ownerId, { entityId, includeSuperseded: true });
  const replacers = await listRecords(ownerId, {
    ids: all.flatMap((r) => (r.supersededBy ? [r.supersededBy] : [])),
  });
  const writeOf = new Map(replacers.map((r) => [r.id, r.writeId]));
  return all.filter(
    (r) =>
      !r.supersededAt ||
      (r.kind === "event" &&
        r.supersededBy !== null &&
        writeOf.has(r.supersededBy) &&
        writeOf.get(r.supersededBy) !== r.writeId)
  );
};

/**
 * A card made by hand («+» next to a section of the list, P22): a person, an organization, a project, a group or a
 * thing of a kind the person names. One that already has the name (or another name of its) is not made twice: that
 * one comes back, `existed`.
 */
export const createCard = async (
  ownerId: string,
  input: { kind: MemoryCardItem["kind"]; name: string; type?: string }
): Promise<{ card: MemoryCardItem; existed: boolean }> => {
  const name = input.name.trim();
  const entities = await listEntities(ownerId);
  const key = normalize(name);
  const same = entities.find(
    (e) => isCard(e) && [e.name, ...e.aliases].some((n) => normalize(n) === key)
  );
  const entity =
    same ??
    (await createEntity(ownerId, {
      kind: input.kind,
      name,
      type: input.kind === "custom" ? input.type : undefined,
    }));
  const [card] = await cardItems(ownerId, [entity]);
  if (!card) {
    throw new Error("memory: the card was not made");
  }
  return { card, existed: Boolean(same) };
};

/** The groups the card is in now, then the projects its live records name — the most named first. */
const linksOf = (
  id: string,
  records: MemoryRecord[],
  entities: MemoryEntity[]
): NonNullable<MemoryCard["links"]> => {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const groups = [...groupMembers(records)]
    .filter(([, people]) => people.has(id))
    .flatMap(([groupId]) => {
      const e = byId.get(groupId);
      return e ? [{ id: e.id, kind: "group" as const, name: e.name }] : [];
    });
  const named = new Map<string, number>();
  for (const r of records) {
    if (r.supersededAt) {
      continue;
    }
    for (const { entityId } of r.entities) {
      if (byId.get(entityId)?.kind === "project") {
        named.set(entityId, (named.get(entityId) ?? 0) + 1);
      }
    }
  }
  const projects = [...named]
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own array
    .sort((a, b) => b[1] - a[1])
    .flatMap(([projectId]) => {
      const e = byId.get(projectId);
      return e ? [{ id: e.id, kind: "project" as const, name: e.name }] : [];
    });
  return [...groups, ...projects];
};

/** One card with all it takes part in; null — not the owner's, or the person's own. */
export const memoryCard = async (
  ownerId: string,
  id: string
): Promise<MemoryCard | null> => {
  const entities = await listEntities(ownerId);
  const entity = entities.find((e) => e.id === id);
  if (!(entity && isCard(entity))) {
    return null;
  }
  const [cards, records] = await Promise.all([
    cardItems(ownerId, [entity]),
    withReplacedEvents(ownerId, id),
  ]);
  const [card] = cards;
  if (!card) {
    return null;
  }
  const view = { card, records: await views(ownerId, records, entities) };
  if (entity.kind === "person" || entity.kind === "org") {
    const contact = await cardContact(ownerId, id, records, entities);
    return {
      ...view,
      contact: { every: contact.every, last: iso(contact.last) },
      links: linksOf(id, records, entities),
    };
  }
  if (entity.kind !== "group") {
    return view;
  }
  // Who is in it now: facts linking a person to it, not ended (core/memory-groups).
  const members = groupMembers(records).get(id) ?? new Set<string>();
  return {
    ...view,
    members: entities
      .filter((e) => members.has(e.id))
      .map((e) => ({ id: e.id, kind: e.kind, name: e.name })),
  };
};

/** The owner's records by id as the page shows them; deleted ones and other people's are not there. */
export const recordsByIds = async (ownerId: string, ids: string[]) => {
  if (ids.length === 0) {
    return [];
  }
  const [records, entities] = await Promise.all([
    listRecords(ownerId, { ids }),
    listEntities(ownerId),
  ]);
  return views(ownerId, records, entities);
};

/** Records of the owner as the page shows them (for what a tool puts in an answer). */
export const viewsOf = async (ownerId: string, records: MemoryRecord[]) =>
  views(ownerId, records, await listEntities(ownerId));

/** Cards by name, other name or role; records by text — every word of the query, in any order. */
export const searchMemory = async (
  ownerId: string,
  query: string
): Promise<MemorySearch> => {
  const words = normalize(query).split(/\s+/u).filter(Boolean);
  if (words.length === 0) {
    return { cards: [], records: [] };
  }
  const has = (...texts: (string | null)[]) => {
    const hay = normalize(texts.filter(Boolean).join(" "));
    return words.every((w) => hay.includes(w));
  };
  const entities = await listEntities(ownerId);
  const found = entities.filter(
    (e) => isCard(e) && has(e.name, e.role, e.email, e.phone, ...e.aliases)
  );
  const all = await listRecords(ownerId);
  const records = all.filter((r) => has(r.text)).slice(0, MAX_FOUND);
  return {
    cards: await cardItems(ownerId, found),
    records: await views(ownerId, records, entities),
  };
};

const textOf = (parts: (typeof messages.$inferSelect)["parts"]) =>
  parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim();

/** «Откуда»: the chat and the message it came from, and how it changed since. Null — no such record of the owner's. */
export const recordSource = async (
  ownerId: string,
  id: string
): Promise<MemoryRecordSource | null> => {
  const [[record], history] = await Promise.all([
    listRecords(ownerId, {
      ids: [id],
      includeDeleted: true,
      includeSuperseded: true,
    }),
    recordHistory(ownerId, id),
  ]);
  if (!(record && history)) {
    return null;
  }
  const origins = await writeChats(ownerId, [
    ...(record.writeId ? [record.writeId] : []),
    ...history.changes.flatMap((c) => (c.writeId ? [c.writeId] : [])),
  ]);
  const origin = record.writeId ? origins.get(record.writeId) : undefined;
  let chat: MemoryRecordSource["chat"] = null;
  let said: string | null = null;
  let saidAt: string | null = null;
  // «Откуда» knows the chat only: a record from another source shows its history without where it was said, until
  // that source's adapter can say it (ARCH §19.9.5).
  if (origin?.chatId && origin.source === CHAT_SOURCE) {
    const [row] = await getDb()
      .db.select({
        createdAt: messages.createdAt,
        parts: messages.parts,
        title: chats.title,
      })
      .from(messages)
      .innerJoin(chats, eq(chats.id, messages.chatId))
      .where(
        and(
          eq(messages.id, origin.sourceKey),
          eq(messages.chatId, origin.chatId),
          // The chat is the owner's: a write points at it, but the page shows nothing it cannot check.
          eq(chats.userId, ownerId)
        )
      )
      .limit(1);
    if (row) {
      chat = { id: origin.chatId, title: row.title };
      said = textOf(row.parts) || null;
      saidAt = row.createdAt.toISOString();
    }
  }
  // A note typed on a card: the write keeps its words.
  const note = origin?.source === NOTE_SOURCE && record.writeId;
  if (note) {
    const material = await materialOf(ownerId, note);
    said = material?.text ?? null;
  }
  return {
    changes: history.changes.map((c) => ({
      after: c.after,
      at: c.at.toISOString(),
      before: c.before,
      byHand: !c.writeId,
      chatId: (c.writeId && origins.get(c.writeId)?.chatId) || null,
      field: c.field,
    })),
    chat,
    note: Boolean(note && said),
    recordedAt: record.recordedAt.toISOString(),
    said,
    saidAt,
    versions: history.versions.map((v) => ({
      recordedAt: v.recordedAt.toISOString(),
      text: v.text,
    })),
  };
};

/** How long a note waits for the queue: one read is a few seconds; a longer queue — the page says it will be written. */
const NOTE_WAIT_MS = 20_000;
const NOTE_POLL_MS = 400;

/** The write's status once the queue has read it, or `queued` still at `until`. */
const settled = async (
  ownerId: string,
  id: string,
  until: number
): Promise<string | null> => {
  const status = await writeStatus(ownerId, id);
  if (status !== "queued" || Date.now() >= until) {
    return status;
  }
  await sleep(NOTE_POLL_MS);
  return settled(ownerId, id, until);
};

const writeMaterial = async (
  ownerId: string,
  material: WriteMaterial,
  timeZone: string
): Promise<MemoryNoteResult> => {
  const writeId = await queueMemoryWrite({
    at: new Date(),
    material,
    ownerId,
    source: NOTE_SOURCE,
    sourceKey: crypto.randomUUID(),
    timeZone,
  });
  const result = (status: MemoryNoteResult["status"]): MemoryNoteResult => ({
    asked: false,
    records: [],
    status,
    writeId,
  });
  if (!writeId) {
    return result("off");
  }
  const status = await settled(ownerId, writeId, Date.now() + NOTE_WAIT_MS);
  if (status !== "done") {
    return result(
      status === "skipped" || status === "failed" ? status : "queued"
    );
  }
  const [records, questions] = await Promise.all([
    listRecords(ownerId, { writeIds: [writeId] }),
    listQuestions(ownerId),
  ]);
  return {
    ...result("done"),
    asked: questions.some((q) => q.writeId === writeId),
    records: await views(ownerId, records, await listEntities(ownerId)),
  };
};

/**
 * «Записать…» on a card (P22): the note goes through the memory's queue as any material — the writer picks what it is
 * and where it lies — and the page is told what came of it, if the queue gets to it in `NOTE_WAIT_MS`.
 */
export const writeNote = async (
  ownerId: string,
  cardId: string,
  text: string,
  timeZone: string
): Promise<MemoryNoteResult | null> => {
  const entities = await listEntities(ownerId);
  const card = entities.find((e) => e.id === cardId);
  if (!(card && isCard(card))) {
    return null;
  }
  return writeMaterial(ownerId, { about: cardId, text }, timeZone);
};

/** A note with no card, typed in the search (⌘K): the writer picks what it is and which card it is about. */
export const writeFreeNote = (
  ownerId: string,
  text: string,
  timeZone: string
) => writeMaterial(ownerId, { text }, timeZone);

/** A rule typed on the «Правила» page (P22): read like a note, as a standing rule. */
export const writeRule = (ownerId: string, text: string, timeZone: string) =>
  writeMaterial(ownerId, { intent: "rule", text }, timeZone);
