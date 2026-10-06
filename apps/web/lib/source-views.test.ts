import { describe, expect, it } from "vitest";

import type { ChartPart, TablePart } from "./answer-work";
import { chartView } from "./chart-data";
import { tableView } from "./table-data";

const chartInput = {
  from: { x: "Дата" },
  kind: "area",
  series: [{ field: "Выручка", label: "Выручка" }],
  title: "Выручка",
  x: { label: "Месяц", type: "date" },
};
const chart = (state: object) =>
  ({
    input: chartInput,
    toolCallId: "c",
    type: "tool-show_chart",
    ...state,
  }) as ChartPart;

const tableInput = {
  columns: [
    { label: "Товар", type: "text" },
    { label: "Выручка", type: "number" },
  ],
  from: {},
  title: "Товары",
};
const table = (state: object) =>
  ({
    input: tableInput,
    toolCallId: "t",
    type: "tool-show_table",
    ...state,
  }) as TablePart;

describe("a chart from a tool result", () => {
  it("is still being built until the server's points arrive, with its series but no points", () => {
    const view = chartView(chart({ state: "input-available" }));
    expect(view.streaming).toBe(true);
    expect(view.series).toHaveLength(1);
    expect(view.points).toEqual([]);
  });

  it("draws the points the server took, whole", () => {
    const view = chartView(
      chart({
        output: {
          data: [
            ["2026-01-01", 10],
            ["2026-02-01", "12,5"],
          ],
          points: 2,
        },
        state: "output-available",
      })
    );
    expect(view.streaming).toBe(false);
    expect(view.points.map((p) => p.s0)).toEqual([10, 12.5]);
  });

  it("says why it could not be built", () => {
    const view = chartView(
      chart({ errorText: "no column", state: "output-error" })
    );
    expect(view.error).toBe("no column");
    expect(view.streaming).toBe(false);
  });

  it("a chart the model wrote itself stays as it was", () => {
    const view = chartView({
      input: {
        ...chartInput,
        from: undefined,
        points: [
          ["a", 1],
          ["b", 2],
        ],
      },
      output: { points: 2 },
      state: "output-available",
      toolCallId: "c",
      type: "tool-show_chart",
    } as ChartPart);
    expect(view.points).toHaveLength(2);
  });
});

describe("a table from a tool result", () => {
  it("shows no columns until the rows arrive, so there is no empty grid", () => {
    const view = tableView(table({ state: "input-available" }));
    expect(view.streaming).toBe(true);
    expect(view.columns).toEqual([]);
  });

  it("shows the rows the server took and says when the source had more", () => {
    const view = tableView(
      table({
        output: {
          data: [
            ["a", 1],
            ["b", 2],
          ],
          rows: 2,
          total: 2938,
        },
        state: "output-available",
      })
    );
    expect(view.rows).toHaveLength(2);
    expect(view.total).toBe(2938);
    expect(view.streaming).toBe(false);
  });

  it("does not say «more» when the table holds all there was", () => {
    const view = tableView(
      table({
        output: { data: [["a", 1]], rows: 1, total: 1 },
        state: "output-available",
      })
    );
    expect(view.total).toBeUndefined();
  });

  it("says why it could not be built", () => {
    expect(
      tableView(table({ errorText: "no column", state: "output-error" })).error
    ).toBe("no column");
  });
});
