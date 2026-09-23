// Prototype data: plausible providers, models and proxies. Prices are illustrative.

export type ProviderKind = "openai" | "anthropic" | "gateway" | "yandex" | "compatible";

/** `null` — the source did not say (we try and degrade), `false` — known not to work. */
export type Caps = {
  tools: boolean | null;
  vision: boolean | null;
  reasoning: boolean | null;
  structured: boolean | null;
};

export type Model = {
  id: string;
  title: string;
  vendor: string;
  context: number;
  caps: Caps;
  price: { input: number; output: number; currency: "USD" | "RUB" } | null;
  /** Release date as the provider API reports it (Gateway `released`, Anthropic `created_at`, OpenAI `created`); null when unknown. */
  released?: string | null;
};

export type ProviderSpec = {
  kind: ProviderKind;
  title: string;
  blurb: string;
  keyLabel: string;
  keyPlaceholder: string;
  keyPrefix: RegExp;
  extraField?: { id: string; label: string; placeholder: string; hint: string };
  keyOptional?: boolean;
  /** How the check behaves in this demo. */
  directBlocked: boolean;
  models: Model[];
  hiddenCount: number;
  hiddenNote: string;
};

export type Proxy = { id: string; title: string; type: "http" | "socks5"; country: string; latency: number };

export const PROXIES: Proxy[] = [
  { country: "DE", id: "corp", latency: 48, title: "Корп-прокси", type: "http" },
  { country: "NL", id: "ams", latency: 71, title: "SOCKS Амстердам", type: "socks5" },
];

const c = (tools: boolean | null, vision: boolean | null, reasoning: boolean | null, structured: boolean | null): Caps => ({
  reasoning,
  structured,
  tools,
  vision,
});

