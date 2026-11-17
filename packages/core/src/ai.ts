import "server-only";
import type { ModelLabel } from "@metobe/contracts/chat";
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
import {
  isGuardBlocked,
  isGuardUnavailable,
  maskingMiddleware,
  previewMask,
} from "./pii-guard";
import type { GuardOptions, MaskedCall, ModelAnswer } from "./pii-guard";
import { getPrivacySettings, guardUrl, policyFor } from "./privacy-settings";
import type { PrivacyPlace } from "./privacy-settings";
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
  /** Where the call comes from: the admin turns protection on or off per place (З6); a service call by default. */
  place?: PrivacyPlace;
  onMasked?: (call: MaskedCall) => void;
  onAnswer?: (answer: ModelAnswer) => void;
}

/** Why a call goes as it is, or the guard it goes through. */
type GuardDecision =
  | { state: "off" }
  | { state: "local" }
  | { state: "on"; guard: GuardOptions };

const decideGuard = async (
  sourceId: string,
  use: ModelUse
): Promise<GuardDecision> => {
  const settings = await getPrivacySettings();
  const url = guardUrl(settings);
  if (!(url && settings.on && settings.places[use.place ?? "service"])) {
    return { state: "off" };
  }
  const provider = await providerFor(sourceId);
  if (provider.local && !settings.local) {
    return { state: "local" };
  }
  return {
    guard: {
      ...policyFor(settings),
      onAnswer: use.onAnswer,
      onMasked: use.onMasked,
      session: use.session ?? `call-${crypto.randomUUID()}`,
      token: getEnv().PII_GUARD_TOKEN,
      url,
    },
    state: "on",
  };
};

/**
 * Data protection for a call to a source, or null when it does not apply: off in the settings or
 * for this place, not set up, or a local model the admin leaves alone (its data does not leave the
 * server).
 */
export const guardFor = async (
  sourceId: string,
  use: ModelUse = {}
): Promise<GuardOptions | null> => {
  const decision = await decideGuard(sourceId, use);
  return decision.state === "on" ? decision.guard : null;
};

export const getLanguageModel = async (
  sourceId: string,
  modelId: string,
  use: ModelUse = {}
): Promise<LanguageModel> => {
  const provider = await providerFor(sourceId);
  const model = provider.languageModel(modelId);
  const guard = await guardFor(sourceId, use);
  if (!guard) {
    return model;
  }
  return wrapLanguageModel({
    middleware: maskingMiddleware(guard),
    model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
  });
};

/** How a draft would reach a source's model (P31, З7): as it is, masked like a send would be, or not at all. */
export type DraftPreview =
  | { state: "off" }
  | { state: "local" }
  | { state: "down" }
  | { state: "blocked" }
  | { state: "masked"; text: string; labels: ModelLabel[] };

export const previewDraft = async (
  sourceId: string,
  session: string,
  text: string
): Promise<DraftPreview> => {
  const decision = await decideGuard(sourceId, { place: "chat", session });
  if (decision.state !== "on") {
    return decision;
  }
  try {
    const masked = await previewMask(text, decision.guard);
    return {
      labels: masked.entities.map((e) => ({
        label: e.placeholder,
        type: e.type,
        value: e.value,
      })),
      state: "masked",
      text: masked.text,
    };
  } catch (error) {
    if (isGuardBlocked(error)) {
      return { state: "blocked" };
    }
    if (isGuardUnavailable(error)) {
      return { state: "down" };
    }
    throw error;
  }
};

/** The settings sandbox (З6): a text masked under the current rules, and which of its types would stop a request. */
export type SandboxResult =
  | { state: "unset" }
  | { state: "down" }
  | { state: "masked"; text: string; labels: ModelLabel[]; blocked: string[] };

export const sandboxMask = async (text: string): Promise<SandboxResult> => {
  const settings = await getPrivacySettings();
  const url = guardUrl(settings);
  if (!url) {
    return { state: "unset" };
  }
  const { keep, block } = policyFor(settings);
  try {
    // Blocked types are masked too, so the person sees what in the text stops the request.
    const masked = await previewMask(text, {
      keep,
      session: `sandbox-${crypto.randomUUID()}`,
      token: getEnv().PII_GUARD_TOKEN,
      url,
    });
    const labels = masked.entities.map((e) => ({
      label: e.placeholder,
      type: e.type,
      value: e.value,
    }));
    return {
      blocked: [...new Set(labels.map((l) => l.type))].filter((t) =>
        (block as readonly string[]).includes(t)
      ),
      labels,
      state: "masked",
      text: masked.text,
    };
  } catch (error) {
    if (isGuardUnavailable(error)) {
      return { state: "down" };
    }
    throw error;
  }
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
