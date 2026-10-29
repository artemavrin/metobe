import type { Currency } from "@metobe/contracts/models";
import type { UsageBucket } from "@metobe/core/usage";

// What «Расходы» computes from the buckets the server grouped: totals, a series by bucket, a ranking with each
// entry's own series, the stacked chart's top five and «Прочее». Money is one currency at a time: rubles and dollars
// are never added.

export type Metric = "cost" | "requests" | "tokens";
export type Group = "model" | "person" | "purpose";
/** What the page is narrowed to. A deleted model or person is `—`. */
export type Filter = Partial<Record<Group, string>>;

/** A deleted model or person: their runs stay. */
export const GONE = "—";

export const keyOf = (b: UsageBucket, group: Group) => {
  if (group === "model") {
    return b.modelId ?? GONE;
  }
  return group === "person" ? (b.userId ?? GONE) : b.purpose;
};

export const matches = (b: UsageBucket, f: Filter) =>
  (Object.keys(f) as Group[]).every((g) => keyOf(b, g) === f[g]);

export const valueOf = (b: UsageBucket, metric: Metric, currency: Currency) => {
  if (metric === "requests") {
    return b.requests;
  }
  if (metric === "tokens") {
    return b.input + b.output + b.cacheRead;
  }
  return b.currency === currency && b.cost !== null ? b.cost : 0;
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

export const totalsOf = (rows: UsageBucket[]): Totals => {
  const t: Totals = {
    cacheRead: 0,
    cost: new Map(),
    errors: 0,
    input: 0,
    output: 0,
    people: new Set(),
    requests: 0,
    unpriced: 0,
  };
  for (const b of rows) {
    t.requests += b.requests;
    t.errors += b.errors;
    t.input += b.input;
    t.output += b.output;
    t.cacheRead += b.cacheRead;
    t.unpriced += b.unpriced;
    if (b.userId) {
      t.people.add(b.userId);
    }
    if (b.cost !== null && b.currency) {
      t.cost.set(b.currency, (t.cost.get(b.currency) ?? 0) + b.cost);
    }
  }
  return t;
};

/** Currencies present, the one with more requests first: two amounts say nothing of which is bigger. */
export const currenciesOf = (rows: UsageBucket[]) => {
  const n = new Map<Currency, number>();
  for (const b of rows) {
    if (b.currency && b.cost !== null) {
      n.set(b.currency, (n.get(b.currency) ?? 0) + b.requests - b.unpriced);
    }
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array; toSorted is past the ES2022 target
  return [...n].sort((a, b) => b[1] - a[1]).map(([c]) => c);
};

/** Days into weeks (means): a long period's sparkline without the weekend's teeth. */
export const weekly = (values: number[]) => {
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 7) {
    const week = values.slice(i, i + 7);
    out.push(week.reduce((s, v) => s + v, 0) / week.length);
  }
  return out;
};

/** A value per bucket. */
export const series = (
  rows: UsageBucket[],
  buckets: string[],
  metric: Metric,
  currency: Currency
) => {
  const by = new Map(buckets.map((d) => [d, 0]));
  for (const b of rows) {
    by.set(b.at, (by.get(b.at) ?? 0) + valueOf(b, metric, currency));
  }
  return buckets.map((d) => by.get(d) ?? 0);
};

export interface Ranked {
  key: string;
  value: number;
  prev: number;
  share: number;
  spark: number[];
}

/** Entries by their value in the period, each with the period before and its own series. */
export const rank = (
  rows: UsageBucket[],
  prevRows: UsageBucket[],
  buckets: string[],
  group: Group,
  metric: Metric,
  currency: Currency
): Ranked[] => {
  const now = new Map<string, UsageBucket[]>();
  for (const b of rows) {
    const k = keyOf(b, group);
    const list = now.get(k) ?? [];
    list.push(b);
    now.set(k, list);
  }
  const before = new Map<string, number>();
  for (const b of prevRows) {
    const k = keyOf(b, group);
    before.set(k, (before.get(k) ?? 0) + valueOf(b, metric, currency));
  }
  const total = rows.reduce((s, b) => s + valueOf(b, metric, currency), 0);
  return (
    [...now]
      .map(([key, list]) => {
        const value = list.reduce(
          (s, b) => s + valueOf(b, metric, currency),
          0
        );
        const days = series(list, buckets, metric, currency);
        return {
          key,
          prev: before.get(key) ?? 0,
          share: total ? value / total : 0,
          // A long run of days by weeks; a day's hours stay hours.
          spark:
            buckets.length > 14 && !buckets[0]?.includes("T")
              ? weekly(days)
              : days,
          value,
        };
      })
      .filter((e) => e.value > 0)
      // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array; toSorted is past the ES2022 target
      .sort((a, b) => b.value - a.value)
  );
};

export const OTHER = "other";

/** The top entries keep their own series; the rest is «Прочее». Colors follow the ranking. */
export const stackOf = (
  rows: UsageBucket[],
  buckets: string[],
  group: Group,
  metric: Metric,
  currency: Currency,
  top = 5
) => {
  const ranked = rank(rows, [], buckets, group, metric, currency);
  const keys = ranked.slice(0, top).map((e) => e.key);
  const rest = ranked.length > top;
  const slots = [...keys, ...(rest ? [OTHER] : [])];
  const sums = buckets.map(() => new Map(slots.map((k) => [k, 0])));
  const index = new Map(buckets.map((d, i) => [d, i]));
  for (const b of rows) {
    const at = sums[index.get(b.at) ?? -1];
    const k = keyOf(b, group);
    const slot = keys.includes(k) ? k : OTHER;
    if (at?.has(slot)) {
      at.set(slot, (at.get(slot) ?? 0) + valueOf(b, metric, currency));
    }
  }
  const data = buckets.map((at, i) => ({
    at,
    ...Object.fromEntries(sums[i] ?? []),
  }));
  return { data, keys, rest };
};
