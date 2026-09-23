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
  recommended?: boolean;
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
      { caps: c(true, true, true, true), context: 400_000, id: "gpt-5.2", price: { currency: "USD", input: 1.75, output: 14 }, recommended: true, title: "GPT-5.2", vendor: "OpenAI" },
      { caps: c(true, true, true, true), context: 400_000, id: "gpt-5.2-mini", price: { currency: "USD", input: 0.25, output: 2 }, recommended: true, title: "GPT-5.2 mini", vendor: "OpenAI" },
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
      { caps: c(true, true, true, true), context: 1_000_000, id: "claude-opus-5-5", price: { currency: "USD", input: 5, output: 25 }, recommended: true, title: "Claude Opus 5.5", vendor: "Anthropic" },
      { caps: c(true, true, true, true), context: 1_000_000, id: "claude-sonnet-5", price: { currency: "USD", input: 3, output: 15 }, recommended: true, title: "Claude Sonnet 5", vendor: "Anthropic" },
      { caps: c(true, true, true, true), context: 200_000, id: "claude-haiku-4-5", price: { currency: "USD", input: 1, output: 5 }, recommended: true, title: "Claude Haiku 4.5", vendor: "Anthropic" },
      { caps: c(true, true, true, true), context: 1_000_000, id: "claude-sonnet-4-5", price: { currency: "USD", input: 3, output: 15 }, title: "Claude Sonnet 4.5", vendor: "Anthropic" },
    ],
    title: "Anthropic",
  },
  {
    blurb: "Один ключ — модели всех вендоров",
    directBlocked: false,
    hiddenCount: 250,
    hiddenNote: "ещё модели — через поиск",
    keyLabel: "Ключ AI Gateway",
    keyPlaceholder: "vck_…",
    keyPrefix: /^vck_/,
    kind: "gateway",
    models: [
      { caps: c(true, true, true, true), context: 1_000_000, id: "anthropic/claude-sonnet-5", price: { currency: "USD", input: 3, output: 15 }, recommended: true, title: "Claude Sonnet 5", vendor: "Anthropic" },
      { caps: c(true, true, true, true), context: 400_000, id: "openai/gpt-5.2", price: { currency: "USD", input: 1.75, output: 14 }, recommended: true, title: "GPT-5.2", vendor: "OpenAI" },
      { caps: c(true, true, true, true), context: 1_000_000, id: "google/gemini-3-pro", price: { currency: "USD", input: 2, output: 12 }, recommended: true, title: "Gemini 3 Pro", vendor: "Google" },
      { caps: c(true, true, true, true), context: 1_000_000, id: "google/gemini-3-flash", price: { currency: "USD", input: 0.5, output: 3 }, recommended: true, title: "Gemini 3 Flash", vendor: "Google" },
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
      { caps: c(true, true, null, null), context: 32_000, id: "aliceai-llm", price: { currency: "RUB", input: 500, output: 1200 }, recommended: true, title: "Alice AI LLM", vendor: "Яндекс" },
      { caps: c(true, false, false, true), context: 32_000, id: "yandexgpt-5.1", price: { currency: "RUB", input: 800, output: 800 }, recommended: true, title: "YandexGPT 5.1 Pro", vendor: "Яндекс" },
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
      { caps: c(null, null, null, null), context: 128_000, id: "llama3.3:70b", price: null, recommended: true, title: "llama3.3:70b", vendor: "Meta" },
      { caps: c(null, null, true, null), context: 40_000, id: "qwen3:32b", price: null, recommended: true, title: "qwen3:32b", vendor: "Alibaba" },
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

export const recommendedIds = (spec: ProviderSpec) => new Set(spec.models.filter((m) => m.recommended).map((m) => m.id));
