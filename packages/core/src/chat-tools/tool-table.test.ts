import { describe, expect, it } from "vitest";

import { mcpResult, salesQuery } from "./fixtures/query-result";
import {
  columnOf,
  isSmall,
  PARTIAL_WARNING,
  summaryOf,
  tableOf,
} from "./tool-table";

describe("a tool result read as a table", () => {
  it("reads the 1C query: names without types, references by their presentation, kinds by values", () => {
    const table = tableOf(salesQuery(3));
    expect(table?.columns).toEqual([
      { kind: "text", name: "Товар" },
      { kind: "date", name: "Дата" },
      { kind: "number", name: "Выручка" },
    ]);
    expect(table?.rows[0]).toEqual(["Товар 0", "2026-01-01T10:00:00", 100]);
  });

  it("reads rows written as objects by the column names", () => {
    expect(tableOf(salesQuery(3, "objects"))?.rows).toEqual(
      tableOf(salesQuery(3))?.rows
    );
  });

  it("finds the biggest list of records inside an object, and a bare list", () => {
    const rows = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ];
    expect(tableOf(mcpResult({ items: rows, total: 2 }))?.rows).toHaveLength(2);
    expect(tableOf(rows)?.columns.map((c) => c.name)).toEqual(["id", "name"]);
    expect(
      tableOf({ structuredContent: { columns: ["a", "b"], rows: [[1, 2]] } })
        ?.rows
    ).toEqual([[1, 2]]);
  });

  it("is not a table when it is an error, one object or plain text", () => {
    expect(
      tableOf({ content: [{ text: "boom", type: "text" }], isError: true })
    ).toBeNull();
    expect(
      tableOf(mcpResult({ attributes: ["a", "b"], name: "x" }))
    ).toBeNull();
    expect(
      tableOf(mcpResult({ error: "bad query", ok: false, rows: [] }))
    ).toBeNull();
    expect(
      tableOf({ content: [{ text: "just words", type: "text" }] })
    ).toBeNull();
    expect(tableOf(null)).toBeNull();
  });

  it("finds a column by its name, loosely", () => {
    const table = tableOf(salesQuery(2));
    expect(table && columnOf(table, "Выручка")).toBe(2);
    expect(table && columnOf(table, " выручка ")).toBe(2);
    expect(table && columnOf(table, "Прибыль")).toBe(-1);
  });
});

describe("what the model is told of a table", () => {
  it("a short table, or one with no numbers, goes whole (no summary)", () => {
    const short = tableOf(salesQuery(20));
    expect(short && isSmall(short)).toBe(true);
    const cases = tableOf(
      mcpResult({
        items: Array.from({ length: 80 }, (_, i) => ({
          description: "x".repeat(300),
          name: `case ${i}`,
        })),
      })
    );
    expect(cases && summaryOf(cases, "c1")).toBeNull();
  });

  it("a long numeric table becomes columns with totals, the first rows and its ref", () => {
    const table = tableOf(salesQuery(300));
    const summary = table && summaryOf(table, "call_1");
    expect(summary).toContain("ref call_1");
    expect(summary).toContain("300 rows");
    // 100 + 101 + … + 399
    expect(summary).toContain("Выручка (number; sum 74850, min 100, max 399)");
    expect(summary).toContain("Товар 24");
    expect(summary).not.toContain("Товар 25 ");
    expect(summary).toContain('from.ref "call_1"');
  });

  it("says the same words for the same table, so the prompt's cache holds", () => {
    const a = tableOf(salesQuery(300));
    const b = tableOf(salesQuery(300));
    expect(a && summaryOf(a, "x")).toBe(b && summaryOf(b, "x"));
  });
});

const cut = (flag: object) =>
  mcpResult({
    columns: ["Клиент", "Выручка"],
    rows: [
      ["а", 1],
      ["б", 2],
    ],
    ...flag,
  });

describe("a result that is cut", () => {
  it("is partial when the tool says there is more: hasMore, truncated or a cursor to the next page", () => {
    expect(tableOf(cut({ hasMore: true }))?.partial).toBe(true);
    expect(tableOf(cut({ truncated: true }))?.partial).toBe(true);
    expect(tableOf(cut({ nextCursor: "abc" }))?.partial).toBe(true);
    expect(tableOf(cut({ hasMore: false }))?.partial).toBeUndefined();
    expect(tableOf(cut({}))?.partial).toBeUndefined();
  });

  it("tells the model its totals are not real, in the summary of a long one", () => {
    const rows = Array.from({ length: 900 }, (_, i) => [
      `клиент ${i}`,
      100 + i,
    ]);
    const table = tableOf(
      mcpResult({ columns: ["Клиент", "Выручка"], hasMore: true, rows })
    );
    expect(table?.partial).toBe(true);
    expect(table && summaryOf(table, "r1")).toContain(PARTIAL_WARNING);
  });
});
