import "server-only";
import type { ChatMessage } from "@metobe/contracts/chat";
import { chats, messages, votes } from "@metobe/db/schema/chat";
import {
  modelRuns,
  models,
  providers,
  sources,
} from "@metobe/db/schema/models";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";

import { getDb } from "./db";
import { deleteChatObjects } from "./files";

// Chats and their messages (ARCH §5.3, §6): what `api/chat` reads and writes. Messages are AI SDK UI messages
// stored as they are; the history is always read from here, the client sends only its newest message.

export const getChat = async (id: string) => {
  const { db } = getDb();
  const [chat] = await db.select().from(chats).where(eq(chats.id, id)).limit(1);
  return chat ?? null;
};

export const createChat = async (chat: {
  id: string;
  userId: string;
  title: string;
}) => {
  const { db } = getDb();
  await db.insert(chats).values(chat).onConflictDoNothing();
};

/** A user's chats for the sidebar, the latest first. Agent runs live in their own place (v2). */
export const listChats = (userId: string, limit = 200) => {
  const { db } = getDb();
  return db
    .select({
      id: chats.id,
      pinnedAt: chats.pinnedAt,
      title: chats.title,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .where(and(eq(chats.userId, userId), eq(chats.kind, "chat")))
    .orderBy(desc(chats.updatedAt))
    .limit(limit);
};

// The user's own chats only: every change is scoped by the owner, so a guessed id changes nothing.
const own = (userId: string, id: string) =>
  and(eq(chats.id, id), eq(chats.userId, userId), eq(chats.kind, "chat"));

export const renameChat = async (userId: string, id: string, title: string) => {
  const { db } = getDb();
  await db.update(chats).set({ title }).where(own(userId, id));
};

/** Pins a chat to the top of the list, or lets it go back to its day. */
export const setChatPinned = async (
  userId: string,
  id: string,
  pinned: boolean
) => {
  const { db } = getDb();
  await db
    .update(chats)
    .set({ pinnedAt: pinned ? new Date() : null })
    .where(own(userId, id));
};

/** Deletes a chat with its messages (they go with it by foreign key); what it cost stays in the usage. */
export const deleteChat = async (userId: string, id: string) => {
  const { db } = getDb();
  const [mine] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(own(userId, id));
  if (!mine) {
    return;
  }
  // The files' objects first: their rows go with the chat, and after that nothing would name the objects.
  await deleteChatObjects(id);
  await db.delete(chats).where(own(userId, id));
};

/** The words of a query, lower case: «Выручка  2026» → ["выручка", "2026"]. */
const wordsOf = (query: string) =>
  query.toLowerCase().split(/\s+/u).filter(Boolean).slice(0, 8);

const likePattern = (word: string) =>
  `%${word.replaceAll(/[\\%_]/gu, (c) => `\\${c}`)}%`;

/** The text a message says, its parts joined: what a search reads. */
const spokenText = (parts: unknown) =>
  (Array.isArray(parts) ? parts : [])
    .flatMap((p: { type?: string; text?: unknown }) =>
      p?.type === "text" && typeof p.text === "string" ? [p.text] : []
    )
    .join(" ")
    // Markdown's marks and table bars are not words: a snippet reads as text.
    .replaceAll(/[*_`#>|~]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();

/** A few words around the first hit, so the match is in view. */
const snippetOf = (text: string, word: string) => {
  const at = text.toLowerCase().indexOf(word);
  const from = Math.max(0, at - 30);
  return `${from > 0 ? "…" : ""}${text.slice(from, from + 120)}`;
};

export interface ChatHit {
  id: string;
  title: string;
  updatedAt: Date;
  /** Where the words were found when it is not the title: a piece of a message around them. */
  snippet: string | null;
}

/**
 * The user's chats that hold every word of the query — in the title or in what was said — newest first. The
 * database narrows by the longest word; every word is checked here, on the title and the messages' text only (not
 * tool results or file names in the stored parts).
 */
export const searchChats = async (
  userId: string,
  query: string,
  limit = 8
): Promise<ChatHit[]> => {
  const words = wordsOf(query);
  // The longest word narrows the most.
  let longest = "";
  for (const w of words) {
    if (w.length > longest.length) {
      longest = w;
    }
  }
  if (!longest) {
    return [];
  }
  const { db } = getDb();
  const rows = await db
    .select({
      id: chats.id,
      parts: messages.parts,
      title: chats.title,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .leftJoin(messages, eq(messages.chatId, chats.id))
    .where(
      and(
        eq(chats.userId, userId),
        eq(chats.kind, "chat"),
        or(
          ilike(chats.title, likePattern(longest)),
          sql`${messages.parts}::text ilike ${likePattern(longest)}`
        )
      )
    )
    .orderBy(desc(chats.updatedAt), desc(messages.createdAt))
    .limit(400);
  const hits = new Map<string, ChatHit>();
  for (const r of rows) {
    if (hits.has(r.id)) {
      continue;
    }
    const title = r.title.toLowerCase();
    if (words.every((w) => title.includes(w))) {
      hits.set(r.id, { ...r, snippet: null });
      continue;
    }
    const text = spokenText(r.parts);
    const lower = `${title} ${text.toLowerCase()}`;
    if (text && words.every((w) => lower.includes(w))) {
      const word = words.find((w) => text.toLowerCase().includes(w)) ?? longest;
      hits.set(r.id, {
        id: r.id,
        snippet: snippetOf(text, word),
        title: r.title,
        updatedAt: r.updatedAt,
      });
    }
  }
  return [...hits.values()].slice(0, limit);
};

/** The user's votes in a chat: answer id → helpful (true) or not (false). */
export const listVotes = async (chatId: string) => {
  const rows = await getDb()
    .db.select({ isUpvoted: votes.isUpvoted, messageId: votes.messageId })
    .from(votes)
    .where(eq(votes.chatId, chatId));
  return Object.fromEntries(rows.map((r) => [r.messageId, r.isUpvoted]));
};

/**
 * Marks an answer of the user's chat helpful or not; `null` takes the vote back. False when the chat is not theirs
 * or the message is not an answer in it.
 */
export const setVote = async (
  userId: string,
  chatId: string,
  messageId: string,
  up: boolean | null
) => {
  const { db } = getDb();
  const [answer] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(chats, eq(chats.id, messages.chatId))
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.role, "assistant"),
        own(userId, chatId)
      )
    );
  if (!answer) {
    return false;
  }
  if (up === null) {
    await db
      .delete(votes)
      .where(and(eq(votes.chatId, chatId), eq(votes.messageId, messageId)));
    return true;
  }
  await db
    .insert(votes)
    .values({ chatId, isUpvoted: up, messageId })
    .onConflictDoUpdate({
      set: { isUpvoted: up },
      target: [votes.chatId, votes.messageId],
    });
  return true;
};

/** A chat's messages in order, ready for `useChat` and `convertToModelMessages`. */
export const listMessages = async (chatId: string): Promise<ChatMessage[]> => {
  const { db } = getDb();
  const rows = await db
    .select({
      createdAt: messages.createdAt,
      id: messages.id,
      metadata: messages.metadata,
      parts: messages.parts,
      role: messages.role,
    })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt));
  return rows.map(({ createdAt, metadata, ...m }) => ({
    ...m,
    metadata: { ...metadata, createdAt: createdAt.toISOString() },
  }));
};

/**
 * Stores messages of a chat and moves the chat up. A message saved again (the same id) keeps its place and
 * takes the new parts — a response that went on after a reconnect, or an edited one later (M3.2).
 */
export const saveMessages = async (chatId: string, list: ChatMessage[]) => {
  if (list.length === 0) {
    return;
  }
  const { db } = getDb();
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx
      .insert(messages)
      .values(
        list.map((m, i) => ({
          chatId,
          // One insert, one timestamp: a step apart keeps them in order.
          createdAt: new Date(now + i),
          id: m.id,
          metadata: m.metadata ?? null,
          parts: m.parts,
          role: m.role,
        }))
      )
      .onConflictDoUpdate({
        set: { metadata: sql`excluded.metadata`, parts: sql`excluded.parts` },
        target: messages.id,
      });
    await tx
      .update(chats)
      .set({ updatedAt: new Date(now) })
      .where(eq(chats.id, chatId));
  });
};

/**
 * Drops a message and everything after it — before the same message is sent again (a retry after an error, and
 * edit / regenerate later), so the model never sees it twice or an answer that no longer follows it.
 */
export const deleteMessagesFrom = async (chatId: string, messageId: string) => {
  const { db } = getDb();
  const [from] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.id, messageId)))
    .limit(1);
  if (!from) {
    return;
  }
  await db
    .delete(messages)
    .where(
      and(eq(messages.chatId, chatId), gte(messages.createdAt, from.createdAt))
    );
};

/** The models a user ran last — in this chat and anywhere; the caller keeps the first that is still in chat. */
export const getLastModelIds = async (userId: string, chatId?: string) => {
  const { db } = getDb();
  const last = async (where: ReturnType<typeof eq>) => {
    const [run] = await db
      .select({ modelId: modelRuns.modelId })
      .from(modelRuns)
      .where(
        and(
          where,
          eq(modelRuns.purpose, "chat"),
          sql`${modelRuns.modelId} is not null`
        )
      )
      .orderBy(desc(modelRuns.createdAt))
      .limit(1);
    return run?.modelId ?? null;
  };
  const [inChat, anywhere] = await Promise.all([
    chatId ? last(eq(modelRuns.chatId, chatId)) : null,
    last(eq(modelRuns.userId, userId)),
  ]);
  return [inChat, anywhere].filter((id): id is string => id !== null);
};

/** How a model is named on screen: its title and its maker's logo. */
const labelColumns = {
  id: models.id,
  providerLogo: providers.logo,
  providerTitle: providers.title,
  title: models.title,
};

/** Models that are in chat right now, newest first — what the composer may pick. */
export const listChatModelLabels = () => {
  const { db } = getDb();
  return db
    .select(labelColumns)
    .from(models)
    .innerJoin(sources, eq(sources.id, models.sourceId))
    .leftJoin(providers, eq(providers.id, models.providerId))
    .where(
      sql`${models.enabled} and ${sources.enabled} and coalesce(${sources.health}->>'state', '') <> 'error'`
    )
    .orderBy(
      sql`${models.releasedAt} desc nulls last`,
      desc(models.createdAt),
      asc(models.title)
    );
};
export type ModelLabel = Awaited<
  ReturnType<typeof listChatModelLabels>
>[number];

/** Names of any models, in chat or not — for answers written by a model that has left the chat since. */
export const getModelLabels = (ids: string[]) => {
  if (ids.length === 0) {
    return Promise.resolve([] as ModelLabel[]);
  }
  const { db } = getDb();
  return db
    .select(labelColumns)
    .from(models)
    .leftJoin(providers, eq(providers.id, models.providerId))
    .where(inArray(models.id, ids));
};

/**
 * A model that is in chat right now — on, in a source that is on and not failing — with what is needed to call
 * it; null for anything else, so a stale or foreign id never reaches a provider.
 */
export const getChatModel = async (id: string) => {
  const { db } = getDb();
  const [model] = await db
    .select({
      capabilities: models.capabilities,
      contextWindow: models.contextWindow,
      id: models.id,
      kind: sources.kind,
      modelId: models.modelId,
      priceCacheRead: models.priceCacheRead,
      priceCacheWrite: models.priceCacheWrite,
      priceCurrency: models.priceCurrency,
      priceInput: models.priceInput,
      priceOutput: models.priceOutput,
      priceUnitTokens: models.priceUnitTokens,
      sourceId: models.sourceId,
      title: models.title,
    })
    .from(models)
    .innerJoin(sources, eq(sources.id, models.sourceId))
    .where(
      and(
        eq(models.id, id),
        eq(models.enabled, true),
        eq(sources.enabled, true),
        sql`coalesce(${sources.health}->>'state', '') <> 'error'`
      )
    )
    .limit(1);
  return model ?? null;
};
export type ChatModel = NonNullable<Awaited<ReturnType<typeof getChatModel>>>;
