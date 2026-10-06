import { compact, exactOf, percent, signed } from "./format";

// The metrics of an answer, computed the way the server will compute them (ARCH §9.2): from the rows of an earlier
// tool result, never from the model's memory of it. The table below stands for that result — a sales register as 1C
// answers it — and every form of the widget is a function of it: a sum or a count, a month against the month before,
// a goal from the user's own words, a share of the whole, a spread, a ranking. The names are made up.

export interface Row {
  date: string;
  client: string;
  revenue: number;
  cost: number;
  returned: boolean;
}

const CLIENTS = ["Альфа-Опт", "Берёзка", "ТД Сибирь", "Кафе «Север»", "Орион", "Полюс", "Меридиан", "Восход", "Гарант-Трейд", "Дельта", "Кедр", "Лотос"];

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 1 204 rows, January to September 2026: the register the metrics are read from. */
export const ROWS: Row[] = (() => {
  const rand = rng(20261006);
  const rows: Row[] = [];
  for (let m = 0; m < 9; m++) {
    const count = 118 + m * 4 + Math.floor(rand() * 10);
    for (let i = 0; i < count; i++) {
      // The big clients are met more often: the share of the top three is a real number here.
      const client = CLIENTS[Math.floor(Math.pow(rand(), 1.9) * CLIENTS.length)] as string;
      const revenue = Math.round((260_000 + Math.pow(rand(), 2.6) * 3_400_000) * (1 + m * 0.035 + Math.sin(m / 1.7) * 0.05));
      const day = 1 + Math.floor(rand() * 27);
      rows.push({
        client,
        cost: Math.round(revenue * (0.72 + rand() * 0.1)),
        date: `2026-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        // Fewer returns early in the year, a few more lately: the delta against the month before has a sign.
        returned: rand() < 0.02 + m * 0.0035,
        revenue,
      });
    }
  }
  return rows;
})();

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен"];
/** The delta is September against the month before. */
const VERSUS = "к августу";

const monthOf = (r: Row) => Number(r.date.slice(5, 7)) - 1;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const byMonth = <T,>(f: (rows: Row[]) => T) => MONTHS.map((_, m) => f(ROWS.filter((r) => monthOf(r) === m)));

export interface Delta {
  /** Signed: +12,4 (%) or −2,1 (п.п.). */
  value: number;
  unit: "%" | "п.п.";
  /** «к августу». */
  versus: string;
  /** Which way is good: more revenue is, more returns is not. */
  good: "up" | "down";
  /** The exact words for the tooltip. */
  detail: string;
}

interface Base {
  id: string;
  label: string;
  unit?: string;
  /** Where the number comes from, in words: shown on hover and under the widget. */
  source: string;
}

export type Metric = Base &
  (
    | { form: "value"; value: number }
    | { form: "delta"; value: number; delta: Delta }
    | { form: "trend"; value: number; delta: Delta; series: { label: string; value: number }[] }
    | { form: "goal"; value: number; target: number; targetNote: string }
    | { form: "share"; value: number; whole: number; partLabel: string }
    | { form: "range"; min: number; avg: number; median: number; max: number }
    | { form: "ranking"; items: { name: string; value: number }[]; whole: number }
    | { form: "summary"; rows: { label: string; value: string; exact?: string }[] }
  );

const last = <T,>(xs: T[], back = 0) => xs[xs.length - 1 - back] as T;

const relDelta = (cur: number, prev: number, unit: string | undefined, good: "up" | "down" = "up"): Delta => {
  const pct = prev === 0 ? 0 : ((cur - prev) / prev) * 100;
  const shown = (n: number) => `${compact(n).value}${compact(n).scale}${unit ? ` ${unit}` : ""}`;
  return { detail: `было ${shown(prev)}, стало ${shown(cur)}`, good, unit: "%", value: pct, versus: VERSUS };
};

const rateDelta = (cur: number, prev: number, good: "up" | "down"): Delta => ({
  detail: `было ${percent(prev)}, стало ${percent(cur)}`,
  good,
  unit: "п.п.",
  value: cur - prev,
  versus: VERSUS,
});

const revenueByMonth = byMonth((rs) => sum(rs.map((r) => r.revenue)));
const total = sum(revenueByMonth);
const rows = ROWS.length;
const rowsText = `${exactOf(rows)} строкам`;

const marginOf = (rs: Row[]) => (sum(rs.map((r) => r.revenue)) - sum(rs.map((r) => r.cost))) / sum(rs.map((r) => r.revenue)) * 100;
const marginByMonth = byMonth(marginOf);
const returnsByMonth = byMonth((rs) => (rs.filter((r) => r.returned).length / rs.length) * 100);

const perClient = CLIENTS.map((name) => ({ name, value: sum(ROWS.filter((r) => r.client === name).map((r) => r.revenue)) }))
  // oxlint-disable-next-line
  .sort((a, b) => b.value - a.value);
const top3 = sum(perClient.slice(0, 3).map((c) => c.value));

const sorted = [...ROWS.map((r) => r.revenue)].sort((a, b) => a - b);
const median = (sorted[Math.floor(sorted.length / 2)] as number);
const avg = total / rows;

const PLAN = 2_000_000_000;

export const METRICS: Record<string, Metric> = {
  revenue: {
    delta: relDelta(last(revenueByMonth), last(revenueByMonth, 1), "₽"),
    form: "trend",
    id: "revenue",
    label: "Выручка",
    series: revenueByMonth.map((value, m) => ({ label: MONTHS[m] as string, value })),
    source: `Сумма «Выручка» по ${rowsText}, по месяцам`,
    unit: "₽",
    value: total,
  },
  margin: {
    delta: rateDelta(last(marginByMonth), last(marginByMonth, 1), "up"),
    form: "trend",
    id: "margin",
    label: "Наценка",
    series: marginByMonth.map((value, m) => ({ label: MONTHS[m] as string, value })),
    source: `(Выручка − Себестоимость) / Выручка по ${rowsText}, по месяцам`,
    value: marginOf(ROWS),
    unit: "%",
  },
  docs: {
    delta: relDelta(byMonth((rs) => rs.length)[8] as number, byMonth((rs) => rs.length)[7] as number, undefined),
    form: "trend",
    id: "docs",
    label: "Накладных",
    series: byMonth((rs) => rs.length).map((value, m) => ({ label: MONTHS[m] as string, value })),
    source: `Число строк, по месяцам`,
    value: rows,
  },
  goal: {
    form: "goal",
    id: "goal",
    label: "План выручки",
    source: `Сумма «Выручка» против плана из вашего вопроса`,
    target: PLAN,
    targetNote: "план из вашего вопроса",
    unit: "₽",
    value: total,
  },
  top3: {
    form: "share",
    id: "top3",
    label: "Доля трёх крупнейших клиентов",
    partLabel: perClient.slice(0, 3).map((c) => c.name).join(", "),
    source: `Сумма «Выручка» трёх клиентов с наибольшей выручкой / вся выручка`,
    value: top3,
    whole: total,
  },
  returns: {
    delta: rateDelta(last(returnsByMonth), last(returnsByMonth, 1), "down"),
    form: "delta",
    id: "returns",
    label: "Возвраты",
    source: `Доля строк с признаком «Возврат» по ${rowsText}, сентябрь`,
    unit: "%",
    value: last(returnsByMonth),
  },
  check: {
    avg,
    form: "range",
    id: "check",
    label: "Накладная: разброс суммы",
    max: sorted[sorted.length - 1] as number,
    median,
    min: sorted[0] as number,
    source: `Минимум, медиана, среднее и максимум «Выручка» по ${rowsText}`,
    unit: "₽",
  },
  clients: {
    form: "ranking",
    id: "clients",
    items: perClient.slice(0, 5),
    label: "Клиенты по выручке",
    source: `Сумма «Выручка» по клиентам, пять первых`,
    unit: "₽",
    whole: total,
  },
  summary: {
    form: "summary",
    id: "summary",
    label: "Сводка по выручке",
    rows: [
      { label: "Строк", value: exactOf(rows) },
      { label: "Сумма", value: `${compact(total).value}${compact(total).scale}`, exact: exactOf(total) },
      { label: "Среднее", value: `${compact(avg).value}${compact(avg).scale}`, exact: exactOf(avg) },
      { label: "Медиана", value: `${compact(median).value}${compact(median).scale}`, exact: exactOf(median) },
      { label: "Клиентов", value: String(CLIENTS.length) },
    ],
    source: `Описательные величины по «Выручка», ${rowsText}`,
    unit: "₽",
  },
  clientsCount: {
    form: "value",
    id: "clientsCount",
    label: "Клиентов",
    source: `Число разных значений «Клиент»`,
    value: CLIENTS.length,
  },
};

export interface Scenario {
  id: string;
  name: string;
  question: string;
  title: string;
  metrics: Metric[];
  /** What the model says after the widget: it sums up, it does not repeat the numbers. */
  answer: string;
}

const M = METRICS as Record<string, Metric>;
const at = (...ids: string[]) => ids.map((id) => M[id] as Metric);

export const SCENARIOS: Scenario[] = [
  {
    answer: "Выручка за девять месяцев — около 85 % плана, а сентябрь на четверть выше августа. Наценка чуть просела (на полпункта), и больше половины выручки приходится на трёх клиентов — это риск.",
    id: "nine",
    metrics: at("revenue", "margin", "docs", "goal", "returns", "top3", "check", "clients", "summary"),
    name: "Девять",
    question: "Покажи ключевые показатели продаж за 2026 год, план — 2 млрд",
    title: "Продажи за 2026 год",
  },
  {
    answer: "Выручка растёт: сентябрь на 26 % выше августа, план закрыт примерно на 85 %. Наценка просела на полпункта, возвраты чуть снизились.",
    id: "four",
    metrics: at("revenue", "margin", "returns", "goal"),
    name: "Четыре",
    question: "Как идут продажи в этом году? План — 2 млрд",
    title: "Продажи за 2026 год",
  },
  {
    answer: "За девять месяцев выручка составила около 85 % плана.",
    id: "two",
    metrics: at("revenue", "goal"),
    name: "Два",
    question: "Сколько мы продали за год и что с планом в 2 млрд?",
    title: "Выручка и план",
  },
  {
    answer: "Выручка за девять месяцев 2026 года — 1,69 млрд ₽.",
    id: "one",
    metrics: at("revenue"),
    name: "Один",
    question: "Какая у нас выручка за год?",
    title: "Выручка за 2026 год",
  },
];

/** The widget's footer: where all of it comes from. */
export const FROM_NOTE = `Изменения — сентябрь к августу · из результата run_query, ${exactOf(rows)} строк`;
