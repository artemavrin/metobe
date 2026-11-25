import { sql } from "drizzle-orm";
import {
  check,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Organizations (D48, ARCH §20.4): a company inside the install. There is always one — the claim makes it, and an
// install that predates them gets it from the migration; self-hosted is an install with one. Its owner is the user with
// `org_role = 'owner'`. Status, trial and billing are read by later steps (ORGS-PLAN §12); `settings` takes the
// organization's parts of `system_settings.policies` (O3 moves them here — till then they are a copy).
export const organizations = pgTable(
  "organizations",
  {
    billing: jsonb("billing").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    disabledReason: text("disabled_reason").$type<"unpaid" | "manual">(),
    id: uuid("id").primaryKey().defaultRandom(),
    /** The superuser's mail domain at first; the owner renames it. */
    name: text("name").notNull(),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text("status")
      .$type<"trial" | "active" | "disabled">()
      .notNull()
      .default("active"),
    /** The organization's week of limits and month of invoices; Moscow unless the owner says otherwise. */
    timeZone: text("time_zone").notNull().default("Europe/Moscow"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "organizations_status",
      sql`${table.status} in ('trial', 'active', 'disabled')`
    ),
    check(
      "organizations_disabled_reason",
      sql`${table.disabledReason} in ('unpaid', 'manual')`
    ),
  ]
);

export type Organization = typeof organizations.$inferSelect;
