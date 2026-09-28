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
        kind: "scatter",
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

  it("keeps eight colors: the biggest seven and the rest together", () => {
    const slices = pieSlices(
      pie([
        ["А", 90],
        ["Б", 80],
        ["В", 70],
        ["Г", 60],
        ["Д", 50],
        ["Е", 40],
        ["Ж", 30],
        ["З", 5],
        ["И", 3],
      ]),
      "Прочее"
    );
    expect(slices.map((s) => s.name)).toEqual([
      "А",
      "Б",
      "В",
      "Г",
      "Д",
      "Е",
      "Ж",
      "Прочее",
    ]);
    expect(slices.at(-1)?.value).toBe(8);
    // Only the folded one is «Прочее»: it is drawn neutral.
    expect(slices.map((s) => s.other)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});

const view = (extra: Record<string, unknown>) =>
  chartView(
    part("input-available", {
      kind: "composed",
      points: [["Янв", 1, 2, 3]],
      series: [{ label: "А" }, { label: "Б" }, { as: "bar", label: "В" }],
      title: "",
      x: { label: "", type: "category" },
      ...extra,
    })
  );

describe("the chart's options", () => {
  it("takes the model's kinds, all of them", () => {
    for (const kind of [
      "bar",
      "line",
      "area",
      "pie",
      "radar",
      "radial",
      "composed",
    ]) {
      expect(view({ kind }).kind).toBe(kind);
    }
  });

  it("curves lines and rings pies unless told otherwise", () => {
    expect(view({}).smooth).toBe(true);
    expect(view({}).donut).toBe(true);
    expect(view({ donut: false, smooth: false })).toMatchObject({
      donut: false,
      smooth: false,
    });
  });

  it("stacks as shares when asked for percent, even without stacked", () => {
    expect(view({ percent: true })).toMatchObject({
      percent: true,
      stacked: true,
    });
    expect(view({}).stacked).toBe(false);
  });

  it("reads which series of a composed chart are bars: the first, unless the model says", () => {
    expect(view({}).series.map((s) => s.as)).toEqual(["bar", "line", "bar"]);
  });
});
