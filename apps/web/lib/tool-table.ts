// A tool's result read as a table (ARCH §9.2): the rows of a query, a list, a report — whatever an MCP server answers
// in JSON. The full table stays on the server for the widgets (`show_chart`, `show_table` with `from`); the model is
// told a summary of a big one (`summaryOf`), so thousands of rows do not fill its window and it never retypes them.

export type Cell = string | number | null;

/** `number` — all its values are numbers; `date` — all ISO dates; anything else is `text`. */
export type ColumnKind = "number" | "date" | "text";

export interface SourceColumn {
  name: string;
  kind: ColumnKind;
}

export interface SourceTable {
  columns: SourceColumn[];
  rows: Cell[][];
}

type Json = unknown;

const isObject = (value: Json): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parse = (text: string): Json => {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return null;
  }
};

/** The JSON a result says: its `structuredContent`, else its first text that parses, else the value itself. */
const jsonOf = (output: Json): Json => {
  if (typeof output === "string") {
    return parse(output);
  }
  if (!isObject(output)) {
    return output;
  }
  if (output.isError === true) {
    return null;
  }
  if (
    output.structuredContent !== undefined &&
    output.structuredContent !== null
  ) {
    return output.structuredContent;
  }
  if (Array.isArray(output.content)) {
    for (const part of output.content as Json[]) {
      if (
        isObject(part) &&
        part.type === "text" &&
        typeof part.text === "string"
      ) {
        const found = parse(part.text);
        if (typeof found === "object" && found !== null) {
          return found;
        }
      }
    }
    return null;
  }
  return output;
};

interface Records {
  /** The column names as the source wrote them, when it listed them. */
  columns?: Json[];
  rows: Json[];
}

/** The records in a value: a `{ columns, rows }`, a list of objects, or the biggest of either inside an object. */
const recordsIn = (value: Json, depth = 0): Records | null => {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isObject) ? { rows: value } : null;
  }
  if (!isObject(value) || value.ok === false) {
    return null;
  }
  if (Array.isArray(value.columns) && Array.isArray(value.rows)) {
    return { columns: value.columns as Json[], rows: value.rows as Json[] };
  }
  if (depth >= 2) {
    return null;
  }
  let best: Records | null = null;
  for (const inner of Object.values(value)) {
    const found = recordsIn(inner, depth + 1);
    if (found && found.rows.length > (best?.rows.length ?? 0)) {
      best = found;
    }
  }
  return best;
};

/** A 1C column is written «Товар: СправочникСсылка.Номенклатура | Null»: the name is what stands before the types. */
const nameOf = (raw: Json): string => {
  const text = isObject(raw)
    ? String(raw.name ?? raw.title ?? raw.label ?? "")
    : String(raw);
  const typed = /^(?<name>.+?):\s.*\|/u.exec(text);
  return (typed?.groups?.name ?? text).trim();
};

const cellOf = (value: Json): Cell => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  // A reference (1C): the name the user knows it by; anything else as it is written.
  if (isObject(value) && typeof value.presentation === "string") {
    return value.presentation;
  }
  return JSON.stringify(value);
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/u;

const kindOf = (cells: Cell[]): ColumnKind => {
  const filled = cells.filter((c) => c !== null);
  if (filled.length === 0) {
    return "text";
  }
  if (filled.every((c) => typeof c === "number")) {
    return "number";
  }
  if (filled.every((c) => typeof c === "string" && ISO_DATE.test(c))) {
    return "date";
  }
  return "text";
};

/** The most columns read: a result wider than this is not a table a person looks at. */
const MAX_COLUMNS = 60;
/** How many records tell the names of the columns when the source did not list them. */
const NAMING_ROWS = 50;

