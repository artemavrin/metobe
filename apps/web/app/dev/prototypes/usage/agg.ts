import { daysBetween, MODELS, PEOPLE, PURPOSES, TODAY } from "./data";
import type { Currency, Purpose, Row } from "./data";

// What the page computes from the rows: a period and the one before it (the same number of days, so a month in
// progress is compared fairly), totals, a series by day, a ranking with each entry's own days. In the product the
// same is a GROUP BY on `model_runs` — nothing here needs more than the rows give.

export type Metric = "cost" | "requests" | "tokens";
export type Group = "model" | "person" | "purpose";
export interface Filter {
  model?: string;
  person?: string | null;
  purpose?: Purpose;
}

export const MONTHS = ["2026-08", "2026-09", "2026-10"] as const;
export type Month = (typeof MONTHS)[number];

const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

/** A month's days up to today, and as many days of the month before: «1–29 октября» against «1–29 сентября». */
export const periodOf = (month: string) => {
  const end = lastDay(month) < TODAY ? lastDay(month) : TODAY;
  const days = daysBetween(`${month}-01`, end);
  const prevMonth = shift(month, -1);
  const prevEnd = `${prevMonth}-${String(Math.min(days.length, Number(lastDay(prevMonth).slice(8)))).padStart(2, "0")}`;
  return { days, from: days[0] as string, partial: end !== lastDay(month), prev: { from: `${prevMonth}-01`, month: prevMonth, to: prevEnd }, to: end };
};

export const within = (rows: Row[], from: string, to: string) => rows.filter((r) => r.day >= from && r.day <= to);

export const matches = (r: Row, f: Filter) =>
  (f.model === undefined || r.model === f.model) && (f.person === undefined || r.user === f.person) && (f.purpose === undefined || r.purpose === f.purpose);

export const valueOf = (r: Row, metric: Metric, currency: Currency) => {
  if (metric === "requests") return r.requests;
  if (metric === "tokens") return r.input + r.output + r.cacheRead;
  return r.currency === currency && r.cost !== null ? r.cost : 0;
};

export const keyOf = (r: Row, group: Group) => (group === "model" ? r.model : group === "person" ? (r.user ?? "—") : r.purpose);

export const labelOf = (group: Group, key: string) => {
  if (group === "model") return MODELS.find((m) => m.id === key)?.title ?? "Удалённая модель";
  if (group === "person") return PEOPLE.find((p) => p.id === key)?.name ?? "Без пользователя";
  return PURPOSES[key as Purpose] ?? key;
};

export const noteOf = (group: Group, key: string) => {
  if (group === "model") return MODELS.find((m) => m.id === key)?.source ?? "";
  if (group === "person") return PEOPLE.find((p) => p.id === key)?.email ?? "удалён, история осталась";
  return "";
};

export interface Totals {
  cost: Map<Currency, number>;
  requests: number;
  errors: number;
  input: number;
  output: number;
  cacheRead: number;
  /** Requests to models without a price: their cost is unknown. */
  unpriced: number;
  people: Set<string>;
}

export const totalsOf = (rows: Row[]): Totals => {
  const t: Totals = { cacheRead: 0, cost: new Map(), errors: 0, input: 0, output: 0, people: new Set(), requests: 0, unpriced: 0 };
  for (const r of rows) {
    t.requests += r.requests;
    t.errors += r.errors;
    t.input += r.input;
    t.output += r.output;
    t.cacheRead += r.cacheRead;
    if (r.user) t.people.add(r.user);
    if (r.cost === null || r.currency === null) t.unpriced += r.requests;
    else t.cost.set(r.currency, (t.cost.get(r.currency) ?? 0) + r.cost);
  }
  return t;
};

/** Currencies present, the one with more requests first: amounts in two currencies say nothing of which is bigger. */
export const currenciesOf = (rows: Row[]) => {
  const n = new Map<Currency, number>();
  for (const r of rows) if (r.currency && r.cost !== null) n.set(r.currency, (n.get(r.currency) ?? 0) + r.requests);
  return [...n].sort((a, b) => b[1] - a[1]).map(([c]) => c);
};

/** Days into weeks (means): a long period's sparkline without the weekend's teeth; a short one keeps its days. */
export const weekly = (values: number[]) => {
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 7) out.push(values.slice(i, i + 7).reduce((s, v) => s + v, 0) / Math.min(7, values.length - i));
  return out;
};

/** A running total: where the month is by each day. */
export const running = (values: number[]) => {
  let sum = 0;
  return values.map((v) => (sum += v));
};

/** A value per day. */
export const daily = (rows: Row[], days: string[], metric: Metric, currency: Currency) => {
  const by = new Map(days.map((d) => [d, 0]));
  for (const r of rows) by.set(r.day, (by.get(r.day) ?? 0) + valueOf(r, metric, currency));
  return days.map((d) => by.get(d) ?? 0);
};

export interface Ranked {
  key: string;
  value: number;
  prev: number;
  share: number;
  spark: number[];
}

/** Entries by their value in the period, each with the period before and its days. */
export const rank = (rows: Row[], prevRows: Row[], days: string[], group: Group, metric: Metric, currency: Currency): Ranked[] => {
  const now = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r, group);
    now.set(k, [...(now.get(k) ?? []), r]);
  }
  const before = new Map<string, number>();
  for (const r of prevRows) before.set(keyOf(r, group), (before.get(keyOf(r, group)) ?? 0) + valueOf(r, metric, currency));
  const total = rows.reduce((s, r) => s + valueOf(r, metric, currency), 0);
  return [...now]
    .map(([key, list]) => {
      const value = list.reduce((s, r) => s + valueOf(r, metric, currency), 0);
      return { key, prev: before.get(key) ?? 0, share: total ? value / total : 0, spark: days.length > 14 ? weekly(daily(list, days, metric, currency)) : daily(list, days, metric, currency), value };
    })
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
};

/** The top entries keep their own series; the rest is «Прочее». Colors follow the ranking. */
export const stackOf = (rows: Row[], days: string[], group: Group, metric: Metric, currency: Currency, top = 5) => {
  const ranked = rank(rows, [], days, group, metric, currency);
  const keys = ranked.slice(0, top).map((e) => e.key);
  const rest = ranked.length > top;
  const data = days.map((day) => {
    const point: Record<string, number | string> = { day };
    for (const k of keys) point[k] = 0;
    if (rest) point.other = 0;
    return point;
  });
  const index = new Map(days.map((d, i) => [d, i]));
  for (const r of rows) {
    const p = data[index.get(r.day) ?? -1];
    if (!p) continue;
    const k = keyOf(r, group);
    const slot = keys.includes(k) ? k : "other";
    if (slot === "other" && !rest) continue;
    p[slot] = (p[slot] as number) + valueOf(r, metric, currency);
  }
  return { data, keys, rest };
};
