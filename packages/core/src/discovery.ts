import "server-only";
import { models, providers, sources } from "@metobe/db/schema/models";
import type { Source } from "@metobe/db/schema/models";
import { eq, sql } from "drizzle-orm";

import { baseUrlOf } from "./ai-build";
import { getDb } from "./db";
import {
  fromAnthropic,
  fromCompatible,
  fromGateway,
  fromOpenAI,
  fromYandex,
} from "./discovery-map";
import type {
  AnthropicModel,
  DiscoveredModel,
  OllamaShow,
} from "./discovery-map";
import { PROVIDERS } from "./discovery-rules";
import { fetchFor } from "./net";
import { withSecret } from "./secrets";

// Discovery (ARCH §5.2): each source's own model list, enriched from the seed, written without touching what the
// admin decided — which models are on, who may use them, capabilities set by hand, providers renamed.

/** The Gateway's catalogue is public and lives outside its inference endpoint. */
const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

/** A failed list request, with the status the UI turns into a human message (401 → key, 403 → rights, …). */
export class DiscoveryError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "DiscoveryError";
    this.status = status;
  }
}

const getJson = async <T>(
  fetch: typeof globalThis.fetch,
  url: string,
  headers: Record<string, string>
): Promise<T> => {
  const res = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new DiscoveryError(
      `${new URL(url).host} answered ${res.status}`,
      res.status
    );
  }
  return (await res.json()) as T;
};

/**
 * When an OpenAI-compatible server is Ollama, its native `/api/show` states each model's capabilities and context.
 * Anything else answers 404 on the first try and is left as «unknown». Four requests at a time.
 */
const ollamaShows = async (
  fetch: typeof globalThis.fetch,
  base: string,
  ids: string[],
  headers: Record<string, string>
) => {
  const shows = new Map<string, OllamaShow>();
  const origin = base.replace(/\/v1$/u, "");
  const show = async (model: string) => {
    const res = await fetch(`${origin}/api/show`, {
      body: JSON.stringify({ model }),
      headers: { "content-type": "application/json", ...headers },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ((await res.json()) as OllamaShow) : null;
  };
  const [first, ...rest] = ids;
  if (!first) {
    return shows;
  }
  const probe = await show(first).catch(() => null);
  if (!probe?.capabilities) {
    return shows;
  }
  shows.set(first, probe);
  for (let i = 0; i < rest.length; i += 4) {
    const batch = rest.slice(i, i + 4);
    // oxlint-disable-next-line no-await-in-loop -- deliberate: four requests at a time, not all at once
    const answers = await Promise.all(
      batch.map((id) => show(id).catch(() => null))
    );
    for (const [k, id] of batch.entries()) {
      const answer = answers[k];
      if (answer) {
        shows.set(id, answer);
      }
    }
  }
  return shows;
};

/** The source's current model list, mapped to our shape. */
export const listSourceModels = async (
  source: Source
): Promise<DiscoveredModel[]> => {
  const base = baseUrlOf(source.kind, source.baseUrl).replace(/\/$/u, "");
  const listUrl =
    source.kind === "gateway" ? GATEWAY_MODELS_URL : `${base}/models`;
  const [apiKey, fetch] = await Promise.all([
    withSecret({ id: source.id, type: "source" }, "api_key", (v) => v),
    fetchFor({ mode: source.proxyMode, proxyId: source.proxyId }, listUrl),
  ]);
  const bearer: Record<string, string> = apiKey
    ? { authorization: `Bearer ${apiKey}` }
    : {};

  switch (source.kind) {
    case "gateway": {
      const { data } = await getJson<{
        data: Parameters<typeof fromGateway>[0];
      }>(fetch, listUrl, {});
      return fromGateway(data);
    }
    case "openai": {
      const { data } = await getJson<{
        data: { id: string; created?: number }[];
      }>(fetch, listUrl, bearer);
      return fromOpenAI(data);
    }
    case "anthropic": {
      // Paged: has_more / last_id.
      const all: AnthropicModel[] = [];
      let after: string | undefined;
      do {
        // oxlint-disable-next-line no-await-in-loop -- a cursor: the next page needs this page's last_id
        const page = await getJson<{
          data: typeof all;
          has_more: boolean;
          last_id?: string;
        }>(
          fetch,
          `${listUrl}?limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ""}`,
          { "anthropic-version": "2023-06-01", "x-api-key": apiKey ?? "" }
        );
        all.push(...page.data);
        after = page.has_more ? page.last_id : undefined;
      } while (after);
      return fromAnthropic(all);
    }
    case "yandex": {
      const { data } = await getJson<{ data: { id: string }[] }>(
        fetch,
        listUrl,
        bearer
      );
      return fromYandex(data);
    }
    case "openai-compatible": {
      const { data } = await getJson<{ data: { id: string }[] }>(
        fetch,
        listUrl,
        bearer
      );
      return fromCompatible(
        data,
        await ollamaShows(
          fetch,
          base,
          data.map((m) => m.id),
          bearer
        )
      );
    }
    default: {
      const unknown: never = source.kind;
      throw new Error(`unknown source kind ${String(unknown)}`);
    }
  }
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
