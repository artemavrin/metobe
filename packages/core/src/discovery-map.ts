import type {
  Capabilities,
  CapabilitySource,
  Currency,
} from "@metobe/contracts/models";
import { unknownCapabilities } from "@metobe/contracts/models";

import {
  isOpenAIChatModel,
  ollamaCapabilities,
  ollamaContext,
  providerSlugFor,
  YANDEX_CAPABILITIES,
  yandexTitle,
} from "./discovery-rules";
import type { ProviderSlug } from "./discovery-rules";

// What each source's model list turns into (ARCH §5.2), free of the network so it can be tested.

export interface DiscoveredPrice {
  input: string | null;
  output: string | null;
  cacheRead: string | null;
  cacheWrite: string | null;
  unitTokens: number;
  currency: Currency;
}

export interface DiscoveredModel {
  modelId: string;
  title: string;
  provider: ProviderSlug;
  capabilities: Capabilities;
  capabilitiesSource: CapabilitySource;
  contextWindow: number | null;
  releasedAt: string | null;
  /** Only the Gateway reports prices; for other sources the admin enters them and sync leaves them alone. */
  price: DiscoveredPrice | null;
}

const isoDate = (unixSeconds: number | undefined) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString().slice(0, 10) : null;

export interface GatewayModel {
  id: string;
  name?: string;
  owned_by?: string;
  type?: string;
  released?: number;
  context_window?: number;
  tags?: string[];
  pricing?: {
    input?: string;
    output?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
}

/** AI Gateway describes its models itself (S4): capabilities from tags, USD prices per 1 token, the maker in owned_by. */
export const fromGateway = (models: GatewayModel[]): DiscoveredModel[] =>
  models
    .filter((m) => m.type === "language")
    .map((m) => {
      const tags = new Set(m.tags);
      const p = m.pricing;
      return {
        // Tags are the Gateway's full statement about a model, so a missing tag means «no».
        capabilities: {
          reasoning: tags.has("reasoning"),
          structured: tags.has("structured-output"),
          tools: tags.has("tool-use"),
          vision: tags.has("vision"),
        },
        capabilitiesSource: "discovered" as const,
        contextWindow: m.context_window ?? null,
        modelId: m.id,
        // Kept exactly as reported — per 1 token — and never normalised (core/pricing does exact math).
        price:
          p?.input || p?.output
            ? {
                cacheRead: p.input_cache_read ?? null,
                cacheWrite: p.input_cache_write ?? null,
                currency: "USD" as const,
                input: p.input ?? null,
                output: p.output ?? null,
                unitTokens: 1,
              }
            : null,
        provider: providerSlugFor("gateway", m.id, m.owned_by),
        releasedAt: isoDate(m.released),
        title: m.name ?? m.id,
      };
    });

/** OpenAI's /v1/models: ids, owner and date only — capabilities and context stay unknown (ARCH §7.3 degrades). */
export const fromOpenAI = (
  models: { id: string; created?: number }[]
): DiscoveredModel[] =>
  models
    .filter((m) => isOpenAIChatModel(m.id))
    .map((m) => ({
      capabilities: unknownCapabilities,
      capabilitiesSource: "discovered" as const,
      contextWindow: null,
      modelId: m.id,
      price: null,
      provider: "openai" as const,
      releasedAt: isoDate(m.created),
      title: m.id,
    }));

export interface AnthropicModel {
  id: string;
  display_name?: string;
  created_at?: string;
  max_input_tokens?: number | null;
  capabilities?: {
    image_input?: { supported: boolean };
    structured_outputs?: { supported: boolean };
    thinking?: { supported: boolean };
  } | null;
}

/** Anthropic's /v1/models states capabilities and the context window itself. */
export const fromAnthropic = (models: AnthropicModel[]): DiscoveredModel[] =>
  models.map((m) => {
    const c = m.capabilities;
    return {
      capabilities: c
        ? {
            reasoning: c.thinking?.supported ?? null,
            structured: c.structured_outputs?.supported ?? null,
            // Not in the capabilities object; every Claude model on the Messages API takes tools.
            tools: true,
            vision: c.image_input?.supported ?? null,
          }
        : unknownCapabilities,
      capabilitiesSource: "discovered" as const,
      // 0 means «not stated» in Anthropic's example payloads.
      contextWindow: m.max_input_tokens || null,
      modelId: m.id,
      price: null,
      provider: "anthropic" as const,
      releasedAt:
        m.created_at && !m.created_at.startsWith("1970")
          ? m.created_at.slice(0, 10)
          : null,
      title: m.display_name ?? m.id,
    };
  });

/** Yandex's /v1/models: full URIs of the folder's models; chat ones are gpt:// minus speech-* (S3). */
export const fromYandex = (models: { id: string }[]): DiscoveredModel[] =>
  models
    .map(
      (m) => /^gpt:\/\/[^/]+\/(?<name>[^/]+)\/latest$/u.exec(m.id)?.groups?.name
    )
    .filter(
      (name): name is string => Boolean(name) && !name?.startsWith("speech-")
    )
    .map((name) => ({
      capabilities: YANDEX_CAPABILITIES,
      capabilitiesSource: "seed" as const,
      contextWindow: null,
      modelId: name,
      price: null,
      provider: providerSlugFor("yandex", name),
      releasedAt: null,
      title: yandexTitle(name),
    }));

export interface OllamaShow {
  capabilities?: string[];
  model_info?: Record<string, unknown>;
  parameters?: string;
}

/**
 * An OpenAI-compatible server lists ids; when it is Ollama, `/api/show` per model adds capabilities and the
 * context (`shows` holds those answers). The maker is guessed from the name family.
 */
export const fromCompatible = (
  models: { id: string }[],
  shows = new Map<string, OllamaShow>()
): DiscoveredModel[] =>
  models.map((m) => {
    const show = shows.get(m.id);
    return {
      capabilities: ollamaCapabilities(show?.capabilities),
      capabilitiesSource: "discovered" as const,
      contextWindow: show ? ollamaContext(show) : null,
      modelId: m.id,
      price: null,
      provider: providerSlugFor("openai-compatible", m.id),
      releasedAt: null,
      title: m.id,
    };
  });
