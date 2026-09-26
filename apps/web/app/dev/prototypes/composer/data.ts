// Composer prototype data (P2, P3). Models carry only what our API really returns: maker, source, context,
// capabilities (null — the source did not say), prices, release date. Nothing is «recommended»; the admin's
// default model and the user's recent ones are real signals. Prices and dates are illustrative.

export type Caps = { tools: boolean | null; vision: boolean | null; reasoning: boolean | null };

export type ChatModel = {
  id: string;
  title: string;
  /** Maker slug for BrandLogo, and its name. */
  maker: string;
  makerTitle: string;
  /** The source the model comes through: the admin connected it, the user may not care. */
  source: string;
  context: number | null;
  caps: Caps;
  /** Per 1M tokens. */
  price: { input: number; output: number; cacheRead?: number; currency: "USD" | "RUB" } | null;
  released: string | null;
};

const c = (tools: boolean | null, vision: boolean | null, reasoning: boolean | null): Caps => ({ reasoning, tools, vision });

export const MODELS: ChatModel[] = [
  {
    caps: c(true, true, true),
    context: 400_000,
    id: "gpt-5.2",
    maker: "openai",
    makerTitle: "OpenAI",
    price: { cacheRead: 0.18, currency: "USD", input: 1.75, output: 14 },
    released: "2026-08-12",
    source: "Vercel AI Gateway",
    title: "GPT-5.2",
  },
  {
    caps: c(true, true, true),
    context: 400_000,
    id: "gpt-5.2-mini",
    maker: "openai",
    makerTitle: "OpenAI",
    price: { cacheRead: 0.03, currency: "USD", input: 0.25, output: 2 },
    released: "2026-08-12",
    source: "Vercel AI Gateway",
    title: "GPT-5.2 mini",
  },
  {
    caps: c(true, true, true),
    context: 1_000_000,
    id: "claude-sonnet-4.6",
    maker: "anthropic",
    makerTitle: "Anthropic",
    price: { cacheRead: 0.3, currency: "USD", input: 3, output: 15 },
    released: "2026-07-29",
    source: "Vercel AI Gateway",
    title: "Claude Sonnet 4.6",
  },
  {
    caps: c(true, true, true),
    context: 200_000,
    id: "claude-haiku-4.5",
    maker: "anthropic",
    makerTitle: "Anthropic",
    price: { cacheRead: 0.1, currency: "USD", input: 1, output: 5 },
    released: "2025-10-15",
    source: "Vercel AI Gateway",
    title: "Claude Haiku 4.5",
  },
  {
    caps: c(true, true, true),
    context: 1_048_576,
    id: "gemini-3-pro",
    maker: "google",
    makerTitle: "Google",
    price: { cacheRead: 0.2, currency: "USD", input: 2, output: 12 },
    released: "2026-06-18",
    source: "Vercel AI Gateway",
    title: "Gemini 3 Pro",
  },
  {
    caps: c(true, false, true),
    context: 163_840,
    id: "deepseek-v3.2",
    maker: "deepseek",
    makerTitle: "DeepSeek",
    price: { cacheRead: 0.03, currency: "USD", input: 0.28, output: 0.42 },
    released: "2026-04-02",
    source: "Vercel AI Gateway",
    title: "DeepSeek V3.2",
  },
  {
    caps: c(true, null, false),
    context: 32_768,
    id: "aliceai-llm",
    maker: "yandex",
    makerTitle: "Яндекс",
    price: { cacheRead: 500, currency: "RUB", input: 500, output: 1200 },
    released: "2026-03-20",
    source: "Yandex AI Studio",
    title: "Alice AI LLM",
  },
  {
    caps: c(true, false, true),
    context: 262_144,
    id: "qwen3-235b",
    maker: "alibaba",
    makerTitle: "Alibaba",
    price: { currency: "RUB", input: 500, output: 500 },
    released: "2025-07-21",
    source: "Yandex AI Studio",
    title: "Qwen3 235B",
  },
  {
    caps: c(true, false, true),
    context: 131_072,
    id: "gpt-oss-120b",
    maker: "openai",
    makerTitle: "OpenAI",
    price: { currency: "RUB", input: 300, output: 300 },
    released: "2025-08-05",
    source: "Yandex AI Studio",
    title: "gpt-oss-120b",
  },
  {
    caps: c(null, true, null),
    context: 131_072,
    id: "gemma4-26b",
    maker: "google",
    makerTitle: "Google",
    price: null,
    released: null,
    source: "llama.cpp",
    title: "gemma4-26b",
  },
];

