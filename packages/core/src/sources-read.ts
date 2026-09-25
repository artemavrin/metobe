import "server-only";
import { models, providers, sources } from "@metobe/db/schema/models";
import { proxies } from "@metobe/db/schema/proxies";
import { asc, count, desc, eq, sql } from "drizzle-orm";

import { baseUrlOf } from "./ai-build";
import { getDb } from "./db";
import { GATEWAY_MODELS_URL } from "./discovery-fetch";
import { routeFor } from "./net";
import { listSecretHints } from "./secrets";

// What the Sources screen shows (ARCH §5.2, §18.3): the list with each source's state and model counts, and one
// source in full — key mask, where its traffic goes and why, and its models grouped by maker.

/** Every source with how many of its models there are and how many are in chat. */
export const listSources = () => {
  const { db } = getDb();
  return db
    .select({
      baseUrl: sources.baseUrl,
      enabled: sources.enabled,
      health: sources.health,
      id: sources.id,
      kind: sources.kind,
      logo: sources.logo,
      modelsEnabled:
        sql<number>`count(${models.id}) filter (where ${models.enabled})`.mapWith(
          Number
        ),
      modelsTotal: count(models.id),
      title: sources.title,
    })
    .from(sources)
    .leftJoin(models, eq(models.sourceId, sources.id))
    .groupBy(sources.id)
    .orderBy(asc(sources.createdAt));
};
export type SourceSummary = Awaited<ReturnType<typeof listSources>>[number];

/** Proxies a source can be routed through, for the route picker. */
const proxyOptions = () => {
  const { db } = getDb();
  return db
    .select({
      enabled: proxies.enabled,
      health: proxies.health,
      id: proxies.id,
      title: proxies.title,
    })
    .from(proxies)
    .orderBy(asc(proxies.createdAt));
};

/** One source for its screen, or null when it is gone. */
export const getSource = async (id: string) => {
  const { db } = getDb();
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, id))
    .limit(1);
  if (!source) {
    return null;
  }
  const url =
    source.kind === "gateway"
      ? GATEWAY_MODELS_URL
      : baseUrlOf(source.kind, source.baseUrl);
  const [hints, route, proxyList, modelRows] = await Promise.all([
    listSecretHints({ id, type: "source" }),
    routeFor({ mode: source.proxyMode, proxyId: source.proxyId }, url),
    proxyOptions(),
    db
      .select({
        capabilities: models.capabilities,
        capabilitiesSource: models.capabilitiesSource,
        contextWindow: models.contextWindow,
        enabled: models.enabled,
        id: models.id,
        modelId: models.modelId,
        priceCacheRead: models.priceCacheRead,
        priceCacheWrite: models.priceCacheWrite,
        priceCurrency: models.priceCurrency,
        priceInput: models.priceInput,
        priceOutput: models.priceOutput,
        priceUnitTokens: models.priceUnitTokens,
        provider: {
          id: providers.id,
          logo: providers.logo,
          slug: providers.slug,
          title: providers.title,
        },
        releasedAt: models.releasedAt,
        title: models.title,
      })
      .from(models)
      .innerJoin(providers, eq(providers.id, models.providerId))
      .where(eq(models.sourceId, id))
      .orderBy(
        sql`${models.releasedAt} desc nulls last`,
        desc(models.createdAt),
        asc(models.title)
      ),
  ]);
  return {
    host: new URL(url).host,
    keyHint: hints.find((h) => h.purpose === "api_key")?.hint ?? null,
    models: modelRows,
    proxies: proxyList,
    route,
    source,
  };
};
export type SourceDetail = NonNullable<Awaited<ReturnType<typeof getSource>>>;
