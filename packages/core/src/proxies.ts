import "server-only";
import type { ProxyType } from "@metobe/contracts/proxies";
import { sources } from "@metobe/db/schema/models";
import { proxies, proxyDomains } from "@metobe/db/schema/proxies";
import { asc, eq } from "drizzle-orm";

import { invalidateAi } from "./ai";
import { baseUrlOf } from "./ai-build";
import { getDb } from "./db";
import { GATEWAY_MODELS_URL } from "./discovery-fetch";
import { addProxy, checkProxy, invalidateNet, routeFor } from "./net";
import type { ProxyConfig } from "./net-transport";
import { listSecretHints, removeSecrets, setSecret } from "./secrets";

// Proxies (ARCH §18): set up once, used where needed. Everything goes direct unless a source picks a proxy or
// the proxy claims its domain. Every change rebuilds the routes (invalidateNet) and is checked for real.

export const listProxies = () => {
  const { db } = getDb();
  return db
    .select({
      enabled: proxies.enabled,
      health: proxies.health,
      host: proxies.host,
      id: proxies.id,
      port: proxies.port,
      title: proxies.title,
      type: proxies.type,
    })
    .from(proxies)
    .orderBy(asc(proxies.createdAt));
};
export type ProxySummary = Awaited<ReturnType<typeof listProxies>>[number];

const hostOfSource = (s: {
  kind: Parameters<typeof baseUrlOf>[0];
  baseUrl: string | null;
}) =>
  new URL(
    s.kind === "gateway" ? GATEWAY_MODELS_URL : baseUrlOf(s.kind, s.baseUrl)
  ).host;

/** One proxy with its domains, whether a password is set, and every source with where its traffic goes now. */
export const getProxy = async (id: string) => {
  const { db } = getDb();
  const [proxy] = await db
    .select()
    .from(proxies)
    .where(eq(proxies.id, id))
    .limit(1);
  if (!proxy) {
    return null;
  }
  const [domains, hints, rows, others] = await Promise.all([
    db
      .select({ domain: proxyDomains.domain })
      .from(proxyDomains)
      .where(eq(proxyDomains.proxyId, id))
      .orderBy(asc(proxyDomains.domain)),
    listSecretHints({ id, type: "proxy" }),
    db
      .select({
        baseUrl: sources.baseUrl,
        id: sources.id,
        kind: sources.kind,
        logo: sources.logo,
        proxyId: sources.proxyId,
        proxyMode: sources.proxyMode,
        title: sources.title,
      })
      .from(sources)
      .orderBy(asc(sources.createdAt)),
    db.select({ id: proxies.id, title: proxies.title }).from(proxies),
  ]);
  const routed = await Promise.all(
    rows.map(async (s) => {
      const host = hostOfSource(s);
      const route = await routeFor(
        { mode: s.proxyMode, proxyId: s.proxyId },
        `https://${host}`
      );
      return { ...s, host, route };
    })
  );
  return {
    domains: domains.map((d) => d.domain),
    hasPassword: hints.some((h) => h.purpose === "password"),
    /** Names of all proxies, for «сейчас через «X»». */
    others,
    proxy,
    sources: routed,
  };
};
export type ProxyDetail = NonNullable<Awaited<ReturnType<typeof getProxy>>>;

/** A new proxy from its address; checked right away, the result kept on it. */
export const createProxy = async (config: ProxyConfig) => {
  const id = await addProxy(config);
  await checkProxy(id);
  return id;
};

/** Name, type, address, on/off. A new address or type is checked right away. */
export const updateProxy = async (
  id: string,
  patch: {
    title?: string;
    type?: ProxyType;
    host?: string;
    port?: number;
    enabled?: boolean;
  }
) => {
  const { db } = getDb();
  await db.update(proxies).set(patch).where(eq(proxies.id, id));
  invalidateNet();
  invalidateAi();
  if (patch.host || patch.port || patch.type) {
    await checkProxy(id);
  }
};

/** Login and password: `password: undefined` keeps the stored one, `null` removes it. Checked right away. */
export const setProxyCredentials = async (
  id: string,
  username: string | null,
  password: string | null | undefined
) => {
  const { db } = getDb();
  await db.update(proxies).set({ username }).where(eq(proxies.id, id));
  if (password === null) {
    await removeSecrets({ id, type: "proxy" });
  } else if (password !== undefined) {
    await setSecret({ id, type: "proxy" }, "password", password);
  }
  invalidateNet();
  invalidateAi();
  await checkProxy(id);
};

export type DomainResult = { ok: true } | { ok: false; takenBy: string };

/** A domain for «Авто» traffic; one domain belongs to one proxy. */
export const addProxyDomain = async (
  id: string,
  domain: string
): Promise<DomainResult> => {
  const { db } = getDb();
  const [taken] = await db
    .select({ proxyId: proxyDomains.proxyId, title: proxies.title })
    .from(proxyDomains)
    .innerJoin(proxies, eq(proxies.id, proxyDomains.proxyId))
    .where(eq(proxyDomains.domain, domain))
    .limit(1);
  if (taken) {
    return taken.proxyId === id
      ? { ok: true }
      : { ok: false, takenBy: taken.title };
  }
  await db.insert(proxyDomains).values({ domain, proxyId: id });
  invalidateNet();
  invalidateAi();
  return { ok: true };
};

export const removeProxyDomain = async (id: string, domain: string) => {
  const { db } = getDb();
  await db.delete(proxyDomains).where(eq(proxyDomains.domain, domain));
  invalidateNet();
  invalidateAi();
  return id;
};

/** Re-run the check through the proxy. */
export const recheckProxy = (id: string) => checkProxy(id);

/**
 * Removes the proxy, its domains (cascade) and its password. Sources that picked it go direct — said before the
 * admin confirms; sources on «Авто» just lose the domain match.
 */
export const deleteProxy = async (id: string) => {
  const { db } = getDb();
  await db
    .update(sources)
    .set({ proxyId: null, proxyMode: "direct" })
    .where(eq(sources.proxyId, id));
  await db.delete(proxies).where(eq(proxies.id, id));
  await removeSecrets({ id, type: "proxy" });
  invalidateNet();
  invalidateAi();
};
