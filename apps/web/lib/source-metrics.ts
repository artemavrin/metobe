import {
  METRIC_MAX_POINTS,
  METRIC_MAX_SERIES,
  OUTLIERS_MAX_VALUES,
  PARETO_LISTED,
} from "@metobe/contracts/metrics";
import type {
  MetricAggregate,
  MetricItem,
  MetricResult,
  MetricsInput,
  MetricsOutput,
} from "@metobe/contracts/metrics";

import { toNumber } from "./chart-data";
import { bucketOf, need } from "./source-widgets";
import { SourceError } from "./tool-sources";
import type { Cell, SourceTable } from "./tool-table";

// The figures of `show_metrics` computed from the full result of a tool call (ARCH §9.2): the model names the
// column and the way to read it, this reads it. What the result cannot give is a `SourceError` that lists the
// columns — the model reads it and asks again.

/** Money adds up to long float tails; six places are more than a figure shows and less than the noise. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

const medianOf = (sorted: number[]) => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
};

const numbersIn = (rows: Cell[][], index: number) =>
  rows.flatMap((r) => {
    const n = toNumber(r[index] ?? null);
    return n === null ? [] : [n];
  });

/** One figure out of rows: null when there is nothing to read (no numbers in them). */
const combine = (
  rows: Cell[][],
  index: number,
  aggregate: MetricAggregate
): number | null => {
  if (aggregate === "count") {
    return index === -1
      ? rows.length
      : rows.filter((r) => r[index] !== null && r[index] !== undefined).length;
  }
  if (aggregate === "distinct") {
    return new Set(
      rows.flatMap((r) =>
        r[index] === null || r[index] === undefined ? [] : [r[index]]
      )
    ).size;
  }
  const values = numbersIn(rows, index);
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((a, b) => a + b, 0);
  switch (aggregate) {
    case "avg": {
      return clean(sum / values.length);
    }
    case "median": {
      // oxlint-disable-next-line unicorn/no-array-sort -- `values` is a fresh array
      return clean(medianOf(values.sort((a, b) => a - b)));
    }
    case "min": {
      return Math.min(...values);
    }
    case "max": {
      return Math.max(...values);
    }
    default: {
      return clean(sum);
    }
  }
};

/** The rows of the table cut into groups by a column, in the order the groups first appear. */
const groupsOf = (table: SourceTable, by: number) => {
  const groups = new Map<string, Cell[][]>();
  for (const row of table.rows) {
    const key = row[by];
    if (key === null || key === undefined || key === "") {
      continue;
    }
    const group = groups.get(String(key));
    if (group) {
      group.push(row);
    } else {
      groups.set(String(key), [row]);
    }
  }
  return groups;
};

const columns = (table: SourceTable) =>
  `Columns: ${table.columns.map((c) => c.name).join(", ")}.`;

/** The numeric column an item reads; for a plain count of rows, -1. */
const fieldOf = (
  table: SourceTable,
  item: MetricItem,
  i: number,
  aggregate: MetricAggregate
) => {
  if (aggregate === "count" && item.field === undefined) {
    return -1;
  }
  const index = need(table, item.field, `items[${i}].field`);
  const kind = table.columns[index]?.kind;
  if (aggregate !== "count" && aggregate !== "distinct" && kind !== "number") {
    throw new SourceError(
      `items[${i}].field: "${item.field}" is not a numeric column (it is ${kind}), so it cannot be ${aggregate}. Use aggregate count or distinct for it, or pick a numeric column. ${columns(table)}`
    );
  }
  return index;
};

const nothing = (i: number, item: MetricItem) =>
  new SourceError(
    `items[${i}]: there is nothing to read for "${item.label}" in this result (no numbers in "${item.field ?? item.by ?? ""}").`
  );

const parts = (item: MetricItem, aggregate?: MetricAggregate) => ({
  aggregate,
  by: item.by,
  field: item.field,
});

