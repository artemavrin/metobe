import type {
  ChatKind,
  ChatMessage,
  ChatRole,
  ChatVisibility,
} from "@metobe/contracts/chat";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// ARCH §5.3, the shape of vercel/chatbot: a chat, its messages as AI SDK UI parts, the streams it had, votes.
// Documents (artifacts) are v2; `agent_id` comes with the agents table.

export const chats = pgTable(
  "chats",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    /** An agent run is an ordinary chat (ARCH §16). */
    kind: text("kind").$type<ChatKind>().notNull().default("chat"),
    title: text("title").notNull(),
    /** Moves with every message, so the sidebar shows the latest chats first. */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    visibility: text("visibility")
      .$type<ChatVisibility>()
      .notNull()
      .default("private"),
  },
  (table) => [
    index("chats_user_updated").on(table.userId, table.updatedAt.desc()),
    check("chats_kind", sql`${table.kind} in ('chat', 'agent_run')`),
    check(
      "chats_visibility",
      sql`${table.visibility} in ('private', 'public')`
    ),
  ]
);

export const messages = pgTable(
  "messages",
  {
    attachments: jsonb("attachments").$type<unknown[]>().notNull().default([]),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey(),
    /** `UIMessage['metadata']`: which model wrote an answer. */
    metadata: jsonb("metadata").$type<ChatMessage["metadata"]>(),
    /** `UIMessage['parts']` as is — the persistence format the AI SDK recommends. */
    parts: jsonb("parts").$type<ChatMessage["parts"]>().notNull(),
    role: text("role").$type<ChatRole>().notNull(),
  },
  (table) => [
    index("messages_chat_time").on(table.chatId, table.createdAt),
    check(
      "messages_role",
      sql`${table.role} in ('user', 'assistant', 'system')`
    ),
  ]
);

/** Resumable streams of a chat (ARCH §6.4). */
export const streams = pgTable(
  "streams",
  {
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
  },
  (table) => [index("streams_chat").on(table.chatId)]
);

export const votes = pgTable(
  "votes",
  {
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    isUpvoted: boolean("is_upvoted").notNull(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.messageId] })]
);

export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;
