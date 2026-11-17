import "server-only";
import { sources } from "@metobe/db/schema/models";
import type { Source } from "@metobe/db/schema/models";
import { wrapLanguageModel } from "ai";
import type { Experimental_EvaluationModel, LanguageModel } from "ai";
import { eq } from "drizzle-orm";

import { baseUrlOf, buildProvider } from "./ai-build";
import { onConfigChange } from "./config-bus";
import { getDb } from "./db";
import { getEnv } from "./env";
import { fetchFor, onNetChange } from "./net";
import { maskingMiddleware } from "./pii-guard";
import type { MaskedCall } from "./pii-guard";
import { withSecret } from "./secrets";

// Providers built from sources (ARCH §7): the key from secrets, fetch routed by core/net, Yandex normalised.
// The key lives in memory only inside a built provider; any source or proxy change drops the cache.

type Built = ReturnType<typeof buildProvider> & {
  /** Localhost or a private network (`sources.local`): data does not leave the server. */
  local: boolean;
};
const cache = new Map<string, Promise<Built>>();

const build = async (source: Source): Promise<Built> => {
  const baseUrl = baseUrlOf(source.kind, source.baseUrl);
  const [apiKey, fetch] = await Promise.all([
    withSecret({ id: source.id, type: "source" }, "api_key", (v) => v),
    fetchFor({ mode: source.proxyMode, proxyId: source.proxyId }, baseUrl),
  ]);
  const provider = buildProvider({
    apiKey,
    baseUrl: source.baseUrl,
    fetch,
    kind: source.kind,
    options: source.options,
  });
  return Object.assign(provider, { local: source.local });
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

/** How a model is used: the guard session and where "what the model saw" goes (PII-GUARD-PLAN З2). */
export interface ModelUse {
  /** One per conversation (a chat, a task), so a person keeps one label; a fresh one by default. */
  session?: string;
  onMasked?: (call: MaskedCall) => void;
}

export const getLanguageModel = async (
  sourceId: string,
  modelId: string,
  use: ModelUse = {}
): Promise<LanguageModel> => {
  const provider = await providerFor(sourceId);
  const model = provider.languageModel(modelId);
  // Data protection: an external source sees the prompt only through the guard; a local one is
  // left alone (its data does not leave the server). Without PII_GUARD_URL it is off.
  const { PII_GUARD_TOKEN, PII_GUARD_URL } = getEnv();
  if (!PII_GUARD_URL || provider.local) {
    return model;
  }
  return wrapLanguageModel({
    middleware: maskingMiddleware({
      onMasked: use.onMasked,
      session: use.session ?? `call-${crypto.randomUUID()}`,
      token: PII_GUARD_TOKEN,
      url: PII_GUARD_URL,
    }),
    model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
  });
};

/** A decision model of a source (ARCH §19.4); a source whose kind serves none is an error. */
export const getEvaluationModel = async (
  sourceId: string,
  modelId: string
): Promise<Experimental_EvaluationModel> => {
  const provider = await providerFor(sourceId);
  if (!provider.evaluationModel) {
    throw new Error("this source serves no decision models");
  }
  return provider.evaluationModel(modelId);
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

// A source, key or proxy changed here or in another process (config-bus): its provider is built anew.
onConfigChange((change) => {
  if (!change.catalogId) {
    invalidateAi(change.sourceId);
  }
});
