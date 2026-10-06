import type { MetricItem, MetricsInput } from "@metobe/contracts/metrics";
import { describe, expect, it } from "vitest";

import { mcpResult } from "./fixtures/query-result";
import { metricsFrom } from "./source-metrics";
import { SourceError } from "./tool-sources";
import { tableOf } from "./tool-table";

// A register: three months, four clients. January 100+50, February 200+300+100, March 400+0.
const REGISTER = [
  ["2026-01-05", "Альфа", 100, 70],
  ["2026-01-20", "Берёзка", 50, 40],
  ["2026-02-03", "Альфа", 200, 150],
  ["2026-02-14", "Орион", 300, 200],
  ["2026-02-27", "Берёзка", 100, 90],
  ["2026-03-09", "Альфа", 400, 300],
  ["2026-03-30", "Кедр", 0, 0],
];

const table = () => {
  const found = tableOf(
    mcpResult({
      columns: ["Дата", "Клиент", "Выручка", "Себестоимость"],
      rows: REGISTER,
    })
  );
  if (!found) {
    throw new Error("fixture is not a table");
  }
  return found;
};

const one = (item: Partial<MetricItem>) =>
  metricsFrom(
    {
      items: [{ form: "value", label: "x", ...item }],
      title: "t",
    } satisfies MetricsInput,
    table()
  ).items[0];

const failure = (item: Partial<MetricItem>) => {
  try {
    one(item);
  } catch (error) {
    return error instanceof SourceError ? error.message : "not a SourceError";
  }
  return "no error";
};

