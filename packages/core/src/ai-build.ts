import { createAnthropic } from "@ai-sdk/anthropic";
import { createGateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { SourceKind, SourceOptions } from "@metobe/contracts/models";
import type { LanguageModel } from "ai";

import { yandexFetch } from "./ai-yandex-fetch";

// One AI SDK provider per source kind (ARCH §7), free of the DB so it can be tested. The key is always passed
// explicitly: providers never fall back to OPENAI_API_KEY / AI_GATEWAY_API_KEY from the environment.

/** Endpoints when the source has no base URL of its own; the route through a proxy is chosen by this host. */
export const DEFAULT_BASE_URL: Record<
  Exclude<SourceKind, "openai-compatible">,
  string
> = {
  anthropic: "https://api.anthropic.com/v1",
  gateway: "https://ai-gateway.vercel.sh/v4/ai",
  openai: "https://api.openai.com/v1",
  yandex: "https://ai.api.cloud.yandex.net/v1",
};

export interface ProviderInput {
  kind: SourceKind;
  apiKey: string | null;
  baseUrl: string | null;
  options: SourceOptions;
  fetch: typeof fetch;
}

export const baseUrlOf = (kind: SourceKind, baseUrl: string | null) => {
  if (kind === "openai-compatible") {
    if (!baseUrl) {
      throw new Error("an OpenAI-compatible source needs a base URL");
    }
    return baseUrl;
  }
  return baseUrl ?? DEFAULT_BASE_URL[kind];
};

/** Yandex addresses models by URI with the folder; the table keeps the short id (S3). */
export const yandexModelUri = (folderId: string, modelId: string) =>
  modelId.startsWith("gpt://")
    ? modelId
    : `gpt://${folderId}/${modelId}/latest`;

export const buildProvider = ({
  kind,
  apiKey,
  baseUrl,
  options,
  fetch,
}: ProviderInput): { languageModel: (modelId: string) => LanguageModel } => {
  const baseURL = baseUrlOf(kind, baseUrl);
  const key = apiKey ?? undefined;
  switch (kind) {
    case "openai": {
      const p = createOpenAI({ apiKey: key, baseURL, fetch });
      return { languageModel: (id) => p.responses(id) };
    }
    case "anthropic": {
      const p = createAnthropic({ apiKey: key, baseURL, fetch });
      return { languageModel: (id) => p(id) };
    }
    case "gateway": {
      const p = createGateway({ apiKey: key, baseURL, fetch });
      return { languageModel: (id) => p(id) };
    }
    case "yandex": {
      if (options.kind !== "yandex") {
        throw new Error("a Yandex source needs its folder id");
      }
      const p = createOpenAICompatible({
        apiKey: key,
        baseURL,
        fetch: yandexFetch(fetch),
        includeUsage: true,
        name: "yandex",
      });
      return {
        languageModel: (id) =>
          p.chatModel(yandexModelUri(options.folderId, id)),
      };
    }
    case "openai-compatible": {
      const p = createOpenAICompatible({
        apiKey: key,
        baseURL,
        fetch,
        // Without it llama.cpp and others send no usage in a stream: no tokens, no cache, no cost.
        includeUsage: true,
        name: "compatible",
      });
      return { languageModel: (id) => p.chatModel(id) };
    }
    default: {
      const unknown: never = kind;
      throw new Error(`unknown source kind ${String(unknown)}`);
    }
  }
};