export const PROVIDERS: ProviderSpec[] = [
  {
    blurb: "GPT-5.2, o-серия",
    directBlocked: true,
    hiddenCount: 9,
    hiddenNote: "эмбеддинги, картинки и голос",
    keyLabel: "API-ключ",
    keyPlaceholder: "sk-proj-…",
    keyPrefix: /^sk-(proj-)?(?!ant)/,
    kind: "openai",
    models: [
      { caps: c(true, true, true, true), context: 400_000, id: "gpt-5.2", price: { currency: "USD", input: 1.75, output: 14 }, title: "GPT-5.2", vendor: "OpenAI" },
      { caps: c(true, true, true, true), context: 400_000, id: "gpt-5.2-mini", price: { currency: "USD", input: 0.25, output: 2 }, title: "GPT-5.2 mini", vendor: "OpenAI" },
      { caps: c(true, true, true, true), context: 400_000, id: "gpt-5-nano", price: { currency: "USD", input: 0.05, output: 0.4 }, title: "GPT-5 nano", vendor: "OpenAI" },
      { caps: c(true, true, false, true), context: 1_000_000, id: "gpt-4.1", price: { currency: "USD", input: 2, output: 8 }, title: "GPT-4.1", vendor: "OpenAI" },
      { caps: c(true, true, true, true), context: 200_000, id: "o4-mini", price: { currency: "USD", input: 1.1, output: 4.4 }, title: "o4-mini", vendor: "OpenAI" },
    ],
    title: "OpenAI",
  },
  {
    blurb: "Claude Opus, Sonnet, Haiku",
    directBlocked: true,
    hiddenCount: 0,
    hiddenNote: "",
    keyLabel: "API-ключ",
    keyPlaceholder: "sk-ant-…",
    keyPrefix: /^sk-ant-/,
    kind: "anthropic",
    models: [
      { caps: c(true, true, true, true), context: 1_000_000, id: "claude-opus-5-5", price: { currency: "USD", input: 5, output: 25 }, title: "Claude Opus 5.5", vendor: "Anthropic" },
      { caps: c(true, true, true, true), context: 1_000_000, id: "claude-sonnet-5", price: { currency: "USD", input: 3, output: 15 }, title: "Claude Sonnet 5", vendor: "Anthropic" },
      { caps: c(true, true, true, true), context: 200_000, id: "claude-haiku-4-5", price: { currency: "USD", input: 1, output: 5 }, title: "Claude Haiku 4.5", vendor: "Anthropic" },
      { caps: c(true, true, true, true), context: 1_000_000, id: "claude-sonnet-4-5", price: { currency: "USD", input: 3, output: 15 }, title: "Claude Sonnet 4.5", vendor: "Anthropic" },
    ],
    title: "Anthropic",
  },
  {
    blurb: "Один ключ — модели всех вендоров",
    directBlocked: false,
    hiddenCount: 126,
    hiddenNote: "эмбеддинги, картинки, видео и голос",
    keyLabel: "Ключ AI Gateway",
    keyPlaceholder: "vck_…",
    keyPrefix: /^vck_/,
    kind: "gateway",
    models: [
      { caps: c(true, true, true, true), context: 1_000_000, id: "anthropic/claude-sonnet-5", price: { currency: "USD", input: 3, output: 15 }, title: "Claude Sonnet 5", vendor: "Anthropic" },
      { caps: c(true, true, true, true), context: 400_000, id: "openai/gpt-5.2", price: { currency: "USD", input: 1.75, output: 14 }, title: "GPT-5.2", vendor: "OpenAI" },
      { caps: c(true, true, true, true), context: 1_000_000, id: "google/gemini-3-pro", price: { currency: "USD", input: 2, output: 12 }, title: "Gemini 3 Pro", vendor: "Google" },
      { caps: c(true, true, true, true), context: 1_000_000, id: "google/gemini-3-flash", price: { currency: "USD", input: 0.5, output: 3 }, title: "Gemini 3 Flash", vendor: "Google" },
      { caps: c(true, true, true, true), context: 256_000, id: "xai/grok-4.1", price: { currency: "USD", input: 3, output: 15 }, title: "Grok 4.1", vendor: "xAI" },
      { caps: c(true, false, true, true), context: 128_000, id: "deepseek/deepseek-v3.2", price: { currency: "USD", input: 0.28, output: 0.42 }, title: "DeepSeek V3.2", vendor: "DeepSeek" },
      { caps: c(true, false, true, true), context: 256_000, id: "moonshotai/kimi-k2.5", price: { currency: "USD", input: 0.6, output: 2.5 }, title: "Kimi K2.5", vendor: "Moonshot" },
      { caps: c(true, false, true, true), context: 256_000, id: "alibaba/qwen3-max", price: { currency: "USD", input: 1.2, output: 6 }, title: "Qwen3 Max", vendor: "Alibaba" },
      { caps: c(true, true, false, true), context: 128_000, id: "mistral/mistral-large-3", price: { currency: "USD", input: 0.5, output: 1.5 }, title: "Mistral Large 3", vendor: "Mistral" },
      { caps: c(true, false, true, true), context: 200_000, id: "zai/glm-4.7", price: { currency: "USD", input: 0.6, output: 2.2 }, title: "GLM-4.7", vendor: "Z.ai" },
    ],
    title: "Vercel AI Gateway",
  },
  {
    blurb: "Alice AI, YandexGPT, открытые модели",
    directBlocked: false,
    extraField: { hint: "Каталог в консоли Yandex Cloud, начинается с b1g", id: "folder", label: "ID каталога", placeholder: "b1g…" },
    hiddenCount: 0,
    hiddenNote: "",
    keyLabel: "API-ключ сервисного аккаунта",
    keyPlaceholder: "AQVN…",
    keyPrefix: /^AQVN/,
    kind: "yandex",
    models: [
      { caps: c(true, true, null, null), context: 32_000, id: "aliceai-llm", price: { currency: "RUB", input: 500, output: 1200 }, title: "Alice AI LLM", vendor: "Яндекс" },
      { caps: c(true, false, false, true), context: 32_000, id: "yandexgpt-5.1", price: { currency: "RUB", input: 800, output: 800 }, title: "YandexGPT 5.1 Pro", vendor: "Яндекс" },
      { caps: c(true, false, false, true), context: 32_000, id: "yandexgpt-5-lite", price: { currency: "RUB", input: 200, output: 200 }, title: "YandexGPT 5 Lite", vendor: "Яндекс" },
      { caps: c(null, false, true, null), context: 256_000, id: "qwen3-235b-a22b", price: { currency: "RUB", input: 400, output: 400 }, title: "Qwen3 235B", vendor: "Alibaba" },
      { caps: c(null, false, true, null), context: 128_000, id: "gpt-oss-120b", price: { currency: "RUB", input: 300, output: 300 }, title: "gpt-oss-120b", vendor: "OpenAI" },
      { caps: c(null, false, true, null), context: 128_000, id: "deepseek-v3.2", price: { currency: "RUB", input: 350, output: 350 }, title: "DeepSeek V3.2", vendor: "DeepSeek" },
    ],
    title: "Yandex AI Studio",
  },
  {
    blurb: "Ollama, vLLM, LM Studio",
    directBlocked: false,
    extraField: { hint: "Для Ollama в compose — http://ollama:11434/v1", id: "baseUrl", label: "Адрес API", placeholder: "http://ollama:11434/v1" },
    hiddenCount: 0,
    hiddenNote: "",
    keyLabel: "Ключ, если сервер его требует",
    keyOptional: true,
    keyPlaceholder: "необязательно",
    keyPrefix: /.*/,
    kind: "compatible",
    models: [
      { caps: c(null, null, null, null), context: 128_000, id: "llama3.3:70b", price: null, title: "llama3.3:70b", vendor: "Meta" },
      { caps: c(null, null, true, null), context: 40_000, id: "qwen3:32b", price: null, title: "qwen3:32b", vendor: "Alibaba" },
      { caps: c(null, true, null, null), context: 128_000, id: "gemma3:27b", price: null, title: "gemma3:27b", vendor: "Google" },
      { caps: c(null, null, true, null), context: 128_000, id: "deepseek-r1:32b", price: null, title: "deepseek-r1:32b", vendor: "DeepSeek" },
    ],
    title: "OpenAI-совместимый",
  },
];

