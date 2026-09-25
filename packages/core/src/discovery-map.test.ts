import { describe, expect, it } from "vitest";

import {
  fromAnthropic,
  fromCompatible,
  fromGateway,
  fromOpenAI,
  fromYandex,
} from "./discovery-map";
import {
  isOpenAIChatModel,
  providerSlugFor,
  yandexTitle,
} from "./discovery-rules";

// Fixtures are trimmed copies of real answers seen while building this (Gateway /v1/models, Anthropic's docs
// example, Ollama /api/show on a LAN server, Yandex /v1/models).

describe("AI Gateway", () => {
  const [sonnet, ...rest] = fromGateway([
    {
      context_window: 1_000_000,
      id: "anthropic/claude-sonnet-4",
      name: "Claude Sonnet 4",
      owned_by: "anthropic",
      pricing: {
        input: "0.000003",
        input_cache_read: "0.0000003",
        input_cache_write: "0.00000375",
        output: "0.000015",
      },
      released: 1_747_872_000,
      tags: [
        "file-input",
        "reasoning",
        "tool-use",
        "vision",
        "explicit-caching",
        "structured-output",
      ],
      type: "language",
    },
    {
      id: "openai/text-embedding-3-small",
      owned_by: "openai",
      type: "embedding",
    },
    { id: "moonshotai/kimi-k2", owned_by: "moonshotai", type: "language" },
    { id: "spacexai/grok-4", owned_by: "spacexai", type: "language" },
    { id: "quiverai/arrow-1", owned_by: "quiverai", type: "language" },
  ]);

  it("keeps language models only and reads the maker from owned_by", () => {
    expect(rest.map((m) => [m.modelId, m.provider])).toEqual([
      ["moonshotai/kimi-k2", "moonshot"],
      // Grok is listed under SpaceX AI; a maker we don't know stays itself rather than «Другие».
      ["spacexai/grok-4", "xai"],
      ["quiverai/arrow-1", "quiverai"],
    ]);
  });

  it("takes capabilities from tags and prices per token exactly as reported", () => {
    expect(sonnet?.capabilities).toEqual({
      reasoning: true,
      structured: true,
      tools: true,
      vision: true,
    });
    expect(sonnet?.price).toEqual({
      cacheRead: "0.0000003",
      cacheWrite: "0.00000375",
      currency: "USD",
      input: "0.000003",
      output: "0.000015",
      unitTokens: 1,
    });
    expect(sonnet?.releasedAt).toBe("2025-05-22");
  });
});

describe("Anthropic", () => {
  it("reads capabilities and the context window from /v1/models", () => {
    const [m] = fromAnthropic([
      {
        capabilities: {
          image_input: { supported: true },
          structured_outputs: { supported: true },
          thinking: { supported: true },
        },
        created_at: "2026-07-24T00:00:00Z",
        display_name: "Claude Opus 5",
        id: "claude-opus-5",
        max_input_tokens: 1_000_000,
      },
    ]);
    expect(m).toMatchObject({
      contextWindow: 1_000_000,
      provider: "anthropic",
      releasedAt: "2026-07-24",
      title: "Claude Opus 5",
    });
    expect(m?.capabilities).toEqual({
      reasoning: true,
      structured: true,
      tools: true,
      vision: true,
    });
  });

  it("treats 0 tokens and an epoch date as «not stated»", () => {
    const [m] = fromAnthropic([
      {
        created_at: "1970-01-01T00:00:00Z",
        id: "claude-x",
        max_input_tokens: 0,
      },
    ]);
    expect(m?.contextWindow).toBeNull();
    expect(m?.releasedAt).toBeNull();
  });
});

describe("OpenAI", () => {
  it("keeps chat models and leaves capabilities unknown", () => {
    const out = fromOpenAI([
      { id: "gpt-5.2" },
      { id: "o4-mini" },
      { id: "text-embedding-3-small" },
      { id: "gpt-4o-realtime-preview" },
      { id: "dall-e-3" },
      { id: "whisper-1" },
    ]);
    expect(out.map((m) => m.modelId)).toEqual(["gpt-5.2", "o4-mini"]);
    expect(out[0]?.capabilities.tools).toBeNull();
  });
});

