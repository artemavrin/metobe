import type { FileKind } from "@metobe/contracts/files";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { chats } from "./chat";

// Attachments (D33): the bytes live in S3 under `storage_key`, this row says whose they are and what they are. A file
// is uploaded before its message goes (no chat yet), and joins the chat when the message is saved. Deleting a chat or
// a user removes the rows; core deletes the objects first.

export const files = pgTable(
  "files",
  {
    /** The chat whose message carries it; null while it waits in the composer. */
    chatId: uuid("chat_id").references(() => chats.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** What the «vision» model said a picture shows, kept so it is described once, not at every read. */
    description: text("description"),
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<FileKind>().notNull(),
    mediaType: text("media_type").notNull(),
    name: text("name").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("files_user").on(table.userId, table.createdAt),
    index("files_chat").on(table.chatId),
    check(
      "files_kind",
      sql`${table.kind} in ('image', 'pdf', 'text', 'doc', 'sheet')`
    ),
  ]
);

export type FileRow = typeof files.$inferSelect;
