import type { ConnectionStatus } from "@metobe/contracts/catalog";
import type {
  MailPresetId,
  MailServer,
  MailToolPolicy,
} from "@metobe/contracts/email";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// A user's own mailboxes (ARCH §17.7): SMTP to send, IMAP to read, as many as they like. The password lives in
// `secrets` under owner_type 'mailbox'; these rows hold what is safe to show.

export const mailboxes = pgTable(
  "mailboxes",
  {
    address: text("address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    imap: jsonb("imap").$type<MailServer>().notNull(),
    lastError: text("last_error"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    preset: text("preset").$type<MailPresetId>().notNull(),
    smtp: jsonb("smtp").$type<MailServer>().notNull(),
    status: text("status")
      .$type<ConnectionStatus>()
      .notNull()
      .default("active"),
    /** «Ask first?» per tool, as the user set it; unset tools take the default (contracts/email). */
    toolPolicy: jsonb("tool_policy")
      .$type<MailToolPolicy>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
  },
  (table) => [
    unique("mailboxes_user_address").on(table.userId, table.address),
    index("mailboxes_user").on(table.userId),
    check(
      "mailboxes_status",
      sql`${table.status} in ('active', 'needs_reauth', 'error')`
    ),
  ]
);

export type Mailbox = typeof mailboxes.$inferSelect;