export const providerBy = (kind: ProviderKind) => PROVIDERS.find((p) => p.kind === kind) as ProviderSpec;

/** Guess the provider by key format — the paste-first variant relies on it. */
export const detectProvider = (key: string): ProviderKind | null => {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("vck_")) return "gateway";
  if (k.startsWith("AQVN")) return "yandex";
  if (/^sk-(proj-)?[A-Za-z0-9]/.test(k)) return "openai";
  if (/^https?:\/\//.test(k)) return "compatible";
  return null;
};

export const SAMPLE_KEYS: Record<ProviderKind, string> = {
  anthropic: "sk-ant-api03-Xk2vR9mTqLp4wN8sYc1Hd",
  compatible: "http://ollama:11434/v1",
  gateway: "vck_4fQ9tZr1Lm8Wx2Pb6Nk3Hs",
  openai: "sk-proj-7Hc2Lq9VbN4xKt1Wm8Rz",
  yandex: "AQVN1r8Zk3Pq9Tx4Lm2Wb7Hc",
};

export const fmtContext = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}K`);

export const fmtPrice = (m: Model) => {
  if (!m.price) return "локально";
  const sign = m.price.currency === "RUB" ? "₽" : "$";
  const f = (v: number) => (m.price?.currency === "RUB" ? `${v} ${sign}` : `${sign}${v}`);
  return `${f(m.price.input)} / ${f(m.price.output)}`;
};

const pr = new Intl.PluralRules("ru");
/** «1 модель», «2 модели», «5 моделей». */
export const models = (n: number) => `${n} ${{ few: "модели", many: "моделей", one: "модель", other: "модели" }[pr.select(n) as "one"]}`;

// --- facts the APIs actually give: release dates -------------------------------------------------

const RELEASED: Record<string, string> = {
  "aliceai-llm": "2026-03-12",
  "anthropic/claude-sonnet-5": "2026-05-20",
  "claude-haiku-4-5": "2025-10-15",
  "claude-opus-5-5": "2026-08-27",
  "claude-sonnet-4-5": "2025-09-29",
  "claude-sonnet-5": "2026-05-20",
  "deepseek-v3.2": "2025-12-01",
  "deepseek/deepseek-v3.2": "2025-12-01",
  "google/gemini-3-flash": "2026-07-09",
  "google/gemini-3-pro": "2026-06-30",
  "gpt-4.1": "2025-04-14",
  "gpt-5-nano": "2025-08-07",
  "gpt-5.2": "2026-08-05",
  "gpt-5.2-mini": "2026-08-05",
  "gpt-oss-120b": "2025-08-05",
  "mistral/mistral-large-3": "2025-12-02",
  "moonshotai/kimi-k2.5": "2026-01-27",
  "o4-mini": "2025-04-16",
  "openai/gpt-5.2": "2026-08-05",
  "qwen3-235b-a22b": "2025-07-21",
  "alibaba/qwen3-max": "2025-09-05",
  "xai/grok-4.1": "2025-11-17",
  "yandexgpt-5-lite": "2025-02-25",
  "yandexgpt-5.1": "2025-10-28",
  "zai/glm-4.7": "2025-12-22",
};

// Gateway's long tail: a real account lists ~260 chat models, a few dozen are enough to feel the scroll.
const GATEWAY_TAIL: [string, string, string, number, Caps, number, number, string][] = [
  ["anthropic/claude-opus-5-5", "Claude Opus 5.5", "Anthropic", 1_000_000, c(true, true, true, true), 5, 25, "2026-08-27"],
  ["anthropic/claude-haiku-4-5", "Claude Haiku 4.5", "Anthropic", 200_000, c(true, true, true, true), 1, 5, "2025-10-15"],
  ["openai/gpt-5.2-mini", "GPT-5.2 mini", "OpenAI", 400_000, c(true, true, true, true), 0.25, 2, "2026-08-05"],
  ["openai/gpt-5-nano", "GPT-5 nano", "OpenAI", 400_000, c(true, true, true, true), 0.05, 0.4, "2025-08-07"],
  ["openai/gpt-oss-120b", "gpt-oss-120b", "OpenAI", 131_000, c(true, false, true, true), 0.1, 0.5, "2025-08-05"],
  ["google/gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite", "Google", 1_000_000, c(true, true, true, true), 0.1, 0.4, "2025-07-22"],
  ["xai/grok-4.1-fast", "Grok 4.1 Fast", "xAI", 2_000_000, c(true, true, true, true), 0.2, 0.5, "2025-11-19"],
  ["xai/grok-code-fast-1", "Grok Code Fast", "xAI", 256_000, c(true, false, true, true), 0.2, 1.5, "2025-08-28"],
  ["deepseek/deepseek-r1", "DeepSeek R1", "DeepSeek", 128_000, c(true, false, true, false), 0.55, 2.19, "2025-05-28"],
  ["meta/llama-4-maverick", "Llama 4 Maverick", "Meta", 1_000_000, c(true, true, false, true), 0.2, 0.6, "2025-04-05"],
  ["meta/llama-4-scout", "Llama 4 Scout", "Meta", 10_000_000, c(true, true, false, true), 0.1, 0.3, "2025-04-05"],
  ["mistral/magistral-medium", "Magistral Medium", "Mistral", 128_000, c(true, false, true, true), 2, 5, "2025-09-17"],
  ["mistral/codestral", "Codestral", "Mistral", 256_000, c(true, false, false, true), 0.3, 0.9, "2025-07-30"],
  ["mistral/devstral-2", "Devstral 2", "Mistral", 256_000, c(true, false, false, true), 0.4, 2, "2026-07-02"],
  ["alibaba/qwen3-coder", "Qwen3 Coder", "Alibaba", 262_000, c(true, false, false, true), 0.4, 1.6, "2025-07-22"],
  ["alibaba/qwen3-vl", "Qwen3 VL", "Alibaba", 262_000, c(true, true, true, true), 0.3, 1.5, "2026-07-15"],
  ["moonshotai/kimi-k2-thinking", "Kimi K2 Thinking", "Moonshot", 256_000, c(true, false, true, true), 0.6, 2.5, "2025-11-06"],
  ["zai/glm-4.5-air", "GLM-4.5 Air", "Z.ai", 128_000, c(true, false, true, true), 0.2, 1.1, "2025-07-28"],
  ["minimax/minimax-m2", "MiniMax M2", "MiniMax", 205_000, c(true, false, true, true), 0.3, 1.2, "2025-10-27"],
  ["perplexity/sonar-pro", "Sonar Pro", "Perplexity", 200_000, c(false, true, true, false), 3, 15, "2025-03-07"],
  ["perplexity/sonar", "Sonar", "Perplexity", 127_000, c(false, true, false, false), 1, 1, "2025-01-21"],
  ["amazon/nova-2-pro", "Nova 2 Pro", "Amazon", 1_000_000, c(true, true, true, true), 1.25, 10, "2026-07-24"],
  ["amazon/nova-2-lite", "Nova 2 Lite", "Amazon", 1_000_000, c(true, true, true, true), 0.3, 2.5, "2025-12-02"],
  ["cohere/command-a", "Command A", "Cohere", 256_000, c(true, false, false, true), 2.5, 10, "2025-03-13"],
  ["inception/mercury-coder", "Mercury Coder", "Inception", 32_000, c(true, false, false, false), 0.25, 1, "2025-04-30"],
  ["meituan/longcat-flash", "LongCat Flash", "Meituan", 128_000, c(true, false, true, true), 0.15, 0.75, "2025-09-01"],
  ["bytedance/seed-2", "Seed 2", "ByteDance", 256_000, c(true, true, true, true), 0.4, 2, "2026-08-14"],
  ["arcee/trinity-large", "Trinity Large", "Arcee", 128_000, c(true, false, true, true), 0.5, 2, "2026-06-11"],
];

(providerBy("gateway") as ProviderSpec).models.push(
  ...GATEWAY_TAIL.map(([id, title, vendor, context, caps, input, output, released]) => ({
    caps,
    context,
    id,
    price: { currency: "USD" as const, input, output },
    released,
    title,
    vendor,
  }))
);
for (const spec of PROVIDERS) for (const m of spec.models) m.released ??= RELEASED[m.id] ?? null;

const TODAY = new Date("2026-09-24");
/** "New" is a fact, not an opinion: released within the last 90 days. */
export const isNew = (m: Model) => Boolean(m.released && (TODAY.getTime() - new Date(m.released).getTime()) / 86_400_000 <= 90);
/** Newest first; models without a date (local servers) keep their order at the end. */
export const byNewest = (a: Model, b: Model) => (b.released ?? "").localeCompare(a.released ?? "");