/** The date column an item cuts periods by. */
const datesOf = (table: SourceTable, item: MetricItem, i: number) => {
  const x = need(table, item.x, `items[${i}].x`);
  if (table.columns[x]?.kind !== "date") {
    throw new SourceError(
      `items[${i}].x: "${item.x}" is not a date column (it is ${table.columns[x]?.kind}); ${item.form} needs dates. ${columns(table)}`
    );
  }
  return x;
};

const trendOf = (
  item: MetricItem,
  i: number,
  table: SourceTable
): MetricResult => {
  const aggregate = item.aggregate ?? "sum";
  const field = fieldOf(table, item, i, aggregate);
  const x = datesOf(table, item, i);
  const bucket = item.bucket ?? "month";
  const buckets = new Map<string, Cell[][]>();
  for (const row of table.rows) {
    const raw = row[x];
    if (typeof raw !== "string") {
      continue;
    }
    const key = bucketOf(raw, bucket);
    const group = buckets.get(key);
    if (group) {
      group.push(row);
    } else {
      buckets.set(key, [row]);
    }
  }
  const series = [...buckets.entries()]
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([key, rows]) => {
      const value = combine(rows, field, aggregate);
      return value === null ? [] : [{ value, x: key }];
    });
  if (series.length > METRIC_MAX_SERIES) {
    throw new SourceError(
      `items[${i}]: ${series.length} ${bucket}s do not fit a history (at most ${METRIC_MAX_SERIES}); use a larger bucket.`
    );
  }
  const value = combine(table.rows, field, aggregate);
  if (value === null || series.length === 0) {
    throw nothing(i, item);
  }
  const last = series.at(-1);
  const before = series.at(-2);
  return {
    ...parts(item, aggregate),
    bucket,
    ...(last && before
      ? {
          delta: {
            change:
              before.value === 0
                ? null
                : clean(
                    ((last.value - before.value) / Math.abs(before.value)) * 100
                  ),
            current: last.value,
            from: before.x,
            good: item.good ?? "up",
            previous: before.value,
            to: last.x,
          },
        }
      : {}),
    form: "trend",
    label: item.label,
    series,
    unit: item.unit,
    value,
  };
};

const shareOf = (
  item: MetricItem,
  i: number,
  table: SourceTable
): MetricResult => {
  const by = need(table, item.by, `items[${i}].by`);
  const field = fieldOf(table, item, i, "sum");
  const totals = [...groupsOf(table, by).entries()]
    .flatMap(([name, rows]) => {
      const sum = combine(rows, field, "sum");
      return sum === null ? [] : [{ name, sum }];
    })
    // oxlint-disable-next-line unicorn/no-array-sort -- `flatMap` gave a fresh array
    .sort((a, b) => b.sum - a.sum);
  const top = totals.slice(0, item.top ?? 3);
  const whole = clean(totals.reduce((a, g) => a + g.sum, 0));
  if (totals.length === 0 || whole === 0) {
    throw nothing(i, item);
  }
  return {
    ...parts(item, "sum"),
    form: "share",
    label: item.label,
    names: top.map((g) => g.name),
    unit: item.unit,
    value: clean(top.reduce((a, g) => a + g.sum, 0)),
    whole,
  };
};