/** The admin's default for new chats. */
export const DEFAULT_MODEL = "gpt-5.2-mini";
/** What this user ran lately, newest first (from model_runs). */
export const RECENT = ["claude-sonnet-4.6", "gpt-5.2-mini", "aliceai-llm"];

export const modelById = (id: string) => MODELS.find((m) => m.id === id) as ChatModel;

export type Effort = "off" | "normal" | "deep";
export const EFFORTS: { id: Effort; label: string; hint: string }[] = [
  { hint: "Отвечает сразу", id: "off", label: "Без размышлений" },
  { hint: "Думает, когда нужно", id: "normal", label: "Обычно" },
  { hint: "Дольше и дороже, точнее на сложном", id: "deep", label: "Глубоко" },
];

/** MCP connections this user has; `@` brings one into the message. */
export const CONNECTIONS = [
  { hint: "Репозитории, issues, PR", id: "github", logo: "github", title: "GitHub" },
  { hint: "Входящие и отправка писем", id: "mail", logo: "mail", title: "Почта" },
  { hint: "Задачи и спринты", id: "jira", logo: "jira", title: "Jira" },
  { hint: "Файлы команды", id: "drive", logo: "drive", title: "Диск" },
];
export type Connection = (typeof CONNECTIONS)[number];

/** Skills available to this user; `/` picks one. */
export const SKILLS = [
  { hint: "Найдёт ошибки и предложит правки", id: "review", title: "Ревью кода" },
  { hint: "Вежливо, коротко, по делу", id: "letter", title: "Письмо клиенту" },
  { hint: "Решения, задачи, сроки", id: "minutes", title: "Протокол встречи" },
  { hint: "С сохранением терминов", id: "translate", title: "Перевод" },
];
export type Skill = (typeof SKILLS)[number];

/** D8: intent instead of a model; the admin maps each mode to a model and its settings. */
export const MODES = [
  { effort: "off" as Effort, firstToken: "~1 с", hint: "Короткие вопросы, черновики", id: "fast", model: "gpt-5.2-mini", title: "Быстро" },
  { effort: "normal" as Effort, firstToken: "~3 с", hint: "Большинство задач", id: "normal", model: "claude-sonnet-4.6", title: "Обычно" },
  { effort: "deep" as Effort, firstToken: "~15 с", hint: "Анализ, код, длинные документы", id: "deep", model: "gpt-5.2", title: "Глубоко" },
];
/** `firstToken` — how long the mode's model usually takes to start, from model_runs (here illustrative). */
export type Mode = (typeof MODES)[number];

