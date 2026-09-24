import "server-only";
import { sources } from "@metobe/db/schema/models";
import type { Source } from "@metobe/db/schema/models";
import type { LanguageModel } from "ai";
import { eq } from "drizzle-orm";

import { baseUrlOf, buildProvider } from "./ai-build";
import { getDb } from "./db";
import { fetchFor, onNetChange } from "./net";
import { withSecret } from "./secrets";

// Providers built from sources (ARCH §7): the key from secrets, fetch routed by core/net, Yandex normalised.
// The key lives in memory only inside a built provider; any source or proxy change drops the cache.

type Built = ReturnType<typeof buildProvider>;
const cache = new Map<string, Promise<Built>>();

const build = async (source: Source): Promise<Built> => {
  const baseUrl = baseUrlOf(source.kind, source.baseUrl);
  const [apiKey, fetch] = await Promise.all([
    withSecret({ id: source.id, type: "source" }, "api_key", (v) => v),
    fetchFor({ mode: source.proxyMode, proxyId: source.proxyId }, baseUrl),
  ]);
  return buildProvider({
    apiKey,
    baseUrl: source.baseUrl,
    fetch,
    kind: source.kind,
    options: source.options,
  });
};

/** The provider for a source, built once; a source that is off or missing is an error, not a silent fallback. */
export const providerFor = (sourceId: string): Promise<Built> => {
  let built = cache.get(sourceId);
  if (!built) {
    built = (async () => {
      try {
        const [source] = await getDb()
          .db.select()
          .from(sources)
          .where(eq(sources.id, sourceId))
          .limit(1);
        if (!source) {
          throw new Error(`source ${sourceId} not found`);
        }
        if (!source.enabled) {
          throw new Error(`source ${source.title} is turned off`);
        }
        return await build(source);
      } catch (error) {
        // A failed build must not stick: the next call retries.
        cache.delete(sourceId);
        throw error;
      }
    })();
    cache.set(sourceId, built);
  }
  return built;
};

export const getLanguageModel = async (
  sourceId: string,
  modelId: string
): Promise<LanguageModel> => {
  const provider = await providerFor(sourceId);
  return provider.languageModel(modelId);
};

// A provider holds a routed fetch, so a proxy change must rebuild it.
onNetChange(() => cache.clear());

/** Drops built providers — after a source, key or proxy change (and on Redis `config:changed`). */
export const invalidateAi = (sourceId?: string) => {
  if (sourceId) {
    cache.delete(sourceId);
  } else {
    cache.clear();
  }
};
