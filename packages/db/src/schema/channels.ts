import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// Where Metobe may write to a user besides their mail (D43): one row per user and kind. The mail needs none — it is the
// account's own address, proved by the sign-in. A Telegram chat is bound by a one-time code the user takes to the bot:
// `pending` holds the code's hash and its end; `active` holds the chat; `error` — the last send failed (blocked bot).

export const userChannels = pgTable(
  "user_channels",
  {
    /** The Telegram chat id, as text (they are big numbers); null until the user has pressed «Start» in the bot. */
    chatId: text("chat_id"),
    codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }),
    /** SHA-256 of the one-time code; only while `pending`. */
    codeHash: text("code_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** How the chat is shown in the settings: `@name`, or the first name. */
    display: text("display"),
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<"telegram">().notNull(),
    lastError: text("last_error"),
    status: text("status")
      .$type<"pending" | "active" | "error">()
      .notNull()
      .default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("user_channels_user_kind").on(table.userId, table.kind),
    // One Telegram account is one Metobe account's: a button press in a chat must mean one person.
    unique("user_channels_kind_chat").on(table.kind, table.chatId),
    check("user_channels_kind", sql`${table.kind} in ('telegram')`),
    check(
      "user_channels_status",
      sql`${table.status} in ('pending', 'active', 'error')`
    ),
  ]
);
