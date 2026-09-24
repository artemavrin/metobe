import type { ProxyHealth, ProxyType } from "@metobe/contracts/proxies";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ARCH §18: proxies are an admin resource set up once and used where needed. Everything goes direct by default;
// through a proxy goes only what is ticked (objects) or matches its domains. The password lives in `secrets`
// (owner_type = 'proxy', purpose = 'password').

export const proxies = pgTable(
  "proxies",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    enabled: boolean("enabled").notNull().default(true),
    /** Last check through the proxy: external IP, country, latency — or why it failed. */
    health: jsonb("health").$type<ProxyHealth>(),
    host: text("host").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    port: integer("port").notNull(),
    title: text("title").notNull(),
    type: text("type").$type<ProxyType>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    username: text("username"),
  },
  (table) => [
    check(
      "proxies_type",
      sql`${table.type} in ('http', 'https', 'socks5', 'socks5h')`
    ),
    check("proxies_port", sql`${table.port} between 1 and 65535`),
  ]
);

/** «These addresses go through me». A domain covers its subdomains; one domain belongs to one proxy. */
export const proxyDomains = pgTable("proxy_domains", {
  domain: text("domain").primaryKey(),
  proxyId: uuid("proxy_id")
    .notNull()
    .references(() => proxies.id, { onDelete: "cascade" }),
});

export type Proxy = typeof proxies.$inferSelect;
