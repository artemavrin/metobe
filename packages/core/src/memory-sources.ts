import "server-only";
import { messages } from "@metobe/db/schema/chat";
import { and, desc, eq, lt } from "drizzle-orm";

import { getDb } from "./db";
import { CHAT_SOURCE, NOTE_SOURCE, listEntities, materialOf } from "./memory";
import type { QueuedWrite } from "./memory";
import { CONTEXT_TURNS, noteTurn } from "./memory-extract";
import type { ChatTurn } from "./memory-extract";
import { announceMemory } from "./task-events";

// Where the memory's material comes from (ARCH §19.9.5). A chat's message, a letter, a meeting's transcript are ways
// of getting material; the memory reads what an adapter hands it and knows none of them. A queued write names its
// source and the material there (`source`, `source_key`); the adapter of that source loads it. A new source is a
// new adapter here — the reading, the store and the queue stay as they are.

/** What the memory reads, however it was got. */
export interface MemoryInput {
  /** When it was said: «вчера» and «в среду» are counted from it. */
  at: Date;
  /** What the person said. */
  text: string;
  /** What was said before it, oldest first — to understand the text, never to record again. */
  context: ChatTurn[];
  /** The card it was written about (a note typed on it): a record naming no one else lies on that card. */
  about?: string;
}

export interface MemorySource {
  /** The material of a queued write; null — it is gone from its source, or has nothing in words. */
  load: (ownerId: string, write: QueuedWrite) => Promise<MemoryInput | null>;
  /** When the material was said, for the queue's order, if whoever queues it does not say. */
  saidAt?: (sourceKey: string) => Promise<Date | undefined>;
  /** A write changed the memory: whoever shows the material shows «Запомнено» or asks its question. */
  announce?: (ownerId: string, write: QueuedWrite) => Promise<void>;
  /** Written to be remembered: the decision model is not asked whether there is anything to keep (Б2b). */
  meant?: boolean;
}

// ── Chat: the material is a message the person sent ────────────────────────────────────────────────────────────────

const textOf = (parts: (typeof messages.$inferSelect)["parts"]) =>
  parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim();

/**
 * The chat the message follows (ARCH §19.8.2): the messages before it, as many as `chatContext` keeps — for the model
 * to understand «он», «передумал», an answer to the assistant's question or a story told over a few messages (S13,
 * part 5), not to record again: the queue reads a person's messages in order, what the earlier ones said is kept.
 */
const chatBefore = async (chatId: string, sentAt: Date) => {
  const rows = await getDb()
    .db.select({ parts: messages.parts, role: messages.role })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), lt(messages.createdAt, sentAt)))
    .orderBy(desc(messages.createdAt))
    .limit(CONTEXT_TURNS);
  // Oldest first.
  // oxlint-disable-next-line unicorn/no-array-reverse -- a fresh array; toReversed is past the ES2022 target
  return rows.reverse().flatMap((r): ChatTurn[] => {
    const text = textOf(r.parts);
    return text && (r.role === "user" || r.role === "assistant")
      ? [{ role: r.role, text }]
      : [];
  });
};

const chat: MemorySource = {
  announce: async (ownerId, write) => {
    // An open chat shows «Запомнено» or asks its question at once (P18).
    if (write.chatId) {
      await announceMemory(ownerId, write.chatId);
    }
  },
  load: async (_ownerId, write) => {
    // The chat deleted since the message was queued: not read.
    if (!write.chatId) {
      return null;
    }
    const [message] = await getDb()
      .db.select({
        createdAt: messages.createdAt,
        parts: messages.parts,
        role: messages.role,
      })
      .from(messages)
      .where(
        and(eq(messages.id, write.sourceKey), eq(messages.chatId, write.chatId))
      )
      .limit(1);
    // Gone already (the message edited away) or nothing in words: nothing to read.
    const text = message?.role === "user" ? textOf(message.parts) : "";
    if (!(message && text)) {
      return null;
    }
    return {
      at: message.createdAt,
      context: await chatBefore(write.chatId, message.createdAt),
      text,
    };
  },
  saidAt: async (messageId) => {
    const [row] = await getDb()
      .db.select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    return row?.createdAt;
  },
};

// ── Note: typed on a card to be remembered (P22 «Записать…») ───────────────────────────────────────────────────────

const note: MemorySource = {
  load: async (ownerId, write) => {
    const material = await materialOf(ownerId, write.id);
    if (!material?.text.trim()) {
      return null;
    }
    // The card it was typed on — as it is called now — comes before it, as the question it answers: «обещал к
    // пятнице» is about them. Deleted or merged away since — the note is read as it is.
    const cards = material.about ? await listEntities(ownerId) : [];
    const card = cards.find((e) => e.id === material.about);
    return {
      about: card?.id,
      at: write.sentAt,
      context: card ? [noteTurn(card)] : [],
      text: material.text,
    };
  },
  meant: true,
};

const SOURCES: Record<string, MemorySource> = {
  [CHAT_SOURCE]: chat,
  [NOTE_SOURCE]: note,
};

/** The adapter of a source; none — material of a source this build does not know. */
export const memorySource = (kind: string): MemorySource | undefined =>
  SOURCES[kind];