const rankingOf = (
  item: MetricItem,
  i: number,
  table: SourceTable
): MetricResult => {
  const by = need(table, item.by, `items[${i}].by`);
  const aggregate = item.aggregate ?? "sum";
  const field = fieldOf(table, item, i, aggregate);
  const ranked = [...groupsOf(table, by).entries()]
    .flatMap(([name, rows]) => {
      const value = combine(rows, field, aggregate);
      return value === null ? [] : [{ name, value }];
    })
    // oxlint-disable-next-line unicorn/no-array-sort -- `flatMap` gave a fresh array
    .sort((a, b) => b.value - a.value);
  if (ranked.length === 0) {
    throw nothing(i, item);
  }
  return {
    ...parts(item, aggregate),
    form: "ranking",
    items: ranked.slice(0, item.limit ?? 5),
    label: item.label,
    unit: item.unit,
    // The bars are shares of the whole only where the groups add up to it.
    whole:
      aggregate === "sum" || aggregate === "count"
        ? clean(ranked.reduce((a, g) => a + g.value, 0))
        : undefined,
  };
};

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Who grew most and who fell most: the last period against the one before, group by group. */
const moversOf = (
  item: MetricItem,
  i: number,
  table: SourceTable
): MetricResult => {
  const by = need(table, item.by, `items[${i}].by`);
  const aggregate = item.aggregate ?? "sum";
  const field = fieldOf(table, item, i, aggregate);
  const x = datesOf(table, item, i);
  const bucket = item.bucket ?? "month";
  const periods = [
    ...new Set(
      table.rows.flatMap((r) =>
        typeof r[x] === "string" ? [bucketOf(r[x], bucket)] : []
      )
    ),
  ];
  // oxlint-disable-next-line unicorn/no-array-sort -- `periods` is a fresh array
  periods.sort();
  const to = periods.at(-1);
  const from = periods.at(-2);
  if (to === undefined || from === undefined) {
    throw new SourceError(
      `items[${i}]: movers compare two ${bucket}s and this result has ${periods.length}. Use a smaller bucket, or another result.`
    );
  }
  const groups = new Map<string, { before: Cell[][]; after: Cell[][] }>();
  for (const row of table.rows) {
    const name = row[by];
    const at = typeof row[x] === "string" ? bucketOf(row[x], bucket) : null;
    if (
      name === null ||
      name === undefined ||
      name === "" ||
      (at !== to && at !== from)
    ) {
      continue;
    }
    const group = groups.get(String(name)) ?? { after: [], before: [] };
    group[at === to ? "after" : "before"].push(row);
    groups.set(String(name), group);
  }
  const all = [...groups.entries()]
    .map(([name, g]) => {
      const before = combine(g.before, field, aggregate) ?? 0;
      const after = combine(g.after, field, aggregate) ?? 0;
      return {
        after,
        before,
        change: clean(after - before),
        name,
        pct:
          before === 0
            ? null
            : clean(((after - before) / Math.abs(before)) * 100),
      };
    })
    .filter((m) => m.before !== 0 || m.after !== 0);
  if (all.length === 0) {
    throw nothing(i, item);
  }
  const limit = item.limit ?? 4;
  // oxlint-disable-next-line unicorn/no-array-sort -- `all` is a fresh array
  const ordered = [...all].sort((a, b) => b.change - a.change);
  const growers = ordered.filter((m) => m.change > 0).slice(0, limit);
  const fallers = ordered
    .filter((m) => m.change < 0)
    // oxlint-disable-next-line unicorn/no-array-sort -- `filter` gives a fresh array
    .sort((a, b) => a.change - b.change)
    .slice(0, limit);
  return {
    ...parts(item, aggregate),
    down: all.filter((m) => m.change < 0).length,
    form: "movers",
    good: item.good ?? "up",
    label: item.label,
    movers: [...growers, ...fallers],
    net: clean(all.reduce((a, m) => a + m.change, 0)),
    period: { from, to },
    unit: item.unit,
    up: all.filter((m) => m.change > 0).length,
  };
};

/** At most `METRIC_MAX_POINTS` of the values, evenly spaced from the first to the last. */
const thin = (xs: number[]) =>
  xs.length <= METRIC_MAX_POINTS
    ? xs
    : Array.from(
        { length: METRIC_MAX_POINTS },
        (_, k) =>
          xs[
            Math.round((k * (xs.length - 1)) / (METRIC_MAX_POINTS - 1))
          ] as number
      );

