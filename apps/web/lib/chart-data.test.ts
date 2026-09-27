import { describe, expect, it } from "vitest";

import type { ChartPart } from "./answer-work";
import { chartView, pieSlices, toNumber } from "./chart-data";

const part = (state: ChartPart["state"], input: unknown) =>
  ({ input, state, toolCallId: "c", type: "tool-show_chart" }) as ChartPart;

const series = [{ label: "Выручка", unit: "₽" }, { label: "Расходы" }];

describe("what of a streaming chart can be drawn", () => {
  it("draws no series until the model moves on to the points", () => {
    const view = chartView(
      part("input-streaming", {
        kind: "bar",
        series: [{ label: "Выр" }],
        title: "Выручка",
        x: { label: "Месяц", type: "category" },
      })
    );
    expect(view.series).toEqual([]);
    expect(view.title).toBe("Выручка");
  });

  it("holds back the last point while it streams — it may be cut mid-number", () => {
    const view = chartView(
      part("input-streaming", {
        kind: "bar",
        points: [
          ["Янв", 120, 80],
          ["Фев", 13],
        ],
        series,
        title: "Выручка",
        x: { label: "Месяц", type: "category" },
      })
    );
    expect(view.series.map((s) => s.key)).toEqual(["s0", "s1"]);
    expect(view.points).toEqual([{ s0: 120, s1: 80, x: "Янв" }]);
  });

  it("reads numbers as the model writes them, and a missing one as a gap", () => {
    expect(toNumber(12)).toBe(12);
    expect(toNumber("1 200")).toBe(1200);
    expect(toNumber("12,5")).toBe(12.5);
    expect(toNumber("н/д")).toBeNull();
    expect(toNumber(null)).toBeNull();
  });

  it("falls back to bars and a category axis for what it does not know", () => {
    const view = chartView(
      part("input-available", {
        kind: "radar",
        points: [],
        series,
        title: "",
        x: { label: "", type: "time" },
      })
    );
    expect(view.kind).toBe("bar");
    expect(view.x.type).toBe("category");
  });
});

/** A pie of these slices, done. */
const pie = (values: [string, number][]) =>
  chartView(
    part("input-available", {
      kind: "pie",
      points: values,
      series: [{ label: "Доля" }],
      title: "",
      x: { label: "", type: "category" },
    })
  );

describe("a pie's slices", () => {
  it("puts the biggest first", () => {
    expect(
      pieSlices(
        pie([
          ["А", 10],
          ["Б", 30],
          ["В", 20],
        ]),
        "Прочее"
      ).map((s) => s.name)
    ).toEqual(["Б", "В", "А"]);
  });

  it("keeps five colors: the biggest four and the rest together", () => {
    const slices = pieSlices(
      pie([
        ["А", 50],
        ["Б", 40],
        ["В", 30],
        ["Г", 20],
        ["Д", 5],
        ["Е", 3],
      ]),
      "Прочее"
    );
    expect(slices.map((s) => s.name)).toEqual(["А", "Б", "В", "Г", "Прочее"]);
    expect(slices.at(-1)?.value).toBe(8);
  });
});
