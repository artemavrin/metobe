import "server-only";
import type {
  MemoryCard,
  MemoryCardItem,
  MemoryOverview,
  MemoryRecordSource,
  MemoryRecordView,
  MemorySearch,
} from "@metobe/contracts/memory";
import { chats, messages } from "@metobe/db/schema/chat";
import { and, eq } from "drizzle-orm";

import { getDb } from "./db";
import {
  commitmentCounts,
  listEntities,
  listQuestions,
  listRecords,
  recordHistory,
  writeChats,
} from "./memory";
import type { MemoryEntity, MemoryRecord } from "./memory";

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
    id: e.id,
    kind: e.kind,
    name: e.name,
    open: counts.get(e.id)?.open ?? 0,
    overdue: counts.get(e.id)?.overdue ?? 0,
    role: e.role,
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
      fromChat: Boolean(r.writeId),
      givenAt: iso(r.givenAt),
      id: r.id,
      important: r.important,
      kind: r.kind,
      occurredAt: iso(r.occurredAt),
      occurredPrecision: r.occurredPrecision,
      recordedAt: r.recordedAt.toISOString(),
      status: r.status,
      text: r.text,
      validFrom: iso(r.validFrom),
      validTo: iso(r.validTo),
    };
  });
};

/** People, organizations and projects with their open and overdue commitments; the questions; the rules. */
export const memoryOverview = async (
  ownerId: string
): Promise<Omit<MemoryOverview, "on">> => {
  const entities = await listEntities(ownerId);
  const [cards, questions, rules] = await Promise.all([
    cardItems(ownerId, entities),
    listQuestions(ownerId),
    listRecords(ownerId, { kinds: ["rule"] }),
  ]);
  return {
    cards,
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
    listRecords(ownerId, { entityId: id }),
  ]);
  const [card] = cards;
  return card
    ? { card, records: await views(ownerId, records, entities) }
    : null;
};

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
    (e) => isCard(e) && has(e.name, e.role, ...e.aliases)
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
  if (origin?.chatId) {
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
          eq(messages.id, origin.messageId),
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
    recordedAt: record.recordedAt.toISOString(),
    said,
    saidAt,
    versions: history.versions.map((v) => ({
      recordedAt: v.recordedAt.toISOString(),
      text: v.text,
    })),
  };
};