/** ABC analysis: groups by their total, biggest first, the cumulative share and the class of each (A — up to 80%, B — up to 95%). */
const paretoOf = (
  item: MetricItem,
  i: number,
  table: SourceTable
): MetricResult => {
  const by = need(table, item.by, `items[${i}].by`);
  const field = fieldOf(table, item, i, "sum");
  const ranked = [...groupsOf(table, by).entries()]
    .flatMap(([name, rows]) => {
      const value = combine(rows, field, "sum");
      return value !== null && value > 0 ? [{ name, value }] : [];
    })
    // oxlint-disable-next-line unicorn/no-array-sort -- `flatMap` gave a fresh array
    .sort((a, b) => b.value - a.value);
  const whole = ranked.reduce((a, g) => a + g.value, 0);
  if (ranked.length < 2) {
    throw nothing(i, item);
  }
  let acc = 0;
  const rows = ranked.map((g) => {
    const before = acc / whole;
    acc += g.value;
    let cls: "A" | "B" | "C" = "C";
    if (before < 0.8) {
      cls = "A";
    } else if (before < 0.95) {
      cls = "B";
    }
    return {
      cls,
      cum: round4(acc / whole),
      name: g.name,
      value: clean(g.value),
    };
  });
  return {
    ...parts(item, "sum"),
    classes: (["A", "B", "C"] as const).map((cls) => {
      const own = rows.filter((r) => r.cls === cls);
      return {
        cls,
        count: own.length,
        share: round4(own.reduce((a, r) => a + r.value, 0) / whole),
      };
    }),
    curve: thin(rows.map((r) => r.cum)),
    form: "pareto",
    groupCount: rows.length,
    label: item.label,
    n80: rows.findIndex((r) => r.cum >= 0.8 - 1e-9) + 1,
    pareto: rows.slice(0, PARETO_LISTED),
    unit: item.unit,
    whole: clean(whole),
  };
};

const quantile = (sorted: number[], q: number) => {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const next = sorted[lo + 1] ?? (sorted[lo] as number);
  return (sorted[lo] as number) + (at - lo) * (next - (sorted[lo] as number));
};

/** A cell of a row as text; none when the column is not asked for or the cell is empty. */
const cell = (row: Cell[], at: number) =>
  at === -1 || row[at] === null || row[at] === undefined
    ? undefined
    : String(row[at]);

