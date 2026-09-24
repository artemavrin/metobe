import "server-only";
import type { ProxyHealth } from "@metobe/contracts/proxies";
import { proxies, proxyDomains } from "@metobe/db/schema/proxies";
import { count, eq } from "drizzle-orm";
import type { Dispatcher } from "undici";

import { getDb } from "./db";
import { resolveRoute } from "./net-route";
import type { Route, Target } from "./net-route";
import {
  directAgent,
  fetchWith,
  parseProxyUrl,
  pinnedDirectAgent,
  proxyDispatcher,
} from "./net-transport";
import type { ProxyConfig } from "./net-transport";
import { setSecret, withSecret } from "./secrets";

// Outgoing traffic (ARCH §18): everything direct by default; a proxy only for what is ticked or matches its domains.
// Compose-internal services (Postgres, Redis, S3, SearXNG) never go through here.

interface Snapshot {
  configs: Map<string, ProxyConfig>;
  domains: { domain: string; proxyId: string }[];
  enabled: Set<string>;
}

let snapshot: Promise<Snapshot> | undefined;
const dispatchers = new Map<string, Dispatcher>();

const load = async (): Promise<Snapshot> => {
  const { db } = getDb();
  const [rows, domains] = await Promise.all([
    db.select().from(proxies),
    db.select().from(proxyDomains),
  ]);
  const configs = new Map<string, ProxyConfig>();
  await Promise.all(
    rows.map(async (p) => {
      const password = await withSecret(
        { id: p.id, type: "proxy" },
        "password",
        (v) => v
      );
      configs.set(p.id, {
        host: p.host,
        password,
        port: p.port,
        type: p.type,
        username: p.username,
      });
    })
  );
  return {
    configs,
    domains,
    enabled: new Set(rows.filter((p) => p.enabled).map((p) => p.id)),
  };
};

const getSnapshot = () => {
  snapshot ??= load();
  return snapshot;
};

/** Drops cached proxies and dispatchers; called after any proxy change (and on Redis `config:changed`). */
export const invalidateNet = () => {
  snapshot = undefined;
  for (const d of dispatchers.values()) {
    void d.close();
  }
  dispatchers.clear();
};

const dispatcherFor = (key: string, make: () => Dispatcher) => {
  let d = dispatchers.get(key);
  if (!d) {
    d = make();
    dispatchers.set(key, d);
  }
  return d;
};

/** Where a request to `url` for `target` goes — also what the source form and the proxy page explain. */
export const routeFor = async (
  target: Target | null,
  url: string | URL
): Promise<Route> => {
  const { domains, enabled } = await getSnapshot();
  return resolveRoute(target, new URL(url).hostname, domains, enabled);
};

/**
 * A fetch for one destination. `pinned` is for SSRF-guarded traffic (web_fetch, users' own connections): the
 * address is resolved and checked, and a proxy gets the checked IP rather than the name.
 */
export const fetchFor = async (
  target: Target | null,
  url: string | URL,
  { pinned = false } = {}
): Promise<typeof fetch> => {
  const route = await routeFor(target, url);
  if (route.kind === "direct") {
    return fetchWith(
      dispatcherFor(
        pinned ? "direct:pinned" : "direct",
        pinned ? pinnedDirectAgent : directAgent
      )
    );
  }
  const { configs } = await getSnapshot();
  const config = configs.get(route.proxyId);
  if (!config) {
    throw new Error(`proxy ${route.proxyId} is not configured`);
  }
  return fetchWith(
    dispatcherFor(`${route.proxyId}:${pinned ? "pinned" : "plain"}`, () =>
      proxyDispatcher(config, { pinned })
    )
  );
};

/** Where the check goes through the proxy: it answers with the exit IP and its country. */
export const IP_ECHO_URL = "https://ipinfo.io/json";

/** A real request through the proxy; the result is stored on the proxy and shown in the list. */
export const checkProxy = async (proxyId: string): Promise<ProxyHealth> => {
  const { db } = getDb();
  const { configs } = await getSnapshot();
  const config = configs.get(proxyId);
  if (!config) {
    throw new Error(`proxy ${proxyId} not found`);
  }
  const started = Date.now();
  let health: ProxyHealth;
  try {
    const res = await fetchWith(
      dispatcherFor(`${proxyId}:plain`, () => proxyDispatcher(config))
    )(IP_ECHO_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`${IP_ECHO_URL} answered ${res.status}`);
    }
    const body = (await res.json()) as { ip?: string; country?: string };
    health = {
      checkedAt: new Date().toISOString(),
      country: body.country,
      ip: body.ip,
      latencyMs: Date.now() - started,
      state: "ok",
    };
  } catch (error) {
    const { cause } = error as { cause?: unknown };
    health = {
      checkedAt: new Date().toISOString(),
      error: String(cause ?? (error as Error).message),
      state: "error",
    };
  }
  await db.update(proxies).set({ health }).where(eq(proxies.id, proxyId));
  return health;
};

/**
 * First start: an install-time HTTPS_PROXY / ALL_PROXY becomes a proxy record, bound to nothing — what goes
 * through it is still the admin's choice (ARCH §18.1). Does nothing once any proxy exists.
 */
export const importEnvProxy = async (env: NodeJS.ProcessEnv = process.env) => {
  const value =
    env.HTTPS_PROXY ?? env.https_proxy ?? env.ALL_PROXY ?? env.all_proxy;
  if (!value) {
    return null;
  }
  const { db } = getDb();
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(proxies);
  if (total > 0) {
    return null;
  }
  const config = parseProxyUrl(value);
  const [row] = await db
    .insert(proxies)
    .values({
      host: config.host,
      port: config.port,
      title: config.host,
      type: config.type,
      username: config.username,
    })
    .returning({ id: proxies.id });
  if (!row) {
    return null;
  }
  if (config.password) {
    await setSecret({ id: row.id, type: "proxy" }, "password", config.password);
  }
  invalidateNet();
  return { host: config.host, id: row.id, type: config.type };
};
