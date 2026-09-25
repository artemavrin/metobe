import "server-only";
import type { ChatMessage } from "@metobe/contracts/chat";
import { chats, messages } from "@metobe/db/schema/chat";
import { models, sources } from "@metobe/db/schema/models";
import { and, asc, eq, sql } from "drizzle-orm";

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

/** A chat's messages in order, ready for `useChat` and `convertToModelMessages`. */
export const listMessages = async (chatId: string): Promise<ChatMessage[]> => {
  const { db } = getDb();
  const rows = await db
    .select({ id: messages.id, parts: messages.parts, role: messages.role })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt));
  return rows;
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
          parts: m.parts,
          role: m.role,
        }))
      )
      .onConflictDoUpdate({
        set: { parts: sql`excluded.parts` },
        target: messages.id,
      });
    await tx
      .update(chats)
      .set({ updatedAt: new Date(now) })
      .where(eq(chats.id, chatId));
  });
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
      modelId: models.modelId,
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
