import type { PickerModel } from "@/components/chat/picker/data";

// Моки P35 и P37 (ORGS-PLAN §5–§7). Цены и лимиты в репозиторий не пишутся: здесь только отношения тарифов
// (×1, ×2, ×4), проценты и время сброса. Организация и люди вымышленные; те же значения — у P36 и P38.

export type Tier = "base" | "pro" | "max";

export const TIERS: Record<Tier, { title: string; badge: "secondary" | "info-light" | "primary-light"; times: number; window: boolean }> = {
  base: { badge: "secondary", times: 1, title: "Обычный", window: true },
  max: { badge: "primary-light", times: 4, title: "Макс", window: false },
  pro: { badge: "info-light", times: 2, title: "Про", window: true },
};
export const TIER_ORDER: Tier[] = ["base", "pro", "max"];

/** Как показываются проценты: целые, вниз, но любой расход — не меньше 1 %. */
export const pct = (used: number) => (used <= 0 ? 0 : Math.max(1, Math.floor(used)));
export const tone = (p: number) => (p >= 100 ? "out" : p >= 80 ? "warn" : "ok");

// ── P35: состояние лимитов человека ──────────────────────────────────────────────────────────────────────────────────

export type State = "ok" | "warn5" | "warnweek" | "out5" | "outweek";

export interface Limits {
  /** null — у тарифа нет окна 5 часов (Макс). */
  five: { pct: number; reset: string | null } | null;
  week: { pct: number; reset: string };
}

/** Окно 5 часов не открыто — сброса нет, его откроет первый запрос. */
export const limitsFor = (state: State, tier: Tier): Limits => {
  const window = TIERS[tier].window;
  const week = { reset: "пн 00:00" };
  const five = (p: number, reset: string | null = "15:40") => (window ? { pct: p, reset } : null);
  switch (state) {
    case "warn5":
      return { five: five(84), week: { ...week, pct: window ? 41 : 84 } };
    case "warnweek":
      return { five: five(12), week: { ...week, pct: 88 } };
    case "out5":
      return { five: five(100), week: { ...week, pct: window ? 47 : 100 } };
    case "outweek":
      return { five: five(31), week: { ...week, pct: 100 } };
    default:
      return { five: five(23), week: { ...week, pct: 38 } };
  }
};

/** Какой лимит сейчас главный: исчерпанный, потом близкий к концу; при равных — неделя. */
export const headline = (l: Limits) => {
  const five = l.five ? { kind: "five" as const, ...l.five } : null;
  const week = { kind: "week" as const, ...l.week };
  if (week.pct >= 100) return week;
  if (five && five.pct >= 100) return five;
  if (week.pct >= 80) return week;
  if (five && five.pct >= 80) return five;
  return null;
};

export const limitName = (kind: "five" | "week") => (kind === "five" ? "5 часов" : "неделю");
export const resetWord = (reset: string | null) => (reset ? `сброс в ${reset}` : "окно откроет первый запрос");

/** «Использовано 84 % лимита на 5 часов, сброс в 15:40» / «Лимит на неделю исчерпан. Сброс в пн 00:00». */
export const warnText = (h: NonNullable<ReturnType<typeof headline>>) =>
  h.pct >= 100
    ? `Лимит на ${limitName(h.kind)} исчерпан. Сброс в ${h.reset}`
    : `Использовано ${h.pct} % лимита на ${limitName(h.kind)}, ${resetWord(h.reset)}`;

/** История по дням недели — в процентах недели (ORGS-PLAN §8), и число запросов. */
export const WEEK_DAYS: { day: string; pct: number; requests: number }[] = [
  { day: "пн", pct: 9, requests: 31 },
  { day: "вт", pct: 14, requests: 46 },
  { day: "ср", pct: 6, requests: 22 },
  { day: "чт", pct: 9, requests: 35 },
  { day: "пт", pct: 0, requests: 0 },
  { day: "сб", pct: 0, requests: 0 },
  { day: "вс", pct: 0, requests: 0 },
];

// ── Модели тарифа ────────────────────────────────────────────────────────────────────────────────────────────────────

const model = (id: string, title: string, maker: string, makerTitle: string, logo: string, extra: Partial<PickerModel> = {}): PickerModel => ({
  caps: { reasoning: true, tools: true, vision: true },
  context: 1_000_000,
  firstTokenMs: 900,
  id,
  local: false,
  logo,
  maker,
  makerTitle,
  price: null,
  released: "2026-06-01",
  source: "Gateway",
  title,
  ...extra,
});

/** Модели платформы и с какого тарифа они доступны; ×N — к основной модели тарифа «Обычный». */
const CATALOG: { m: PickerModel; from: Tier; times: number }[] = [
  { from: "base", m: model("flash", "Gemini Flash", "google", "Google", "google"), times: 1 },
  { from: "base", m: model("ds", "DeepSeek Chat", "deepseek", "DeepSeek", "deepseek", { caps: { reasoning: true, tools: true, vision: false }, context: 128_000 }), times: 0.5 },
  { from: "base", m: model("mini", "GPT mini", "openai", "OpenAI", "openai", { context: 400_000 }), times: 4 },
  { from: "pro", m: model("sonnet", "Claude Sonnet", "anthropic", "Anthropic", "anthropic"), times: 8 },
  { from: "pro", m: model("gpt", "GPT Sol", "openai", "OpenAI", "openai", { context: 400_000 }), times: 6 },
  { from: "pro", m: model("pro", "Gemini Pro", "google", "Google", "google"), times: 5 },
  { from: "max", m: model("opus", "Claude Opus", "anthropic", "Anthropic", "anthropic"), times: 14 },
];

/**
 * Модели человека с тарифом `tier`: ×N — к основной модели его тарифа (Про и Макс считают от неё же, лимит у них
 * больше в ×2 и ×4 — поэтому ×N у сильных моделей тот же). Старшие тарифы — серыми с подписью, если `up` = grey.
 */
export const modelsFor = (tier: Tier, up: "grey" | "hide"): PickerModel[] => {
  const rank = TIER_ORDER.indexOf(tier);
  return CATALOG.flatMap(({ m, from, times }) => {
    const mine = TIER_ORDER.indexOf(from) <= rank;
    if (!mine && up === "hide") return [];
    return [{ ...m, limit: mine ? { times } : { tier: TIERS[from].title, times } }];
  });
};