describe("Yandex", () => {
  it("keeps chat models from full URIs and names them", () => {
    const out = fromYandex([
      { id: "gpt://b1g/aliceai-llm/latest" },
      { id: "gpt://b1g/yandexgpt-5.1/latest" },
      { id: "gpt://b1g/qwen3-235b-a22b-fp8/latest" },
      { id: "gpt://b1g/speech-realtime-250923/latest" },
      { id: "emb://b1g/text-embeddings/latest" },
      { id: "gpt://b1g/yandexgpt-lite/rc" },
    ]);
    expect(out.map((m) => [m.modelId, m.provider])).toEqual([
      ["aliceai-llm", "yandex"],
      ["yandexgpt-5.1", "yandex"],
      ["qwen3-235b-a22b-fp8", "alibaba"],
    ]);
    // S3 verified tool calling on every chat model; nothing else is claimed.
    expect(out[0]?.capabilities).toEqual({
      reasoning: null,
      structured: null,
      tools: true,
      vision: null,
    });
    expect(yandexTitle("yandexgpt-5-pro")).toBe("YandexGPT 5 Pro");
  });
});

describe("OpenAI-compatible (Ollama)", () => {
  it("adds capabilities and context from /api/show, honouring num_ctx", () => {
    const shows = new Map([
      [
        "gemma4:e4b",
        {
          capabilities: ["completion", "vision", "audio", "tools", "thinking"],
          model_info: { "gemma4.context_length": 131_072 },
        },
      ],
      [
        "gpt-oss-20b-32k:latest",
        {
          capabilities: ["completion", "tools", "thinking"],
          model_info: { "gptoss.context_length": 131_072 },
          parameters: "num_ctx                        32768",
        },
      ],
    ]);
    const out = fromCompatible(
      [
        { id: "gemma4:e4b" },
        { id: "gpt-oss-20b-32k:latest" },
        { id: "mystery-model" },
      ],
      shows
    );
    expect(out[0]).toMatchObject({
      contextWindow: 131_072,
      provider: "google",
    });
    expect(out[0]?.capabilities).toEqual({
      reasoning: true,
      structured: null,
      tools: true,
      vision: true,
    });
    expect(out[1]).toMatchObject({ contextWindow: 32_768, provider: "openai" });
    expect(out[2]).toMatchObject({ contextWindow: null, provider: "other" });
    expect(out[2]?.capabilities.tools).toBeNull();
  });
});

describe("rules", () => {
  it("guesses the maker from the name family", () => {
    expect(providerSlugFor("openai-compatible", "library/qwen3:8b")).toBe(
      "alibaba"
    );
    expect(providerSlugFor("openai-compatible", "Qwen/Qwen3-8B")).toBe(
      "alibaba"
    );
    expect(providerSlugFor("openai-compatible", "llama3.3:70b")).toBe("meta");
    expect(providerSlugFor("openai-compatible", "nemotron-3-super:cloud")).toBe(
      "nvidia"
    );
    // NVIDIA's fine-tunes of Llama are theirs, not Meta's.
    expect(
      providerSlugFor("openai-compatible", "nvidia/llama-3.1-nemotron-70b")
    ).toBe("nvidia");
    expect(providerSlugFor("gateway", "zai/glm-4.7", "zai")).toBe("zai");
    // The Gateway names the maker: an unknown one is kept as itself, not folded into «Другие».
    expect(providerSlugFor("gateway", "newco/model", "newco")).toBe("newco");
    expect(providerSlugFor("gateway", "x/model", "Inference Net")).toBe(
      "inference-net"
    );
    expect(providerSlugFor("openai-compatible", "mystery-7b")).toBe("other");
  });

  it("tells OpenAI chat models from the rest", () => {
    expect(isOpenAIChatModel("gpt-5.2-mini")).toBe(true);
    expect(isOpenAIChatModel("gpt-image-1")).toBe(false);
    expect(isOpenAIChatModel("gpt-4o-mini-tts")).toBe(false);
  });
});
