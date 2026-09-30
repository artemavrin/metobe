import {
  createFilterQuery,
  createFilterRule,
} from "@metobe/ui/components/reui/filters/filters-query";
import { describe, expect, it } from "vitest";

import type { TablePart } from "./answer-work";
import {
  categoryValues,
  firstSeen,
  matchesQuery,
  numbersOf,
  summarize,
  tableView,
} from "./table-data";

const part = (state: TablePart["state"], input: unknown) =>
  ({
    input,
    state,
    toolCallId: "t",
    type: "tool-show_table",
  }) as TablePart;

const columns = [
  { label: "Имя", type: "text" },
  { label: "Город", type: "category" },
  { label: "Оклад", type: "number" },
];

describe("what of a streaming table the grid shows", () => {
  it("shows no columns until the model moves on to the rows", () => {
    const view = tableView(
      part("input-streaming", {
        columns: [{ label: "Имя", type: "text" }, { label: "Гор" }],
        title: "Сотр",
      })
    );
    expect(view.columns).toEqual([]);
    expect(view.title).toBe("Сотр");
    expect(view.streaming).toBe(true);
  });

  it("holds back the last row while it streams — it may be cut mid-value", () => {
    const view = tableView(
      part("input-streaming", {
        columns,
        rows: [
          ["Анна", "Москва", 120_000],
          ["Борис", "Каз"],
        ],
        title: "Сотрудники",
      })
    );
    expect(view.columns.map((c) => c.id)).toEqual(["c0", "c1", "c2"]);
    expect(view.rows).toEqual([
      { cells: ["Анна", "Москва", 120_000], id: "r0" },
    ]);
  });

  it("shows every row once it is written, short rows padded with empty cells", () => {
    const view = tableView(
      part("input-available", {
        columns,
        rows: [["Анна", "Москва", 120_000], ["Борис"]],
        title: "Сотрудники",
      })
    );
    expect(view.rows.at(-1)?.cells).toEqual(["Борис", null, null]);
    expect(view.streaming).toBe(false);
  });

  it("reads an unknown column type as text", () => {
    const view = tableView(
      part("input-available", {
        columns: [{ label: "X", type: "money" }],
        rows: [],
        title: "",
      })
    );
    expect(view.columns[0]?.type).toBe("text");
  });
});

describe("filters over the rows", () => {
  const { rows } = tableView(
    part("input-available", {
      columns,
      rows: [
        ["Анна", "Москва", 120_000],
        ["Борис", "Казань", 90_000],
        ["Вера", "Москва", null],
      ],
      title: "",
    })
  );
  const pick = (rule: Omit<Parameters<typeof createFilterRule>[0], "id">) => {
    const query = createFilterQuery([createFilterRule({ ...rule, id: "r" })]);
    return rows.filter((r) => matchesQuery(r, query)).map((r) => r.cells[0]);
  };

  it("offers a category's values most frequent first, colours them in the order they came", () => {
    expect(categoryValues(rows, 1)).toEqual(["Москва", "Казань"]);
    expect(firstSeen(rows.slice(1), 1)).toEqual(["Казань", "Москва"]);
  });

  it("filters text, categories and numbers; an empty cell is not a number", () => {
    expect(pick({ operator: "contains", path: ["c0"], value: "ан" })).toEqual([
      "Анна",
    ]);
    expect(
      pick({ operator: "is_any_of", path: ["c1"], value: ["Казань"] })
    ).toEqual(["Борис"]);
    expect(pick({ operator: "gte", path: ["c2"], value: 100_000 })).toEqual([
      "Анна",
    ]);
    expect(pick({ operator: "empty", path: ["c2"] })).toEqual(["Вера"]);
  });

  it("keeps every row while a rule has no value yet", () => {
    expect(pick({ operator: "is_any_of", path: ["c1"], value: [] })).toEqual([
      "Анна",
      "Борис",
      "Вера",
    ]);
  });
});

const done = (extra: object, cols = columns) =>
  tableView(
    part("input-available", {
      columns: cols,
      rows: [["А", "Москва", 100]],
      title: "Т",
      ...extra,
    })
  );

describe("grouping, figures and tints the model asks for", () => {
  it("groups by the columns whose labels the model wrote, and only by those", () => {
    expect(done({ groupBy: ["Город", "Нет такой"] }).groups).toEqual(["c1"]);
    expect(done({}).groups).toEqual([]);
  });

  it("keeps a summary and a heat for a number column only", () => {
    const view = done({}, [
      { label: "Имя", summary: "sum", type: "text" },
      { heat: "good", label: "Оклад", summary: "avg", type: "number" },
      { heat: "hot", label: "Стаж", summary: "median", type: "number" },
    ] as never);
    expect(view.columns.map((c) => [c.summary, c.heat])).toEqual([
      [undefined, undefined],
      ["avg", "good"],
      [undefined, undefined],
    ]);
  });

  it("sums a column up from its numbers, leaving out what is no number", () => {
    const rows = [
      { cells: ["a", 10], id: "1" },
      { cells: ["b", null], id: "2" },
      { cells: ["c", "30"], id: "3" },
      { cells: ["d", "n/a"], id: "4" },
    ];
    const nums = numbersOf(rows, 1);
    expect(nums).toEqual([10, 30]);
    expect(summarize(nums, "sum")).toBe(40);
    expect(summarize(nums, "avg")).toBe(20);
    expect(summarize(nums, "min")).toBe(10);
    expect(summarize(nums, "max")).toBe(30);
    expect(summarize([], "sum")).toBeUndefined();
  });
});