/** A tool's output as a table; null when it is not one (an error, a single object, text). */
export const tableOf = (output: Json): SourceTable | null => {
  const found = recordsIn(jsonOf(output));
  if (!found || found.rows.length === 0) {
    return null;
  }
  const raw: Json[] = found.columns ?? [
    ...new Set(
      found.rows
        .slice(0, NAMING_ROWS)
        .flatMap((row) => (isObject(row) ? Object.keys(row) : []))
    ),
  ];
  if (raw.length === 0 || raw.length > MAX_COLUMNS) {
    return null;
  }
  const names = raw.map(nameOf);
  const rows = found.rows.map((row) =>
    names.map((name, i) => {
      if (Array.isArray(row)) {
        return cellOf(row[i]);
      }
      if (!isObject(row)) {
        return null;
      }
      return cellOf(row[name] ?? row[String(raw[i])]);
    })
  );
  return {
    columns: names.map((name, i) => ({
      kind: kindOf(rows.map((r) => r[i] ?? null)),
      name,
    })),
    rows,
  };
};

/** The column a name points at: exactly, else without case and edge spaces; undefined when there is none. */
export const columnOf = (table: SourceTable, name: string | undefined) => {
  if (name === undefined) {
    return -1;
  }
  const exact = table.columns.findIndex((c) => c.name === name);
  if (exact !== -1) {
    return exact;
  }
  const loose = name.trim().toLowerCase();
  return table.columns.findIndex((c) => c.name.trim().toLowerCase() === loose);
};

/** A number as people read it: no float noise, no exponent. */
const shown = (n: number) => String(Math.round(n * 100) / 100);

/** What a long cell says to the model: its start. */
const CELL_CHARS = 60;
const short = (cell: Cell) => {
  const text = cell === null ? "" : String(cell);
  return text.length > CELL_CHARS ? `${text.slice(0, CELL_CHARS - 1)}…` : text;
};

/** A table shorter than this, or lighter than `WHOLE_CHARS` serialized, goes to the model whole. */
export const PREVIEW_ROWS = 25;
const WHOLE_CHARS = 8000;

/** A table the model should be told whole: small enough, or with no numbers to chart (a list of cases to choose from). */
export const isSmall = (table: SourceTable) =>
  table.rows.length <= PREVIEW_ROWS ||
  !table.columns.some((c) => c.kind === "number") ||
  JSON.stringify(table.rows).length <= WHOLE_CHARS;

const columnLine = (table: SourceTable, index: number) => {
  const column = table.columns[index];
  if (!column) {
    return "";
  }
  const values = table.rows.map((r) => r[index] ?? null);
  if (column.kind === "number") {
    const nums = values.filter((v) => typeof v === "number");
    const sum = nums.reduce((a, b) => a + b, 0);
    return `${column.name} (number; sum ${shown(sum)}, min ${shown(Math.min(...nums))}, max ${shown(Math.max(...nums))})`;
  }
  if (column.kind === "date") {
    const dates = values.filter((v) => typeof v === "string");
    // toSorted is past the ES2022 target; `filter` gave a fresh array.
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
    dates.sort();
    return `${column.name} (date; ${dates[0]} … ${dates.at(-1)})`;
  }
  return `${column.name} (text)`;
};

/**
 * What the model is told of a big table instead of the table: its columns with their totals, the first rows and how
 * to put the rest on screen. The same table always gives the same words, so the prompt's cache holds. Null for a
 * table small enough to go whole (`isSmall`).
 */
export const summaryOf = (table: SourceTable, ref: string): string | null => {
  if (isSmall(table)) {
    return null;
  }
  const head = table.columns.map((c) => c.name).join(" | ");
  const first = table.rows
    .slice(0, PREVIEW_ROWS)
    .map((row) => row.map(short).join(" | "));
  return [
    `A table of ${table.rows.length} rows, ref ${ref}. It is too long to list: the full data is kept, you see its columns and the first ${PREVIEW_ROWS} rows.`,
    `Columns: ${table.columns.map((_, i) => columnLine(table, i)).join("; ")}.`,
    `First ${PREVIEW_ROWS} rows:`,
    head,
    ...first,
    `To show it to the user, call show_chart or show_table with from.ref "${ref}" and column names exactly as above — the server takes the numbers from the table, so do not retype rows. To read more of it yourself, ask the tool for less (a narrower query, a limit).`,
  ].join("\n");
};
