import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

// Updates of this server (D35): one row per run of the updater, written when it ends — after a rollback has put the
// base back, so the row is not lost with it. While a run goes, its steps live in Redis.

export const updates = pgTable("updates", {
  /** The copy of the base made before it: the file in the updater's `backups` volume and its size in bytes. */
  backup: jsonb("backup").$type<{ file: string; size: number }>(),
  byUserId: text("by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  /** Why it failed, as the step that stopped it said. */
  error: text("error"),
  finishedAt: timestamp("finished_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  fromVersion: text("from_version").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  operation: text("operation")
    .$type<"install" | "rollback">()
    .notNull()
    .default("install"),
  /** A failed run: what came back — the image, or the image and the base from the copy. */
  restored: text("restored").$type<"image" | "image+db">(),
  /** The previous release's retained backup restored by a manual rollback. */
  rollbackBackup: jsonb("rollback_backup").$type<{
    file: string;
    size: number;
  }>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  status: text("status").$type<"done" | "failed">().notNull(),
  toVersion: text("to_version").notNull(),
  trigger: text("trigger")
    .$type<"manual" | "patch" | "nightly" | "rollback">()
    .notNull()
    .default("manual"),
});

export type UpdateRow = typeof updates.$inferSelect;
