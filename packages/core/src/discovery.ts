import "server-only";
import { models, providers, sources } from "@metobe/db/schema/models";
import type { Source } from "@metobe/db/schema/models";
import { eq, sql } from "drizzle-orm";

import { baseUrlOf } from "./ai-build";
import { getDb } from "./db";
import { fetchModelList, GATEWAY_MODELS_URL } from "./discovery-fetch";
import type { DiscoveredModel } from "./discovery-map";
import { PROVIDERS } from "./discovery-rules";
import { fetchFor } from "./net";
import { withSecret } from "./secrets";

// Discovery (ARCH §5.2): each source's own model list, enriched from the seed, written without touching what the
// admin decided — which models are on, who may use them, capabilities set by hand, providers renamed.

export { DiscoveryError } from "./discovery-fetch";

/** The saved source's current model list: its key from secrets, its route from core/net. */
export const listSourceModels = async (
  source: Source
): Promise<DiscoveredModel[]> => {
  const listUrl =
    source.kind === "gateway"
      ? GATEWAY_MODELS_URL
      : `${baseUrlOf(source.kind, source.baseUrl)}/models`;
  const [apiKey, fetch] = await Promise.all([
    withSecret({ id: source.id, type: "source" }, "api_key", (v) => v),
    fetchFor({ mode: source.proxyMode, proxyId: source.proxyId }, listUrl),
  ]);
  return fetchModelList(source, apiKey, fetch);
};

/** Creates missing providers from the seed; existing ones — renamed or re-logoed by the admin — stay as they are. */
const ensureProviders = async (slugs: Set<string>) => {
  const { db } = getDb();
  const seed = PROVIDERS.filter((p) => slugs.has(p.slug));
  if (seed.length) {
    await db
      .insert(providers)
      .values(seed.map((p) => ({ logo: p.logo, slug: p.slug, title: p.title })))
      .onConflictDoNothing({ target: providers.slug });
  }
  const rows = await db
    .select({ id: providers.id, slug: providers.slug })
    .from(providers);
  return new Map(rows.map((r) => [r.slug, r.id]));
};

/**
 * Pulls a source's models into the table. New models arrive off; existing ones get fresh data, but `enabled`,
 * `default_access`, `used_for_titles` and hand-set capabilities are never touched. Models the source stopped
 * listing are kept (a model in use must not vanish silently); `missing` tells the UI which ones.
 */
export const syncModels = async (sourceId: string) => {
  const { db } = getDb();
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  if (!source) {
    throw new Error(`source ${sourceId} not found`);
  }
  const found = await listSourceModels(source);
  const providerIds = await ensureProviders(
    new Set(found.map((m) => m.provider))
  );
  const current = await db
    .select({ modelId: models.modelId })
    .from(models)
    .where(eq(models.sourceId, sourceId));
  const existing = new Set(current.map((m) => m.modelId));

  if (found.length) {
    await db
      .insert(models)
      .values(
        found.map((m) => ({
          capabilities: m.capabilities,
          capabilitiesSource: m.capabilitiesSource,
          contextWindow: m.contextWindow,
          modelId: m.modelId,
          priceCacheRead: m.price?.cacheRead ?? null,
          priceCacheWrite: m.price?.cacheWrite ?? null,
          priceCurrency: m.price?.currency ?? null,
          priceInput: m.price?.input ?? null,
          priceOutput: m.price?.output ?? null,
          priceUnitTokens: m.price?.unitTokens ?? null,
          providerId:
            providerIds.get(m.provider) ?? (providerIds.get("other") as string),
          releasedAt: m.releasedAt,
          sourceId,
          title: m.title,
        }))
      )
      .onConflictDoUpdate({
        set: {
          // Hand-set capabilities win over whatever the source or the seed says.
          capabilities: sql`case when ${models.capabilitiesSource} = 'manual' then ${models.capabilities} else excluded.capabilities end`,
          capabilitiesSource: sql`case when ${models.capabilitiesSource} = 'manual' then ${models.capabilitiesSource} else excluded.capabilities_source end`,
          contextWindow: sql`excluded.context_window`,
          // Prices change only when the source reports them (Gateway); prices the admin typed are kept.
          priceCacheRead: sql`case when excluded.price_unit_tokens is null then ${models.priceCacheRead} else excluded.price_cache_read end`,
          priceCacheWrite: sql`case when excluded.price_unit_tokens is null then ${models.priceCacheWrite} else excluded.price_cache_write end`,
          priceCurrency: sql`case when excluded.price_unit_tokens is null then ${models.priceCurrency} else excluded.price_currency end`,
          priceInput: sql`case when excluded.price_unit_tokens is null then ${models.priceInput} else excluded.price_input end`,
          priceOutput: sql`case when excluded.price_unit_tokens is null then ${models.priceOutput} else excluded.price_output end`,
          priceUnitTokens: sql`coalesce(excluded.price_unit_tokens, ${models.priceUnitTokens})`,
          providerId: sql`excluded.provider_id`,
          releasedAt: sql`excluded.released_at`,
          title: sql`excluded.title`,
        },
        target: [models.sourceId, models.modelId],
      });
  }
  const listed = new Set(found.map((m) => m.modelId));
  return {
    added: found.filter((m) => !existing.has(m.modelId)).length,
    missing: [...existing].filter((id) => !listed.has(id)),
    total: found.length,
  };
};
