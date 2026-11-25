import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, integer, jsonb, uuid, check } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export const user = pgTable(
  "user",
  {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text("role").default("user").notNull(),
  locale: text("locale"),
  timeZone: text("time_zone"),
  weekStart: integer("week_start"),
  dateFormat: text("date_format"),
  instructions: text("instructions"),
  sendKey: text("send_key"),
  // «Что нового»: the last version whose window this person has seen (null — not yet set, a new account), and
  // «Не показывать после обновлений».
  whatsNewSeen: text("whats_new_seen"),
  whatsNewOff: boolean("whats_new_off").default(false).notNull(),
  // The person's own switch of the memory (ARCH §19.1): on — nothing of theirs is written or read; what is kept waits.
  memoryOff: boolean("memory_off").default(false).notNull(),
  // Where Metobe writes to the person (D43): what a task or a digest sends goes to the mail, to the Telegram chat the
  // person bound, or both. A switch is off only when the person turned it off; Telegram also needs a bound chat.
  notifyEmail: boolean("notify_email").default(true).notNull(),
  notifyTelegram: boolean("notify_telegram").default(true).notNull(),
  // The morning digest of «Не упустить» (D43): at what local time it goes (`09:00`; null — off), the local day it last
  // went and the rows it carried — it goes again only when a row is new.
  digestTime: text("digest_time"),
  digestSentOn: text("digest_sent_on"),
  digestKeys: jsonb("digest_keys").$type<string[]>(),
  // When an admin turned the account off: no sign-in, no code, no sessions; null — it works.
  disabledAt: timestamp("disabled_at"),
  // When the platform turned the person off (ORGS-PLAN §6): like `disabledAt`, but the organization cannot undo it.
  blockedAt: timestamp("blocked_at"),
  // The person's organization and role in it (D48, ARCH §20.3); `role` above stays the role in the install. Nullable
  // only for the release between expand and contract (ARCH §20.4): read them through `getMembership` (core), which
  // fills a row the previous release wrote in that window.
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "restrict",
  }),
  orgRole: text("org_role").$type<"owner" | "admin" | "member">(),
  },
  (table) => [
    check("user_org_role", sql`${table.orgRole} in ('owner', 'admin', 'member')`),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
