// P10 · «Расходы»: demo rows in the shape `model_runs` grouped by day, person, model and purpose would return —
// requests, errors, tokens (input, output, cache read), cost in the model's currency or none (a model without a
// price: local servers). Models are the dev base's own (titles, sources, prices); Alice AI in rubles is here to show
// two currencies side by side. People are made up — the prototype's team. Deterministic: the same page every load.

export type Currency = "USD" | "RUB";
export type Purpose = "chat" | "title" | "describe";

export interface Model {
  id: string;
  title: string;
  source: string;
  /** Per 1M tokens; none — the model has no price (cost unknown, not zero). */
  price: { input: number; output: number; cacheRead: number; currency: Currency } | null;
}

export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface Row {
  day: string;
  user: string | null;
  model: string;
  purpose: Purpose;
  requests: number;
  errors: number;
  input: number;
  output: number;
  cacheRead: number;
  cost: number | null;
  currency: Currency | null;
  /** Time to the first token, the day's average for the row, ms (`model_runs.latency_ms`). */
  latency: number;
}

export const MODELS: Model[] = [
  { id: "deepseek", price: { cacheRead: 0.02, currency: "USD", input: 0.076, output: 0.153 }, source: "vercel", title: "DeepSeek V4 Flash 0731" },
  { id: "haiku", price: { cacheRead: 0.1, currency: "USD", input: 1, output: 5 }, source: "vercel", title: "Claude Haiku 4.5" },
  { id: "codex", price: { cacheRead: 0.175, currency: "USD", input: 1.75, output: 14 }, source: "vercel", title: "GPT 5.2 Codex" },
  { id: "oss20", price: { cacheRead: 0.03, currency: "USD", input: 0.03, output: 0.14 }, source: "vercel", title: "GPT OSS 20B" },
  { id: "alice", price: { cacheRead: 100, currency: "RUB", input: 400, output: 400 }, source: "Яндекс", title: "Alice AI" },
  { id: "gemma", price: null, source: "llama.cpp", title: "gemma4-26b" },
  { id: "qwen", price: null, source: "llama.cpp", title: "qwen3-8b" },
  { id: "oss120", price: null, source: "ollama", title: "gpt-oss:120b" },
];

export const ME = "artem";

export const PEOPLE: Person[] = [
  { email: "artem@company.ru", id: ME, name: "Артём Маврин" },
  { email: "anna@company.ru", id: "anna", name: "Анна Смирнова" },
  { email: "dmitry@company.ru", id: "dmitry", name: "Дмитрий Козлов" },
  { email: "elena@company.ru", id: "elena", name: "Елена Попова" },
  { email: "igor@company.ru", id: "igor", name: "Игорь Новиков" },
  { email: "olga@company.ru", id: "olga", name: "Ольга Морозова" },
  { email: "pavel@company.ru", id: "pavel", name: "Павел Волков" },
  { email: "svetlana@company.ru", id: "svetlana", name: "Светлана Лебедева" },
];

export const PURPOSES: Record<Purpose, string> = {
  chat: "Ответы в чате",
  describe: "Зрение",
  title: "Названия чатов",
};

/** «Сегодня» of the prototype: the month is in progress. */
export const TODAY = "2026-10-29";

// Who uses what, and how much: requests on a working day, and the weight of each model in them.
const HABITS: Record<string, { level: number; models: Partial<Record<string, number>> }> = {
  anna: { level: 26, models: { alice: 3, deepseek: 4, haiku: 2 } },
  artem: { level: 34, models: { codex: 2, deepseek: 3, gemma: 3, haiku: 1, qwen: 2 } },
  dmitry: { level: 41, models: { codex: 2, deepseek: 3, haiku: 2, oss120: 2 } },
  elena: { level: 9, models: { alice: 5, deepseek: 1 } },
  igor: { level: 17, models: { gemma: 3, haiku: 3, oss20: 2 } },
  olga: { level: 22, models: { alice: 2, deepseek: 3, haiku: 3 } },
  pavel: { level: 5, models: { deepseek: 1, qwen: 2 } },
  svetlana: { level: 13, models: { deepseek: 2, haiku: 1, oss20: 3 } },
};

