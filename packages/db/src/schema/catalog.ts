import type {
  CatalogAccessMode,
  ApprovalPolicy,
  CatalogHealth,
  CatalogTool,
  CatalogType,
  ConnectionStatus,
  CredentialMode,
  CredentialOwnerType,
  McpConfig,
} from "@metobe/contracts/catalog";
import type { ProxyMode } from "@metobe/contracts/models";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { proxies } from "./proxies";

// The admin's catalog and users' connections (ARCH §5.4, §17). Secrets — a token, a header's value, OAuth tokens
// and the registered OAuth client — live in `secrets` under owner_type 'catalog_item' (shared) or 'connection'
// (one user's), never in these rows.

export const catalogItems = pgTable(
  "catalog_items",
  {
    access: text("access").$type<CatalogAccessMode>().notNull().default("all"),
    /** null — every tool the server has (minus `deny`); otherwise only these. */
    allowedTools: text("allowed_tools").array(),
    approvalPolicy: jsonb("approval_policy")
      .$type<ApprovalPolicy>()
      .notNull()
      .default({}),
    config: jsonb("config").$type<McpConfig>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    credentialMode: text("credential_mode")
      .$type<CredentialMode>()
      .notNull()
      .default("shared"),
    /** What the service is and when to turn to it, in a line or two: the model reads it. Optional. */
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    health: jsonb("health").$type<CatalogHealth>(),
    id: uuid("id").primaryKey().defaultRandom(),
    /** The prefix of its tools in a chat. */
    key: text("key").notNull().unique(),
    /** An optional picture (a small data URL). */
    logo: text("logo"),
    proxyId: uuid("proxy_id").references(() => proxies.id, {
      onDelete: "set null",
    }),
    proxyMode: text("proxy_mode").$type<ProxyMode>().notNull().default("auto"),
    title: text("title").notNull(),
    /** Tools as the server listed them at the last check, for the admin's allowlist. */
    tools: jsonb("tools").$type<CatalogTool[]>().notNull().default([]),
    type: text("type").$type<CatalogType>().notNull().default("mcp"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("catalog_items_type", sql`${table.type} in ('mcp')`),
    check("catalog_items_access", sql`${table.access} in ('all', 'selected')`),
    check(
      "catalog_items_credential_mode",
      sql`${table.credentialMode} in ('shared', 'per_user')`
    ),
    check(
      "catalog_items_proxy_mode",
      sql`${table.proxyMode} in ('auto', 'direct', 'proxy')`
    ),
  ]
);

/** Who may use a catalog item when its access is `selected`. */
export const catalogAccess = pgTable(
  "catalog_access",
  {
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.catalogId, table.userId] })]
);

/** A user's own credentials for a per-user catalog item. */
export const connections = pgTable(
  "connections",
  {
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    lastError: text("last_error"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    status: text("status")
      .$type<ConnectionStatus>()
      .notNull()
      .default("active"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("connections_user_catalog").on(table.userId, table.catalogId),
    check(
      "connections_status",
      sql`${table.status} in ('active', 'needs_reauth', 'error')`
    ),
  ]
);

/**
 * An OAuth sign-in on its way (PKCE): from the redirect to the provider until its callback. `state` is the key the
 * callback brings back; the code verifier waits in `secrets` under the same owner. Short-lived.
 */
export const oauthFlows = pgTable(
  "oauth_flows",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ownerId: text("owner_id").notNull(),
    ownerType: text("owner_type").$type<CredentialOwnerType>().notNull(),
    /** Where to send the user after the callback (a settings page or the chat). */
    returnTo: text("return_to").notNull(),
    state: text("state").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("oauth_flows_created_at").on(table.createdAt),
    check(
      "oauth_flows_owner_type",
      sql`${table.ownerType} in ('catalog_item', 'connection')`
    ),
  ]
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type Connection = typeof connections.$inferSelect;
