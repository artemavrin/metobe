import { sql } from "drizzle-orm";
import {
  check,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Singleton row (id = 1): install-level state and admin policies.
export const systemSettings = pgTable(
  "system_settings",
  {
    id: smallint("id").primaryKey().default(1),
    policies: jsonb("policies")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    secretsCanary: text("secrets_canary"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("system_settings_singleton", sql`${table.id} = 1`)]
);

export type SystemSettings = typeof systemSettings.$inferSelect;