export const fmtContext = (n: number | null) => {
  if (!n) {
    return null;
  }
  return n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`;
};

export const fmtPrice = (m: ChatModel) => {
  if (!m.price) {
    return null;
  }
  const s = m.price.currency === "USD" ? "$" : "₽";
  return `${s}${m.price.input} / ${s}${m.price.output}`;
};

// --- round 4: what model_runs tells about each model, and a long list to test scale -----------------

/** From model_runs (illustrative): typical time to the first token, and this user's own use of the model. */
export type ModelUsage = { firstTokenMs: number | null; chats: number; lastUsedDays: number | null };

export const USAGE: Record<string, ModelUsage> = {
  "aliceai-llm": { chats: 9, firstTokenMs: 900, lastUsedDays: 2 },
  "claude-haiku-4.5": { chats: 3, firstTokenMs: 450, lastUsedDays: 12 },
  "claude-sonnet-4.6": { chats: 41, firstTokenMs: 1400, lastUsedDays: 0 },
  "deepseek-v3.2": { chats: 0, firstTokenMs: 1900, lastUsedDays: null },
  "gemini-3-pro": { chats: 6, firstTokenMs: 2100, lastUsedDays: 5 },
  "gemma4-26b": { chats: 0, firstTokenMs: 380, lastUsedDays: null },
  "gpt-5.2": { chats: 14, firstTokenMs: 3200, lastUsedDays: 1 },
  "gpt-5.2-mini": { chats: 27, firstTokenMs: 700, lastUsedDays: 0 },
  "gpt-oss-120b": { chats: 2, firstTokenMs: 1100, lastUsedDays: 20 },
  "qwen3-235b": { chats: 0, firstTokenMs: 1700, lastUsedDays: null },
};
export const usageOf = (id: string): ModelUsage => USAGE[id] ?? { chats: 0, firstTokenMs: null, lastUsedDays: null };

/** A Gateway-sized list (~60 more), to see the palette with a long tail. Names follow real families. */
const TAIL: [string, string, string, number, Caps][] = [
  ["mistral", "Mistral", "Mistral Large 3", 262_144, c(true, true, false)],
  ["mistral", "Mistral", "Mistral Medium 3.2", 131_072, c(true, true, false)],
  ["mistral", "Mistral", "Codestral 2", 262_144, c(true, false, false)],
  ["mistral", "Mistral", "Magistral Medium", 131_072, c(true, false, true)],
  ["xai", "xAI", "Grok 4", 256_000, c(true, true, true)],
  ["xai", "xAI", "Grok 4 Fast", 2_000_000, c(true, true, true)],
  ["xai", "xAI", "Grok Code Fast 1", 256_000, c(true, false, true)],
  ["meta", "Meta", "Llama 4 Maverick", 1_000_000, c(true, true, false)],
  ["meta", "Meta", "Llama 4 Scout", 10_000_000, c(true, true, false)],
  ["meta", "Meta", "Llama 3.3 70B", 131_072, c(true, false, false)],
  ["moonshot", "Moonshot", "Kimi K2.5", 262_144, c(true, true, true)],
  ["moonshot", "Moonshot", "Kimi K2 Thinking", 262_144, c(true, false, true)],
  ["zai", "Z.ai", "GLM-5", 202_752, c(true, false, true)],
  ["zai", "Z.ai", "GLM-4.7", 202_752, c(true, false, true)],
  ["zai", "Z.ai", "GLM-4.6V", 131_072, c(true, true, true)],
  ["minimax", "MiniMax", "MiniMax M2.5", 204_800, c(true, false, true)],
  ["alibaba", "Alibaba", "Qwen3.6 Plus", 1_000_000, c(true, true, true)],
  ["alibaba", "Alibaba", "Qwen3 Coder 480B", 262_144, c(true, false, false)],
  ["alibaba", "Alibaba", "Qwen3 VL 235B", 262_144, c(true, true, true)],
  ["deepseek", "DeepSeek", "DeepSeek R1", 163_840, c(true, false, true)],
  ["google", "Google", "Gemini 3 Flash", 1_048_576, c(true, true, true)],
  ["google", "Google", "Gemini 2.5 Flash Lite", 1_048_576, c(true, true, true)],
  ["openai", "OpenAI", "GPT-5.2 nano", 400_000, c(true, true, true)],
  ["openai", "OpenAI", "o4-mini", 200_000, c(true, true, true)],
  ["openai", "OpenAI", "GPT-4.1", 1_047_576, c(true, true, false)],
  ["anthropic", "Anthropic", "Claude Opus 4.6", 1_000_000, c(true, true, true)],
  ["cohere", "Cohere", "Command A", 256_000, c(true, false, false)],
  ["perplexity", "Perplexity", "Sonar Pro", 200_000, c(false, true, false)],
  ["nvidia", "NVIDIA", "Nemotron 3 Super", 262_144, c(true, false, true)],
  ["amazon", "Amazon", "Nova Pro", 300_000, c(true, true, false)],
];

export const LONG_TAIL: ChatModel[] = TAIL.map(([maker, makerTitle, title, context, caps], i) => ({
  caps,
  context,
  id: `tail-${i}`,
  maker: maker === "amazon" ? "nova" : maker,
  makerTitle,
  price: { currency: "USD", input: +(0.2 + ((i * 37) % 30) / 10).toFixed(2), output: +(0.8 + ((i * 53) % 120) / 10).toFixed(2) },
  released: i % 5 === 0 ? "2026-08-01" : "2025-11-10",
  source: "Vercel AI Gateway",
  title,
}));

/** Everything in chat for the round-4 palette: the ten above plus the tail. */
export const ALL_MODELS: ChatModel[] = [...MODELS, ...LONG_TAIL];
export const anyModel = (id: string) => ALL_MODELS.find((m) => m.id === id) as ChatModel;
