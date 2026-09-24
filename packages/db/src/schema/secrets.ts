import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Every secret of the install — source keys, SMTP, MCP and OAuth tokens (ARCH §17.2). The owner is referenced by
 * (owner_type, owner_id); the ciphertext is bound to that pair and the purpose through AES-GCM additional data,
 * so a value copied into another row fails to decrypt.
 */
export const secrets = pgTable(
  "secrets",
  {
    authTag: text("auth_tag").notNull(),
    ciphertext: text("ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Safe to show: «sk-…a1B2». The value itself is write-only. */
    hint: text("hint").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    iv: text("iv").notNull(),
    /** Fingerprint of the key that encrypted the row; rotation re-encrypts rows whose key_id is not current. */
    keyId: text("key_id").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ownerId: text("owner_id").notNull(),
    ownerType: text("owner_type").notNull(),
    purpose: text("purpose").notNull(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (table) => [
    unique("secrets_owner_purpose").on(
      table.ownerType,
      table.ownerId,
      table.purpose
    ),
    index("secrets_key_id").on(table.keyId),
  ]
);

export type Secret = typeof secrets.$inferSelect;
