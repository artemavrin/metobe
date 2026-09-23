import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// One-time links printed to the container log that let the first superuser create an account.
export const claimTokens = pgTable("claim_tokens", {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export type ClaimToken = typeof claimTokens.$inferSelect;