// Tokens of one request, by model: the bigger the model, the longer the answers people ask of it.
const SHAPE: Record<string, { input: number; output: number; cached: number }> = {
  alice: { cached: 0.6, input: 5200, output: 700 },
  codex: { cached: 0.5, input: 10_000, output: 1100 },
  deepseek: { cached: 0.55, input: 7000, output: 900 },
  gemma: { cached: 0.7, input: 6000, output: 800 },
  haiku: { cached: 0.6, input: 8000, output: 1000 },
  oss120: { cached: 0.5, input: 9000, output: 1200 },
  oss20: { cached: 0.4, input: 4000, output: 600 },
  qwen: { cached: 0.7, input: 3000, output: 500 },
};

// Time to the first token by model, ms: the cloud's big models wait longer, a local small one answers at once.
const TTFT: Record<string, number> = { alice: 1100, codex: 1900, deepseek: 850, gemma: 650, haiku: 700, oss120: 1500, oss20: 420, qwen: 280 };

const mulberry = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); dayKey(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(dayKey(d));
  return out;
};

const costOf = (model: Model, input: number, output: number, cacheRead: number) =>
  model.price ? (input * model.price.input + output * model.price.output + cacheRead * model.price.cacheRead) / 1_000_000 : null;

const build = () => {
  const rand = mulberry(42);
  const rows: Row[] = [];
  const days = daysBetween("2026-08-01", TODAY);
  days.forEach((day, i) => {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    // The team grows into it: October is busier than August.
    const growth = 0.75 + (i / days.length) * 0.5;
    for (const [user, habit] of Object.entries(HABITS)) {
      if (weekend && rand() > 0.25) continue;
      if (rand() < 0.08) continue; // a day off
      const total = Math.round(habit.level * growth * (weekend ? 0.3 : 1) * (0.5 + rand()));
      const weights = Object.entries(habit.models) as [string, number][];
      const sum = weights.reduce((s, [, w]) => s + w, 0);
      for (const [modelId, w] of weights) {
        const model = MODELS.find((m) => m.id === modelId) as Model;
        const requests = Math.round((total * w) / sum);
        if (requests === 0) continue;
        const shape = SHAPE[modelId] as (typeof SHAPE)[string];
        const all = requests * shape.input * (0.6 + rand() * 0.8);
        const cacheRead = Math.round(all * shape.cached);
        const input = Math.round(all - cacheRead);
        const output = Math.round(requests * shape.output * (0.6 + rand() * 0.8));
        rows.push({
          cacheRead,
          cost: costOf(model, input, output, cacheRead),
          currency: model.price?.currency ?? null,
          day,
          errors: rand() < 0.15 ? 1 : 0,
          input,
          latency: Math.round((TTFT[modelId] ?? 800) * (0.7 + rand() * 0.7)),
          model: modelId,
          output,
          purpose: "chat",
          requests,
          user,
        });
      }
      // Titles of new chats: about one in six messages starts a chat; done by DeepSeek (the «Названия» slot).
      const titles = Math.round(total / 6);
      if (titles > 0) {
        const model = MODELS[0] as Model;
        rows.push({ cacheRead: 0, cost: costOf(model, titles * 400, titles * 12, 0), currency: "USD", day, errors: 0, input: titles * 400, latency: 600, model: model.id, output: titles * 12, purpose: "title", requests: titles, user });
      }
      // Pictures read for a model without vision: Haiku in the «Зрение» slot, now and then.
      if (rand() < 0.12) {
        const model = MODELS[1] as Model;
        const n = 1 + Math.round(rand() * 2);
        rows.push({ cacheRead: 0, cost: costOf(model, n * 1600, n * 350, 0), currency: "USD", day, errors: 0, input: n * 1600, latency: 900, model: model.id, output: n * 350, purpose: "describe", requests: n, user });
      }
    }
    // Someone who has left: their runs stay, with no person (SET NULL).
    if (day < "2026-09-10" && !weekend) {
      const model = MODELS[1] as Model;
      const n = 6 + Math.round(rand() * 6);
      rows.push({ cacheRead: n * 3000, cost: costOf(model, n * 2500, n * 900, n * 3000), currency: "USD", day, errors: 0, input: n * 2500, latency: 750, model: model.id, output: n * 900, purpose: "chat", requests: n, user: null });
    }
  });
  return rows;
};

export const ROWS = build();
