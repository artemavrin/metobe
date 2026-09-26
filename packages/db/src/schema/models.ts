import type {
  Capabilities,
  CapabilitySource,
  Currency,
  ProxyMode,
  RunStatus,
  SourceHealth,
  SourceKind,
  SourceOptions,
} from "@metobe/contracts/models";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { chats } from "./chat";
import { proxies } from "./proxies";

// ARCH §5.2, D29: a source gives access (key, route, health), a provider made the model (name and logo in chat).

export const sources = pgTable(
  "sources",
  {
    /** Base URL for openai-compatible; null — the kind's default endpoint. */
    baseUrl: text("base_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    enabled: boolean("enabled").notNull().default(true),
    /** Last real check; drives the status in the list and hides the source's models from chat on error. */
    health: jsonb("health").$type<SourceHealth>(),
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<SourceKind>().notNull(),
    /** Admin's logo; null — the kind's own (or guessed from the base URL for openai-compatible). */
    logo: text("logo"),
    options: jsonb("options").$type<SourceOptions>().notNull(),
    /** The proxy when proxy_mode is 'proxy'. Deleting the proxy clears it; core also switches the source to direct. */
    proxyId: uuid("proxy_id").references(() => proxies.id, {
      onDelete: "set null",
    }),
    proxyMode: text("proxy_mode").$type<ProxyMode>().notNull().default("auto"),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "sources_kind",
      sql`${table.kind} in ('openai', 'anthropic', 'openai-compatible', 'yandex', 'gateway')`
    ),
    check(
      "sources_proxy_mode",
      sql`${table.proxyMode} in ('auto', 'direct', 'proxy')`
    ),
  ]
);

export const providers = pgTable("providers", {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Set when the admin renamed it or changed the logo; the sync never overwrites an edited provider. */
  edited: boolean("edited").notNull().default(false),
  id: uuid("id").primaryKey().defaultRandom(),
  /** A built-in logo key or an uploaded image (S3 key). */
  logo: text("logo"),
  /** Stable key: openai, anthropic, google, alibaba, deepseek, xai, yandex, … and `other` for the unrecognised. */
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
});

export const models = pgTable(
  "models",
  {
    capabilities: jsonb("capabilities").$type<Capabilities>().notNull(),
    capabilitiesSource: text("capabilities_source")
      .$type<CapabilitySource>()
      .notNull()
      .default("discovered"),
    contextWindow: integer("context_window"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** D12: visible to everyone unless access rules say otherwise. */
    defaultAccess: boolean("default_access").notNull().default(true),
    /** Nothing is on until the admin turns it on (onboarding rule: no pre-selected models). */
    enabled: boolean("enabled").notNull().default(false),
    id: uuid("id").primaryKey().defaultRandom(),
    /** The source's own id: `gpt-5.2`, `anthropic/claude-sonnet-5`, `yandexgpt-5.1` (the URI is built from the folder). */
    modelId: text("model_id").notNull(),
    /**
     * Prices exactly as entered or reported, per `price_unit_tokens` tokens (1, 1000, 1M — any), in
     * `price_currency`. Unbounded numeric: nothing is normalised or rounded, so tiny per-token prices never turn
     * into zeros; costs are computed exactly (core/pricing). Currencies are never converted (D19).
     */
    priceCacheRead: numeric("price_cache_read"),
    priceCacheWrite: numeric("price_cache_write"),
    priceCurrency: text("price_currency").$type<Currency>(),
    priceInput: numeric("price_input"),
    priceOutput: numeric("price_output"),
    priceUnitTokens: integer("price_unit_tokens"),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    /** Release date when known: sorting and the «new» badge. */
    releasedAt: date("released_at"),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    usedForTitles: boolean("used_for_titles").notNull().default(false),
  },
  (table) => [
    unique("models_source_model").on(table.sourceId, table.modelId),
    index("models_provider").on(table.providerId),
    check(
      "models_price_unit",
      sql`${table.priceUnitTokens} is null or ${table.priceUnitTokens} > 0`
    ),
    check(
      "models_capabilities_source",
      sql`${table.capabilitiesSource} in ('discovered', 'seed', 'manual')`
    ),
  ]
);

export const modelRuns = pgTable(
  "model_runs",
  {
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** SET NULL keeps usage history when a chat is deleted. */
    chatId: uuid("chat_id").references(() => chats.id, {
      onDelete: "set null",
    }),
    /** Exact: the source's reported cost (AI Gateway) or tokens × the model's prices at the time of the run. */
    cost: numeric("cost"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currency: text("currency").$type<Currency>(),
    id: uuid("id").primaryKey().defaultRandom(),
    inputTokens: integer("input_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    modelId: uuid("model_id").references(() => models.id, {
      onDelete: "set null",
    }),
    outputTokens: integer("output_tokens").notNull().default(0),
    status: text("status").$type<RunStatus>().notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("model_runs_user_time").on(table.userId, table.createdAt),
    index("model_runs_model_time").on(table.modelId, table.createdAt),
    check(
      "model_runs_status",
      sql`${table.status} in ('ok', 'error', 'aborted')`
    ),
  ]
);

/** A user's favorite models in their order: the picker's list and ⌘1–9. */
export const favoriteModels = pgTable(
  "favorite_models",
  {
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.modelId] })]
);

export type Source = typeof sources.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type Model = typeof models.$inferSelect;
export type ModelRun = typeof modelRuns.$inferSelect;