/** The values far above the usual: past the third quartile by one and a half spreads of the middle half (Tukey's fence). */
const outliersOf = (
  item: MetricItem,
  i: number,
  table: SourceTable
): MetricResult => {
  const field = fieldOf(table, item, i, "sum");
  const name =
    item.by === undefined ? -1 : need(table, item.by, `items[${i}].by`);
  const date = item.x === undefined ? -1 : need(table, item.x, `items[${i}].x`);
  const read = table.rows.flatMap((row) => {
    const value = toNumber(row[field] ?? null);
    return value === null ? [] : [{ row, value }];
  });
  if (read.length < 8) {
    throw new SourceError(
      `items[${i}]: ${read.length} values are too few to tell outliers from the usual (at least 8).`
    );
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- `map` gives a fresh array
  const sorted = read.map((r) => r.value).sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const fence = q3 + 1.5 * (q3 - q1);
  const high = read
    .filter((r) => r.value > fence)
    // oxlint-disable-next-line unicorn/no-array-sort -- `filter` gives a fresh array
    .sort((a, b) => b.value - a.value);
  const usual = sorted.filter((v) => v <= fence);
  const room = Math.max(OUTLIERS_MAX_VALUES - Math.min(high.length, 100), 1);
  const sample =
    usual.length <= room
      ? usual
      : Array.from(
          { length: room },
          (_, k) =>
            usual[
              Math.round((k * (usual.length - 1)) / Math.max(room - 1, 1))
            ] as number
        );
  return {
    ...parts(item, "sum"),
    count: read.length,
    fence: clean(fence),
    form: "outliers",
    label: item.label,
    outlierCount: high.length,
    outliers: high.slice(0, item.limit ?? 5).map(({ row, value }) => ({
      date: cell(row, date)?.slice(0, 10),
      name: cell(row, name),
      value,
    })),
    quartiles: {
      max: sorted.at(-1) as number,
      median: clean(quantile(sorted, 0.5)),
      q1: clean(q1),
      q3: clean(q3),
    },
    unit: item.unit,
    values: [...sample, ...high.slice(0, 100).map((r) => r.value)],
  };
};

/** A whole as parts: the biggest groups by name and the rest together. */
const compositionOf = (
  item: MetricItem,
  i: number,
  table: SourceTable
): MetricResult => {
  const by = need(table, item.by, `items[${i}].by`);
  const field = fieldOf(table, item, i, "sum");
  const ranked = [...groupsOf(table, by).entries()]
    .flatMap(([name, rows]) => {
      const value = combine(rows, field, "sum");
      return value !== null && value > 0 ? [{ name, value }] : [];
    })
    // oxlint-disable-next-line unicorn/no-array-sort -- `flatMap` gave a fresh array
    .sort((a, b) => b.value - a.value);
  if (ranked.length < 2) {
    throw nothing(i, item);
  }
  const top = ranked.slice(0, item.top ?? 4);
  const rest = ranked.slice(top.length);
  return {
    ...parts(item, "sum"),
    form: "composition",
    label: item.label,
    parts: [
      ...top.map((g) => ({ name: g.name, value: clean(g.value) })),
      ...(rest.length > 0
        ? [
            {
              count: rest.length,
              name: "",
              rest: true,
              value: clean(rest.reduce((a, g) => a + g.value, 0)),
            },
          ]
        : []),
    ],
    unit: item.unit,
    whole: clean(ranked.reduce((a, g) => a + g.value, 0)),
  };
};

const rangeValues = (item: MetricItem, i: number, table: SourceTable) => {
  const field = fieldOf(table, item, i, "sum");
  const values = numbersIn(table.rows, field);
  if (values.length === 0) {
    throw nothing(i, item);
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- `numbersIn` gave a fresh array
  values.sort((a, b) => a - b);
  return {
    avg: clean(values.reduce((a, b) => a + b, 0) / values.length),
    max: values.at(-1) as number,
    median: clean(medianOf(values)),
    min: values[0] as number,
    rows: values.length,
    sum: clean(values.reduce((a, b) => a + b, 0)),
  };
};

const resolveItem = (
  item: MetricItem,
  i: number,
  table: SourceTable
): MetricResult => {
  switch (item.form) {
    case "trend": {
      return trendOf(item, i, table);
    }
    case "share": {
      return shareOf(item, i, table);
    }
    case "ranking": {
      return rankingOf(item, i, table);
    }
    case "movers": {
      return moversOf(item, i, table);
    }
    case "pareto": {
      return paretoOf(item, i, table);
    }
    case "outliers": {
      return outliersOf(item, i, table);
    }
    case "composition": {
      return compositionOf(item, i, table);
    }
    case "range": {
      const { min, median, avg, max } = rangeValues(item, i, table);
      return {
        ...parts(item),
        form: "range",
        label: item.label,
        range: { avg, max, median, min },
        unit: item.unit,
      };
    }
    case "summary": {
      const s = rangeValues(item, i, table);
      return {
        ...parts(item),
        facts: [
          { fact: "rows", value: s.rows },
          { fact: "sum", value: s.sum },
          { fact: "avg", value: s.avg },
          { fact: "median", value: s.median },
          { fact: "min", value: s.min },
          { fact: "max", value: s.max },
        ],
        form: "summary",
        label: item.label,
        unit: item.unit,
      };
    }
    default: {
      // value and goal read one figure; a goal needs the user's target.
      const aggregate = item.aggregate ?? "sum";
      const field = fieldOf(table, item, i, aggregate);
      if (item.form === "goal" && item.target === undefined) {
        throw new SourceError(
          `items[${i}]: a goal needs \`target\` — the goal as the user stated it. If they gave none, use form value instead.`
        );
      }
      const value = combine(table.rows, field, aggregate);
      if (value === null) {
        throw nothing(i, item);
      }
      return {
        ...parts(item, aggregate),
        form: item.form,
        label: item.label,
        ...(item.form === "goal" ? { target: item.target } : {}),
        unit: item.unit,
        value,
      };
    }
  }
};

/** The figures of a metrics widget from a table: each item read the way it says, or a `SourceError`. */
export const metricsFrom = (
  input: MetricsInput,
  table: SourceTable
): MetricsOutput => ({
  items: input.items.map((item, i) => resolveItem(item, i, table)),
  ...(table.partial ? { partial: true } : {}),
  rows: table.rows.length,
});
