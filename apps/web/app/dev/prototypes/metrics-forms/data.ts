import { ROWS } from "../metrics/data";

// More forms for the strip of key figures, each computed from the rows of a tool result like the first seven: who
// grew and who fell, a Pareto / ABC split, the outliers, a funnel, a composition. The sales register is the one of the
// first prototype (`../metrics/data`); the funnel has a table of its own — a CRM's deals, each with the last stage it
// reached.

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const monthOf = (d: string) => Number(d.slice(5, 7)) - 1;

const CLIENTS = [...new Set(ROWS.map((r) => r.client))];
const byClient = (m: number, name: string) => sum(ROWS.filter((r) => r.client === name && monthOf(r.date) === m).map((r) => r.revenue));

// ── Кто вырос и упал: September against August, by client ────────────────────────────────────────────────────────
export interface Mover {
  name: string;
  before: number;
  after: number;
  change: number;
  /** None when the month before was empty: a percent of nothing. */
  pct: number | null;
}

export const MOVERS: Mover[] = CLIENTS.map((name) => {
  const before = byClient(7, name);
  const after = byClient(8, name);
  return { after, before, change: after - before, name, pct: before === 0 ? null : ((after - before) / before) * 100 };
})
  // oxlint-disable-next-line
  .sort((a, b) => b.change - a.change);

// ── Парето / ABC ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface Ranked {
  name: string;
  value: number;
  /** Cumulative share of the whole, 0..1, with this one included. */
  cum: number;
  cls: "A" | "B" | "C";
}

const totals = CLIENTS.map((name) => ({ name, value: sum(ROWS.filter((r) => r.client === name).map((r) => r.revenue)) }))
  // oxlint-disable-next-line
  .sort((a, b) => b.value - a.value);
export const WHOLE = sum(totals.map((t) => t.value));

export const PARETO: Ranked[] = (() => {
  let acc = 0;
  return totals.map((t) => {
    const before = acc / WHOLE;
    acc += t.value;
    // A class takes clients until the 80% line is crossed — the one that crosses it included.
    const cls = before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
    return { ...t, cls, cum: acc / WHOLE };
  });
})();

// ── Выбросы: documents far above the usual (Tukey's fence) ───────────────────────────────────────────────────────
// The register of the first prototype has no big deals of its own, so seven are added here, made up for the look.
const EXTRA = [
  { client: "Альфа-Опт", date: "2026-03-12", revenue: 14_800_000 },
  { client: "ТД Сибирь", date: "2026-05-27", revenue: 11_200_000 },
  { client: "Восход", date: "2026-06-18", revenue: 9_600_000 },
  { client: "Орион", date: "2026-08-04", revenue: 8_900_000 },
  { client: "Альфа-Опт", date: "2026-09-09", revenue: 7_400_000 },
  { client: "Меридиан", date: "2026-09-22", revenue: 6_100_000 },
  { client: "Берёзка", date: "2026-02-16", revenue: 5_300_000 },
].map((r) => ({ ...r, cost: 0, returned: false }));
const ALL = [...ROWS, ...EXTRA];
const sorted = ALL.map((r) => r.revenue).sort((a, b) => a - b);
const quantile = (q: number) => {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  return (sorted[lo] as number) + ((at - lo) * ((sorted[lo + 1] ?? sorted[lo]) as number - (sorted[lo] as number)));
};
export const Q1 = quantile(0.25);
export const MEDIAN = quantile(0.5);
export const Q3 = quantile(0.75);
export const FENCE = Q3 + 1.5 * (Q3 - Q1);
export const OUTLIERS = ALL.filter((r) => r.revenue > FENCE)
  // oxlint-disable-next-line
  .sort((a, b) => b.revenue - a.revenue);
export const DOCS = ALL.length;
export const MAX = sorted.at(-1) as number;

/** All amounts for the strip plot, with a stable vertical scatter. */
export const DOTS = ALL.map((r, i) => ({ jitter: ((i * 2654435761) % 1000) / 1000, over: r.revenue > FENCE, value: r.revenue }));

// ── Состав: top four clients and the rest ────────────────────────────────────────────────────────────────────────
export const COMPOSITION: { name: string; value: number; rest?: boolean }[] = [
  ...totals.slice(0, 4),
  { name: `Остальные (${totals.length - 4})`, rest: true, value: sum(totals.slice(4).map((t) => t.value)) },
];

// ── Воронка: deals by the last stage they reached ────────────────────────────────────────────────────────────────
export const STAGES = ["Лид", "Квалификация", "Предложение", "Договор", "Оплата"];
const rand = (() => {
  let s = 1234567;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const DEALS = Array.from({ length: 840 }, () => {
  let reached = 0;
  const odds = [0.66, 0.55, 0.52, 0.76];
  while (reached < STAGES.length - 1 && rand() < (odds[reached] as number)) reached++;
  return reached;
});
/** A deal that reached stage k passed all the stages before it: the funnel's count at stage k. */
export const FUNNEL = STAGES.map((name, k) => ({ count: DEALS.filter((r) => r >= k).length, name }));
