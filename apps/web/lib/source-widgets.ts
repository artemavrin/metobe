import { CHART_MAX_POINTS } from "@metobe/contracts/chart";
import type { ChartInput, ChartOutput } from "@metobe/contracts/chart";
import type { SourceBucket } from "@metobe/contracts/source";
import { TABLE_MAX_ROWS } from "@metobe/contracts/table";
import type { TableInput, TableOutput } from "@metobe/contracts/table";

import { toNumber } from "./chart-data";
import { SourceError } from "./tool-sources";
import { columnOf } from "./tool-table";
import type { Cell, SourceTable } from "./tool-table";

// A chart's points and a table's rows taken from a tool's full result (ARCH §9.2): the model names the columns and
// how to combine them, this reads the numbers. Whatever the model asks that the result cannot give is a `SourceError`
// that says what there is — the model reads it and asks again.

const columnsList = (table: SourceTable) =>
  `Columns: ${table.columns.map((c) => c.name).join(", ")}.`;

/** The column called `name`, or an error that lists the ones there are. */
export const need = (
  table: SourceTable,
  name: string | undefined,
  what: string
) => {
  const index = columnOf(table, name);
  if (index === -1) {
    throw new SourceError(
      `${what}: there is no column "${name ?? ""}" in the result. ${columnsList(table)}`
    );
  }
  return index;
};

const DAY_MS = 86_400_000;

/** A date cell cut to its day, week (the Monday), month or year, as an ISO date. */
export const bucketOf = (date: string, bucket: SourceBucket | undefined) => {
  const day = date.slice(0, 10);
  switch (bucket) {
    case "year": {
      return `${day.slice(0, 4)}-01-01`;
    }
    case "month": {
      return `${day.slice(0, 7)}-01`;
    }
    case "week": {
      const at = new Date(`${day}T00:00:00Z`);
      const back = (at.getUTCDay() + 6) % 7;
      return new Date(at.getTime() - back * DAY_MS).toISOString().slice(0, 10);
    }
    default: {
      return day;
    }
  }
};

/** Money adds up to long float tails; six places are more than a chart shows and less than the noise. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

type Aggregate = NonNullable<NonNullable<ChartInput["from"]>["aggregate"]>;

const combine = (values: number[], aggregate: Aggregate): number | null => {
  if (aggregate === "count") {
    return values.length;
  }
  if (values.length === 0) {
    return null;
  }
  switch (aggregate) {
    case "avg": {
      return clean(values.reduce((a, b) => a + b, 0) / values.length);
    }
    case "max": {
      return Math.max(...values);
    }
    case "min": {
      return Math.min(...values);
    }
    default: {
      return clean(values.reduce((a, b) => a + b, 0));
    }
  }
};

/** The points of a chart from a table: rows grouped by the x column, each series' field combined per group. */
export const pointsFrom = (
  input: ChartInput,
  table: SourceTable
): NonNullable<ChartOutput["data"]> => {
  const { from } = input;
  if (!from) {
    return [];
  }
  const aggregate = from.aggregate ?? "sum";
  const xIndex = need(table, from.x, "from.x");
  const xKind = table.columns[xIndex]?.kind;
  if (from.bucket && xKind !== "date") {
    throw new SourceError(
      `from.bucket needs a date column, and "${from.x}" is not one (it is ${xKind}). ${columnsList(table)}`
    );
  }
  const fields = input.series.map((s, i) => {
    if (aggregate === "count") {
      return -1;
    }
    const index = need(table, s.field, `series[${i}].field`);
    if (table.columns[index]?.kind !== "number") {
      throw new SourceError(
        `series[${i}].field: "${s.field}" is not a numeric column (it is ${table.columns[index]?.kind}); a series needs numbers.`
      );
    }
    return index;
  });
  // Rows by their point, in the order the points first appear.
  const groups = new Map<string, { x: Cell; rows: Cell[][] }>();
  for (const row of table.rows) {
    const raw = row[xIndex];
    if (raw === null || raw === undefined || raw === "") {
      continue;
    }
    const x = xKind === "date" ? bucketOf(String(raw), from.bucket) : raw;
    const key = String(x);
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(key, { rows: [row], x });
    }
  }
  const points = [...groups.values()].map(({ x, rows }) => [
    x,
    ...fields.map((f) =>
      combine(
        f === -1
          ? rows.map(() => 1)
          : rows.flatMap((r) => {
              const n = toNumber(r[f] ?? null);
              return n === null ? [] : [n];
            }),
        aggregate
      )
    ),
  ]);
  const order = from.sort ?? (xKind === "date" ? "x" : undefined);
  if (order) {
    const desc = order.startsWith("-");
    const byX = order.endsWith("x");
    const rank = (p: Cell[]) => (byX ? p[0] : p[1]) ?? null;
    // toSorted is past the ES2022 target; `points` is a fresh array.
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
    points.sort((a, b) => {
      const [left, right] = [rank(a), rank(b)];
      if (left === right) {
        return 0;
      }
      // A gap goes last whichever way it runs.
      if (left === null || right === null) {
        return left === null ? 1 : -1;
      }
      const order2 = left < right ? -1 : 1;
      return desc ? -order2 : order2;
    });
  }
  const kept = from.limit ? points.slice(0, from.limit) : points;
  if (kept.length > CHART_MAX_POINTS) {
    throw new SourceError(
      `${kept.length} points do not fit a chart (at most ${CHART_MAX_POINTS}). Narrow it: set from.limit with from.sort for a top list, or from.bucket to cut dates into months, or chart a column with fewer different values.`
    );
  }
  return kept;
};

