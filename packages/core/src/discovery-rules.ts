import type { Capabilities, SourceKind } from "@metobe/contracts/models";
import { unknownCapabilities } from "@metobe/contracts/models";

// Rules for discovery (ARCH §5.2). Capabilities come from the sources themselves (Gateway tags, Anthropic's
// /v1/models, Ollama's /api/show) or from what spike S3 verified for Yandex. Nothing guessed: what nobody reports
// stays null («unknown»). Prices come only from the Gateway or from the admin.

/** Providers (who made the model) with their built-in logo key. `other` catches what no rule recognises. */
export const PROVIDERS = [
  { logo: "openai", slug: "openai", title: "OpenAI" },
  { logo: "anthropic", slug: "anthropic", title: "Anthropic" },
  { logo: "google", slug: "google", title: "Google" },
  { logo: "alibaba", slug: "alibaba", title: "Alibaba" },
  { logo: "deepseek", slug: "deepseek", title: "DeepSeek" },
  { logo: "xai", slug: "xai", title: "xAI" },
  { logo: "meta", slug: "meta", title: "Meta" },
  { logo: "mistral", slug: "mistral", title: "Mistral" },
  { logo: "moonshot", slug: "moonshot", title: "Moonshot" },
  { logo: "zai", slug: "zai", title: "Z.ai" },
  { logo: "minimax", slug: "minimax", title: "MiniMax" },
  { logo: "cohere", slug: "cohere", title: "Cohere" },
  { logo: "perplexity", slug: "perplexity", title: "Perplexity" },
  { logo: "nova", slug: "amazon", title: "Amazon" },
  { logo: "bytedance", slug: "bytedance", title: "ByteDance" },
  { logo: "meituan", slug: "meituan", title: "Meituan" },
  { logo: "arcee", slug: "arcee", title: "Arcee" },
  { logo: "inception", slug: "inception", title: "Inception" },
  { logo: "yandex", slug: "yandex", title: "Яндекс" },
  { logo: null, slug: "other", title: "Другие" },
] as const;
export type ProviderSlug = (typeof PROVIDERS)[number]["slug"];
const KNOWN = new Set<string>(PROVIDERS.map((p) => p.slug));

/** AI Gateway's `owned_by` values that differ from our slugs. */
const GATEWAY_OWNER: Record<string, ProviderSlug> = {
  moonshotai: "moonshot",
  "z-ai": "zai",
  zai: "zai",
};

/** Model names by family, for sources that do not say who made a model (Yandex, OpenAI-compatible). */
const NAME_RULES: [RegExp, ProviderSlug][] = [
  [/^(?:gpt-oss|gpt-|o\d|chatgpt)/u, "openai"],
  [/^claude/u, "anthropic"],
  [/^(?:gemini|gemma)/u, "google"],
  [/^(?:qwen|qwq)/u, "alibaba"],
  [/^deepseek/u, "deepseek"],
  [/^grok/u, "xai"],
  [/^(?:llama|codellama)/u, "meta"],
  [
    /^(?:mistral|mixtral|magistral|devstral|codestral|ministral|pixtral)/u,
    "mistral",
  ],
  [/^kimi/u, "moonshot"],
  [/^glm/u, "zai"],
  [/^minimax/u, "minimax"],
  [/^(?:command|aya)/u, "cohere"],
  [/^(?:yandexgpt|aliceai)/u, "yandex"],
];

/** Who made a model: the source itself for direct keys, `owned_by` for the Gateway, the name family otherwise. */
export const providerSlugFor = (
  kind: SourceKind,
  modelId: string,
  ownedBy?: string
): ProviderSlug => {
  if (kind === "openai") {
    return "openai";
  }
  if (kind === "anthropic") {
    return "anthropic";
  }
  if (kind === "gateway") {
    const owner =
      GATEWAY_OWNER[ownedBy ?? ""] ?? ownedBy ?? modelId.split("/")[0] ?? "";
    return (KNOWN.has(owner) ? owner : "other") as ProviderSlug;
  }
  // `library/qwen3:8b`, `Qwen/Qwen3-8B` → the model part, lower-cased.
  const name = (modelId.split("/").at(-1) ?? modelId).toLowerCase();
  return NAME_RULES.find(([rule]) => rule.test(name))?.[1] ?? "other";
};

// OpenAI's /v1/models lists everything the key can reach; only chat models belong in the chat.
const OPENAI_NOT_CHAT =
  /(?:embedding|tts|whisper|transcribe|dall-e|image|realtime|audio|moderation|search|computer-use|babbage|davinci|codex-mini|sora)/u;
export const isOpenAIChatModel = (id: string) =>
  /^(?:gpt-|o\d|chatgpt)/u.test(id) && !OPENAI_NOT_CHAT.test(id);

/** Yandex: tool calling verified on every chat model in spike S3; the rest is not published in a form we can read. */
export const YANDEX_CAPABILITIES: Capabilities = {
  reasoning: null,
  structured: null,
  tools: true,
  vision: null,
};

/** A readable title from a Yandex model id: yandexgpt-5.1 → YandexGPT 5.1, aliceai-llm → Alice AI LLM. */
export const yandexTitle = (id: string) =>
  id
    .replace(/^yandexgpt/u, "YandexGPT")
    .replace(/^aliceai-llm/u, "Alice AI LLM")
    .replace(/^qwen/u, "Qwen")
    .replace(/^deepseek/u, "DeepSeek")
    .replaceAll("-pro", " Pro")
    .replaceAll("-lite", " Lite")
    .replaceAll("-flash", " Flash")
    .replaceAll("-", " ");

/** Ollama's /api/show capabilities: tools, vision, thinking. It does not state structured output. */
export const ollamaCapabilities = (
  capabilities: string[] | undefined
): Capabilities =>
  capabilities
    ? {
        reasoning: capabilities.includes("thinking"),
        structured: null,
        tools: capabilities.includes("tools"),
        vision: capabilities.includes("vision"),
      }
    : unknownCapabilities;

/** Ollama's context: the model's own `*.context_length`, cut down by a `num_ctx` parameter when the admin set one. */
export const ollamaContext = (show: {
  model_info?: Record<string, unknown>;
  parameters?: string;
}) => {
  const numCtx = /(?:^|\n)num_ctx\s+(?<n>\d+)/u.exec(show.parameters ?? "")
    ?.groups?.n;
  if (numCtx) {
    return Number(numCtx);
  }
  const entry = Object.entries(show.model_info ?? {}).find(([key]) =>
    key.endsWith(".context_length")
  );
  return typeof entry?.[1] === "number" ? entry[1] : null;
};