describe("the figures of a metrics widget from a tool result", () => {
  it("reads one figure: a sum, an average, a count of rows, the different values", () => {
    expect(one({ aggregate: "sum", field: "Выручка" })?.value).toBe(1150);
    expect(one({ aggregate: "avg", field: "Выручка" })?.value).toBe(164.285714);
    expect(one({ aggregate: "median", field: "Выручка" })?.value).toBe(100);
    expect(one({ aggregate: "count" })?.value).toBe(7);
    expect(one({ aggregate: "distinct", field: "Клиент" })?.value).toBe(4);
    expect(
      metricsFrom({ items: [], title: "t" } as unknown as MetricsInput, table())
        .rows
    ).toBe(7);
  });

  it("a trend: the history by month, the figure over all of it, the change of the last against the one before", () => {
    const m = one({ field: "Выручка", form: "trend", x: "Дата" });
    expect(m?.series).toEqual([
      { value: 150, x: "2026-01-01" },
      { value: 600, x: "2026-02-01" },
      { value: 400, x: "2026-03-01" },
    ]);
    expect(m?.value).toBe(1150);
    expect(m?.bucket).toBe("month");
    // March 400 against February 600.
    expect(m?.delta).toMatchObject({
      change: -33.333333,
      from: "2026-02-01",
      good: "up",
      previous: 600,
      to: "2026-03-01",
    });
    expect(
      one({ field: "Выручка", form: "trend", good: "down", x: "Дата" })?.delta
        ?.good
    ).toBe("down");
  });

  it("a change against nothing has no percent", () => {
    // Rows by month: 2, 3, 2 — and a month whose figure before it is 0 has no percent at all.
    const m = one({ aggregate: "count", form: "trend", x: "Дата" });
    expect(m?.delta?.change).toBe(-33.333333);
    const [zero] = metricsFrom(
      {
        items: [{ field: "Выручка", form: "trend", label: "x", x: "Дата" }],
        title: "t",
      },
      tableOf(
        mcpResult({
          columns: ["Дата", "Выручка"],
          rows: [
            ["2026-01-01", 0],
            ["2026-02-01", 5],
          ],
        })
      ) ?? table()
    ).items;
    expect(zero?.delta?.change).toBeNull();
  });

  it("a goal is the figure and the user's target", () => {
    const m = one({ field: "Выручка", form: "goal", target: 2000 });
    expect(m).toMatchObject({ target: 2000, value: 1150 });
    expect(failure({ field: "Выручка", form: "goal" })).toMatch(
      /needs `target`/u
    );
  });

  it("a share is the biggest groups' part of the whole, and who they are", () => {
    const m = one({ by: "Клиент", field: "Выручка", form: "share", top: 2 });
    // Альфа 700, Орион 300, Берёзка 150, Кедр 0.
    expect(m).toMatchObject({
      names: ["Альфа", "Орион"],
      value: 1000,
      whole: 1150,
    });
  });

  it("a ranking is the groups by their totals, biggest first, cut to the limit", () => {
    const m = one({
      by: "Клиент",
      field: "Выручка",
      form: "ranking",
      limit: 3,
    });
    expect(m?.items).toEqual([
      { name: "Альфа", value: 700 },
      { name: "Орион", value: 300 },
      { name: "Берёзка", value: 150 },
    ]);
    expect(m?.whole).toBe(1150);
    expect(
      one({ aggregate: "count", by: "Клиент", form: "ranking", limit: 1 })
        ?.items
    ).toEqual([{ name: "Альфа", value: 3 }]);
  });

  it("a range and a summary read the spread of a column", () => {
    expect(one({ field: "Выручка", form: "range" })?.range).toEqual({
      avg: 164.285714,
      max: 400,
      median: 100,
      min: 0,
    });
    expect(one({ field: "Выручка", form: "summary" })?.facts).toEqual([
      { fact: "rows", value: 7 },
      { fact: "sum", value: 1150 },
      { fact: "avg", value: 164.285714 },
      { fact: "median", value: 100 },
      { fact: "min", value: 0 },
      { fact: "max", value: 400 },
    ]);
  });

  it("says what is wrong and which columns there are, for the model to ask again", () => {
    expect(failure({ field: "Прибыль" })).toMatch(
      /items\[0\]\.field.*no column "Прибыль".*Columns: Дата, Клиент, Выручка, Себестоимость/u
    );
    expect(failure({ field: "Клиент" })).toMatch(
      /not a numeric column.*count or distinct/u
    );
    expect(failure({ field: "Выручка", form: "trend", x: "Клиент" })).toMatch(
      /not a date column/u
    );
    expect(failure({ field: "Выручка", form: "trend" })).toMatch(
      /items\[0\]\.x.*no column/u
    );
    expect(failure({ field: "Выручка", form: "ranking" })).toMatch(
      /items\[0\]\.by/u
    );
  });

  it("movers: who grew most and who fell most, the last period against the one before", () => {
    // February → March: Альфа 200 → 400, Орион 300 → 0, Берёзка 100 → 0; Кедр has nothing in either.
    const m = one({
      by: "Клиент",
      field: "Выручка",
      form: "movers",
      x: "Дата",
    });
    expect(m?.period).toEqual({ from: "2026-02-01", to: "2026-03-01" });
    expect(m?.movers).toEqual([
      { after: 400, before: 200, change: 200, name: "Альфа", pct: 100 },
      { after: 0, before: 300, change: -300, name: "Орион", pct: -100 },
      { after: 0, before: 100, change: -100, name: "Берёзка", pct: -100 },
    ]);
    expect(m).toMatchObject({ down: 2, good: "up", net: -200, up: 1 });
    expect(
      one({
        by: "Клиент",
        field: "Выручка",
        form: "movers",
        good: "down",
        limit: 1,
        x: "Дата",
      })?.movers
    ).toHaveLength(2);
    expect(failure({ by: "Клиент", field: "Выручка", form: "movers" })).toMatch(
      /items\[0\]\.x/u
    );
  });

  it("movers need two periods", () => {
    const oneMonth = tableOf(
      mcpResult({
        columns: ["Дата", "Клиент", "Выручка"],
        rows: [
          ["2026-01-01", "А", 1],
          ["2026-01-09", "Б", 2],
        ],
      })
    );
    expect(() =>
      metricsFrom(
        {
          items: [
            {
              by: "Клиент",
              field: "Выручка",
              form: "movers",
              label: "x",
              x: "Дата",
            },
          ],
          title: "t",
        },
        oneMonth ?? table()
      )
    ).toThrow(/compare two months and this result has 1/u);
  });

  it("pareto: groups by their total, cumulative share, classes and how few make 80%", () => {
    const m = one({ by: "Клиент", field: "Выручка", form: "pareto" });
    // Альфа 700, Орион 300, Берёзка 150 of 1150; Кедр has no revenue and is left out.
    expect(m?.pareto).toEqual([
      { cls: "A", cum: 0.6087, name: "Альфа", value: 700 },
      { cls: "A", cum: 0.8696, name: "Орион", value: 300 },
      { cls: "B", cum: 1, name: "Берёзка", value: 150 },
    ]);
    expect(m).toMatchObject({ groupCount: 3, n80: 2, whole: 1150 });
    expect(m?.classes?.map((c) => [c.cls, c.count])).toEqual([
      ["A", 2],
      ["B", 1],
      ["C", 0],
    ]);
    expect(m?.curve).toEqual([0.6087, 0.8696, 1]);
  });

  it("outliers: the values above Tukey's fence, who and when, and the quartiles", () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => [
        `2026-01-${String(i + 1).padStart(2, "0")}`,
        `К${i}`,
        10 + i,
      ]),
      ["2026-02-01", "Крупный", 500],
    ];
    const found = tableOf(
      mcpResult({ columns: ["Дата", "Клиент", "Сумма"], rows })
    );
    const [m] = metricsFrom(
      {
        items: [
          {
            by: "Клиент",
            field: "Сумма",
            form: "outliers",
            label: "x",
            x: "Дата",
          },
        ],
        title: "t",
      },
      found ?? table()
    ).items;
    expect(m).toMatchObject({
      count: 21,
      outlierCount: 1,
      outliers: [{ date: "2026-02-01", name: "Крупный", value: 500 }],
    });
    expect(m?.fence).toBeGreaterThan(m?.quartiles?.q3 ?? 0);
    expect(m?.values).toContain(500);
    expect(failure({ field: "Выручка", form: "outliers" })).toMatch(/too few/u);
  });

  it("composition: the biggest groups by name and the rest together", () => {
    const m = one({
      by: "Клиент",
      field: "Выручка",
      form: "composition",
      top: 2,
    });
    expect(m?.parts).toEqual([
      { name: "Альфа", value: 700 },
      { name: "Орион", value: 300 },
      { count: 1, name: "", rest: true, value: 150 },
    ]);
    expect(m?.whole).toBe(1150);
  });
});
