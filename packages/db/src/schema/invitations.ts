import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// Invitations (D17, ARCH §5.1): an admin makes a link, copies it and hands it over; whoever opens it names themselves and
// is signed in at once — no mail needed (D15). Only a hash of the token is kept. `email`, when given, is the one address
// the link accepts; `role` is what the new user becomes.
export const invitations = pgTable(
  "invitations",
  {
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** Who the link made, once someone has used it; the invitation stays as the record of it. */
    acceptedBy: text("accepted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    email: text("email"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
  },
  (table) => [
    index("invitations_open").on(table.expiresAt),
    check("invitations_role", sql`${table.role} in ('admin', 'user')`),
  ]
);

export type Invitation = typeof invitations.$inferSelect;