/** The rows of a table from a table: its columns' fields, sorted and cut; `total` is how many the result had. */
export const rowsFrom = (
  input: TableInput,
  table: SourceTable
): { rows: Cell[][]; total: number } => {
  const { from } = input;
  const indexes = input.columns.map((c, i) =>
    need(table, c.field ?? c.label, `columns[${i}].field`)
  );
  let { rows } = table;
  if (from?.sort) {
    const by = need(table, from.sort.field, "from.sort.field");
    const sign = from.sort.desc ? -1 : 1;
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
    rows = [...rows].sort((a, b) => {
      const [left, right] = [a[by] ?? null, b[by] ?? null];
      if (left === right) {
        return 0;
      }
      if (left === null || right === null) {
        return left === null ? 1 : -1;
      }
      return (left < right ? -1 : 1) * sign;
    });
  }
  const kept = rows.slice(
    0,
    Math.min(from?.limit ?? TABLE_MAX_ROWS, TABLE_MAX_ROWS)
  );
  return {
    rows: kept.map((row) =>
      indexes.map((i, c) => {
        const cell = row[i] ?? null;
        // A column the model calls a number holds numbers, even where the source wrote them as text.
        if (input.columns[c]?.type === "number" && typeof cell === "string") {
          return toNumber(cell);
        }
        return cell;
      })
    ),
    total: table.rows.length,
  };
};

/** What the chart tool answers: the points taken, or just their count for points the model wrote. */
export const chartOutput = (
  input: ChartInput,
  table: SourceTable | null
): ChartOutput => {
  if (!input.from || !table) {
    return { points: input.points?.length ?? 0 };
  }
  const data = pointsFrom(input, table);
  return {
    data,
    points: data.length,
    ...(table.partial ? { partial: true } : {}),
  };
};

/** What the table tool answers: the rows taken, or just their count for rows the model wrote. */
export const tableOutput = (
  input: TableInput,
  table: SourceTable | null
): TableOutput => {
  if (!input.from || !table) {
    return { rows: input.rows?.length ?? 0 };
  }
  const { rows, total } = rowsFrom(input, table);
  return {
    data: rows,
    rows: rows.length,
    total,
    ...(table.partial ? { partial: true } : {}),
  };
};

/** The figures a model wrote into a chart by hand: every point's numbers, the x value left out. */
export const writtenPoints = (input: ChartInput) =>
  (input.points ?? []).flatMap((p) =>
    p.slice(1).filter((v): v is number => typeof v === "number")
  );

/** The figures a model wrote into a table by hand. */
export const writtenRows = (input: TableInput) =>
  (input.rows ?? []).flatMap((r) =>
    r.filter((v): v is number => typeof v === "number")
  );

/** The model retyped a tool's numbers: it is told which result they are and to ask for them by `from`. */
export const copyError = (ref: string) =>
  new SourceError(
    `These numbers are the ones of the tool result "${ref}". Do not retype them: call again with \`from: { ref: "${ref}" }\` and \`field\` for each series or column — the server reads them from the result, so they stay exact.`
  );
