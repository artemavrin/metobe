import type {
  TableCell,
  TableColumnType,
  TableHeat,
  TableInput,
  TableSummary,
} from "@metobe/contracts/table";
import { isFilterRule } from "@metobe/ui/components/reui/filters/filters-query";
import type {
  FilterNode,
  FilterRule,
} from "@metobe/ui/components/reui/filters/filters-types";

import type { TablePart } from "@/lib/answer-work";

export interface TableColumn {
  /** `c0`, `c1`… — the row's cell index, as the grid and the filters name it. */
  id: string;
  label: string;
  type: TableColumnType;
  /** What a group's row shows in this column; none — nothing. */
  summary?: TableSummary;
  /** How the column's cells are tinted; none — plain. */
  heat?: TableHeat;
}

export interface TableRow {
  id: string;
  cells: TableCell[];
}

export interface TableView {
  title: string;
  /** Empty until the model has written them all: a header that grows column by column would jump. */
  columns: TableColumn[];
  rows: TableRow[];
  /** The ids of the columns the rows are grouped by, outer first; none — a flat table. */
  groups: string[];
  /** The model is still writing it. */
  streaming: boolean;
}

// The input while it streams is a partial parse: any field may be missing or cut off.
interface PartialInput {
  title?: string;
  columns?: (
    | { label?: string; type?: string; summary?: string; heat?: string }
    | undefined
  )[];
  groupBy?: (string | undefined)[];
  rows?: (TableCell[] | undefined)[];
}

const TYPES = new Set<string>(["text", "number", "date", "category"]);
const SUMMARIES = new Set<string>(["sum", "avg", "min", "max"]);
const HEATS = new Set<string>(["scale", "good", "bad"]);

/**
 * What of a table the grid can show now. While the model writes, only whole things: the columns once it has moved
 * on to the rows, and every row but the last — the last may be cut mid-value. When it is done, all of it.
 */
export const tableView = (part: TablePart): TableView => {
  const streaming = part.state === "input-streaming";
  const input = (part.input ?? {}) as PartialInput | TableInput;
  const partial = input as PartialInput;
  const columnsDone = !streaming || partial.rows !== undefined;
  const columns: TableColumn[] = columnsDone
    ? (partial.columns ?? []).flatMap((c, i) =>
        c?.label === undefined
          ? []
          : [
              {
                id: `c${i}`,
                label: c.label,
                type: (TYPES.has(c.type ?? "")
                  ? c.type
                  : "text") as TableColumnType,
                // A total means something for numbers only.
                ...(c.type === "number" && SUMMARIES.has(c.summary ?? "")
                  ? { summary: c.summary as TableSummary }
                  : {}),
                ...(c.type === "number" && HEATS.has(c.heat ?? "")
                  ? { heat: c.heat as TableHeat }
                  : {}),
              },
            ]
      )
    : [];
  const written = partial.rows ?? [];
  const whole = streaming ? written.slice(0, -1) : written;
  const rows = columns.length
    ? whole.map((cells, i) => ({
        cells: columns.map((_, c) => cells?.[c] ?? null),
        id: `r${i}`,
      }))
    : [];
  // Only the labels the columns have: a name the model got wrong groups nothing, and a table is better flat than empty.
  const groups = columns.length
    ? (partial.groupBy ?? []).flatMap((label) => {
        const found = columns.find((c) => c.label === label);
        return found ? [found.id] : [];
      })
    : [];
  return { columns, groups, rows, streaming, title: partial.title ?? "" };
};

/** The values a category column holds, most frequent first — the filter's options. */
export const categoryValues = (rows: TableRow[], index: number) => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = row.cells[index];
    if (v !== null && v !== "") {
      counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
    }
  }
  // toSorted is past the ES2022 target; the spread is a fresh array.
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
};

/** A category's values in the order they first come: a value keeps its place (and its colour) as rows arrive. */
export const firstSeen = (rows: TableRow[], index: number) => {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = row.cells[index];
    if (v !== null && v !== "") {
      seen.add(String(v));
    }
  }
  return [...seen];
};

const empty = (v: TableCell) => v === null || v === "";

const lower = (v: unknown) => String(v ?? "").toLowerCase();

/** One rule against one row, over the whole operator catalog the filters offer (after ReUI's c-filters-7). */
const matchesRule = (row: TableRow, rule: FilterRule): boolean => {
  const actual = row.cells[Number(rule.path[0]?.slice(1))] ?? null;
  const { value } = rule;
  const range = (value as number[] | undefined) ?? [];
  const tests: Record<string, () => boolean> = {
    between: () =>
      !empty(actual) &&
      Number(actual) >= Number(range[0]) &&
      Number(actual) <= Number(range[1]),
    contains: () => lower(actual).includes(lower(value)),
    empty: () => empty(actual),
    ends_with: () => lower(actual).endsWith(lower(value)),
    eq: () => !empty(actual) && Number(actual) === Number(value),
    gt: () => !empty(actual) && Number(actual) > Number(value),
    gte: () => !empty(actual) && Number(actual) >= Number(value),
    is: () => lower(actual) === lower(value),
    is_any_of: () => (value as string[]).includes(String(actual)),
    is_none_of: () => !(value as string[]).includes(String(actual)),
    is_not: () => lower(actual) !== lower(value),
    lt: () => !empty(actual) && Number(actual) < Number(value),
    lte: () => !empty(actual) && Number(actual) <= Number(value),
    neq: () => empty(actual) || Number(actual) !== Number(value),
    not_between: () =>
      empty(actual) ||
      Number(actual) < Number(range[0]) ||
      Number(actual) > Number(range[1]),
    not_contains: () => !lower(actual).includes(lower(value)),
    not_empty: () => !empty(actual),
    starts_with: () => lower(actual).startsWith(lower(value)),
  };
  const result = tests[rule.operator]?.() ?? true;
  return rule.negated ? !result : result;
};

/** A rule with nothing to test yet matches everything: the grid does not empty out while a value is being chosen. */
const incomplete = (rule: FilterRule) =>
  rule.operator !== "empty" &&
  rule.operator !== "not_empty" &&
  (rule.value === undefined ||
    rule.value === "" ||
    (Array.isArray(rule.value) &&
      (rule.value.length === 0 ||
        rule.value.some((v) => v === undefined || v === ""))));

/** The filters' query tree as a row predicate. */
export const matchesQuery = (row: TableRow, node: FilterNode): boolean => {
  if (isFilterRule(node)) {
    return incomplete(node) || matchesRule(row, node);
  }
  if (node.rules.length === 0) {
    return true;
  }
  return node.combinator === "and"
    ? node.rules.every((child) => matchesQuery(row, child))
    : node.rules.some((child) => matchesQuery(row, child));
};

/** The numbers among a column's values: what a total and a tint are made of. */
export const numbersOf = (rows: TableRow[], index: number) =>
  rows.flatMap((r) => {
    const v = r.cells[index];
    if (v === null || v === undefined || v === "") {
      return [];
    }
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? [n] : [];
  });

/** A group's or the table's figure for a column; none when there is no number to sum up. */
export const summarize = (values: number[], kind: TableSummary) => {
  if (values.length === 0) {
    return;
  }
  switch (kind) {
    case "sum": {
      return values.reduce((a, b) => a + b, 0);
    }
    case "avg": {
      return values.reduce((a, b) => a + b, 0) / values.length;
    }
    case "min": {
      return Math.min(...values);
    }
    default: {
      return Math.max(...values);
    }
  }
};
