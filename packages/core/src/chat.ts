import "server-only";
import type { ChatMessage } from "@metobe/contracts/chat";
import { chats, messages } from "@metobe/db/schema/chat";
import {
  modelRuns,
  models,
  providers,
  sources,
} from "@metobe/db/schema/models";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb } from "./db";

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
    .select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt })
    .from(chats)
    .where(and(eq(chats.userId, userId), eq(chats.kind, "chat")))
    .orderBy(desc(chats.updatedAt))
    .limit(limit);
};

/** A chat's messages in order, ready for `useChat` and `convertToModelMessages`. */
export const listMessages = async (chatId: string): Promise<ChatMessage[]> => {
  const { db } = getDb();
  const rows = await db
    .select({
      id: messages.id,
      metadata: messages.metadata,
      parts: messages.parts,
      role: messages.role,
    })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt));
  return rows.map(({ metadata, ...m }) => (metadata ? { ...m, metadata } : m));
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
      .where(and(where, sql`${modelRuns.modelId} is not null`))
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
