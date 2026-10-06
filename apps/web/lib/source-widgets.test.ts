import type { ChartInput } from "@metobe/contracts/chart";
import type { TableInput } from "@metobe/contracts/table";
import { describe, expect, it } from "vitest";

import { salesQuery } from "./fixtures/query-result";
import {
  chartOutput,
  pointsFrom,
  rowsFrom,
  tableOutput,
} from "./source-widgets";
import { SourceError } from "./tool-sources";
import { tableOf } from "./tool-table";

const table = (n = 300) => {
  const found = tableOf(salesQuery(n));
  if (!found) {
    throw new Error("fixture is not a table");
  }
  return found;
};

const chart = (
  from: ChartInput["from"],
  more: Partial<ChartInput> = {}
): ChartInput => ({
  from,
  kind: "area",
  series: [{ field: "Выручка", label: "Выручка" }],
  title: "t",
  x: { label: "Месяц", type: "date" },
  ...more,
});

const wrong = (input: ChartInput) => {
  try {
    pointsFrom(input, table());
  } catch (error) {
    return error instanceof SourceError ? error.message : "not a SourceError";
  }
  return "no error";
};

describe("the points of a chart from a tool result", () => {
  it("sums each series per month, in time order — the tool's numbers, not the model's", () => {
    const points = pointsFrom(chart({ bucket: "month", x: "Дата" }), table());
    expect(points.map((p) => p[0])).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    // Row i falls in month i % 3; the three sums add up to the table's whole.
    const total = points.reduce((sum, p) => sum + (p[1] as number), 0);
    expect(total).toBe(74_850);
  });

  it("takes the top of a ranking: sort by value, then limit", () => {
    const points = pointsFrom(
      chart(
        { limit: 3, sort: "-value", x: "Товар" },
        { x: { label: "Товар", type: "category" } }
      ),
      table()
    );
    expect(points).toEqual([
      ["Товар 299", 399],
      ["Товар 298", 398],
      ["Товар 297", 397],
    ]);
  });

  it("counts rows per point", () => {
    const points = pointsFrom(
      chart(
        { aggregate: "count", bucket: "month", x: "Дата" },
        { series: [{ label: "Строк" }] }
      ),
      table()
    );
    expect(points.map((p) => p[1])).toEqual([100, 100, 100]);
  });

  it("cuts dates to weeks that begin on Monday", () => {
    const points = pointsFrom(chart({ bucket: "week", x: "Дата" }), table(40));
    expect(points[0]?.[0]).toBe("2025-12-29");
  });

  it("says what is wrong and what there is, for the model to ask again", () => {
    expect(wrong(chart({ x: "Месяц" }))).toMatch(
      /no column "Месяц".*Columns: Товар, Дата, Выручка/u
    );
    expect(
      wrong(chart({ x: "Товар" }, { series: [{ field: "Дата", label: "d" }] }))
    ).toMatch(/not a numeric column/u);
    expect(wrong(chart({ bucket: "month", x: "Товар" }))).toMatch(
      /bucket needs a date column/u
    );
    expect(wrong(chart({ x: "Товар" }))).toMatch(
      /300 points do not fit a chart.*from\.limit/u
    );
  });
});

const input = (from?: TableInput["from"]): TableInput => ({
  columns: [
    { field: "Товар", label: "Номенклатура", type: "text" },
    { label: "Выручка", type: "number" },
  ],
  from,
  title: "t",
});

describe("the rows of a table from a tool result", () => {
  it("takes the top by a column, and says how many there were", () => {
    const { rows, total } = rowsFrom(
      input({ limit: 2, sort: { desc: true, field: "Выручка" } }),
      table()
    );
    expect(rows).toEqual([
      ["Товар 299", 399],
      ["Товар 298", 398],
    ]);
    expect(total).toBe(300);
  });

  it("cuts a long result at the table's most and keeps the total", () => {
    const out = tableOutput(input({}), table(600));
    expect(out.rows).toBe(500);
    expect(out.total).toBe(600);
  });

  it("is what the model wrote when there is no source", () => {
    expect(chartOutput(chart(undefined, { points: [["a", 1]] }), null)).toEqual(
      { points: 1 }
    );
    expect(tableOutput({ ...input(), rows: [["a", 1]] }, null)).toEqual({
      rows: 1,
    });
  });
});
