import type { ChatMessage } from "@metobe/contracts/chat";
import type { LetterBlock } from "@metobe/emails/blocks";
import { taskLetter } from "@metobe/emails/task-letter";
import { describe, expect, it } from "vitest";

import { letterBlocks } from "./letter-blocks";

type Part = ChatMessage["parts"][number];
const text = (t: string) => ({ text: t, type: "text" }) as Part;
const tool = (type: string, input: unknown, output: unknown) =>
  ({
    input,
    output,
    state: "output-available",
    toolCallId: type,
    type,
  }) as unknown as Part;
const ru = (parts: Part[], o: { maxBlocks?: number } = {}) =>
  letterBlocks(parts, { locale: "ru", ...o });
/** Intl puts non-breaking spaces into figures («4,8 млн ₽»): compared with plain ones. */
const sp = (v?: string) => v?.replaceAll(/[\u00A0\u202F]/gu, " ");
const of = <T extends LetterBlock["type"]>(blocks: LetterBlock[], type: T) =>
  blocks.filter((b): b is Extract<LetterBlock, { type: T }> => b.type === type);

describe("markdown in a letter", () => {
  it("keeps paragraphs, headings, lists, quotes, code and tables", () => {
    const blocks = ru([
      text(
        "Главная: тарифы растут на **8–12 %**, см. [сообщение](https://example.ru/t).\n\n## Тарифы\n\n1. **Посылки** — дешевле всего\n   - по России: +8 %\n2. Крупногабарит\n\n> Цитата\n\n```\ncargo_class: standard\n```\n\n---\n\n| Товар | Было | Стало |\n| --- | ---: | ---: |\n| Кофемашина | 24 990 ₽ | 22 490 ₽ |"
      ),
    ]);
    expect(blocks.map((b) => b.type)).toEqual([
      "p",
      "heading",
      "list",
      "quote",
      "code",
      "hr",
      "table",
    ]);
    const [p] = of(blocks, "p");
    expect(p?.runs).toContainEqual({ b: true, text: "8–12 %" });
    expect(p?.runs).toContainEqual({
      href: "https://example.ru/t",
      text: "сообщение",
    });
    const [list] = of(blocks, "list");
    expect(list?.ordered).toBe(true);
    expect(list?.items[0]?.sub).toEqual(["по России: +8 %"]);
    const [table] = of(blocks, "table");
    expect(table?.head).toEqual(["Товар", "Было", "Стало"]);
    expect(table?.right).toEqual([1, 2]);
    const [aligned] = of(
      ru([
        text(
          "| Товар | Стало |\n| --- | ---: |\n| Кофемашина | 22 490 ₽ (−10 %) |"
        ),
      ]),
      "table"
    );
    expect(aligned?.right).toEqual([1]);
  });

  it("drops raw HTML, images and links that are not http(s)", () => {
    const blocks = ru([
      text(
        `Текст <img src=x onerror="alert(1)"> и ![картинка](https://x.ru/a.png) и [ссылка](${["java", "script:alert(1)"].join("")}).\n\n<div>блок</div>`
      ),
    ]);
    const all = JSON.stringify(blocks);
    expect(all).not.toContain("onerror");
    expect(all).not.toContain("a.png");
    expect(all).not.toContain(["java", "script:"].join(""));
    expect(all).not.toContain("<div>");
    expect(
      of(blocks, "p")[0]?.runs?.some((r) => r.text === "ссылка" && !r.href)
    ).toBe(true);
  });
});

describe("a table from show_table", () => {
  const input = {
    columns: [
      { label: "Товар", type: "text" },
      { label: "Остаток", summary: "sum", type: "number" },
      { label: "Поставка", type: "date" },
    ],
    title: "Заканчиваются",
  };
  const data = Array.from({ length: 12 }, (_, i) => [
    `Товар ${i + 1}`,
    1000 + i,
    `2026-12-0${(i % 9) + 1}`,
  ]);

  it("shows the first rows, the total of all and how many are left out", () => {
    const [t] = of(
      ru([tool("tool-show_table", input, { data, rows: 12, total: 52 })]),
      "table"
    );
    expect(t?.rows).toHaveLength(10);
    expect(sp(t?.rows[0]?.[1])).toBe("1 000");
    expect(sp(t?.rows[0]?.[2])).toBe("1 дек.");
    expect(t?.right).toEqual([1]);
    expect(t?.total?.[0]).toBe("Итого");
    expect(sp(t?.total?.[1])).toBe(
      sp(
        new Intl.NumberFormat("ru", { maximumFractionDigits: 2 }).format(
          data.reduce((a, r) => a + (r[1] as number), 0)
        )
      )
    );
    expect(sp(t?.more)).toBe("Ещё 42 строки — в Metobe.");
  });
});

describe("metrics from show_metrics", () => {
  const series = ["2026-10-05", "2026-10-12", "2026-10-19"].map((x, i) => ({
    value: 4_000_000 + i * 400_000,
    x,
  }));
  const output = {
    items: [
      {
        bucket: "week",
        delta: {
          change: 6.7,
          current: 4_800_000,
          from: "2026-10-12",
          good: "up",
          previous: 4_500_000,
          to: "2026-10-19",
        },
        form: "trend",
        label: "Выручка",
        series,
        unit: "₽",
        value: 4_800_000,
      },
      { form: "value", label: "Сделок", value: 34 },
      { form: "value", label: "Клиентов", value: 6 },
      {
        form: "goal",
        label: "План",
        target: 20_000_000,
        unit: "₽",
        value: 16_400_000,
      },
      {
        form: "share",
        label: "Доля трёх",
        names: ["Альфа", "Берёзка", "Сибирь"],
        value: 52,
        whole: 100,
      },
      {
        form: "range",
        label: "Сумма сделки",
        range: { avg: 141_000, max: 1_200_000, median: 88_000, min: 12_000 },
        unit: "₽",
      },
      {
        facts: [
          { fact: "rows", value: 34 },
          { fact: "sum", value: 4_800_000 },
        ],
        form: "summary",
        label: "Сводка",
        unit: "₽",
      },
      {
        form: "ranking",
        items: [
          { name: "Альфа", value: 21_000_000 },
          { name: "Берёзка", value: 12_000_000 },
        ],
        label: "Клиенты",
        unit: "₽",
      },
      {
        down: 1,
        form: "movers",
        label: "Кто вырос",
        movers: [
          { after: 11, before: 8, change: 3, name: "Берёзка", pct: 34 },
          { after: 7, before: 9, change: -2, name: "Орион", pct: -20 },
        ],
        net: 1,
        up: 1,
      },
      {
        form: "pareto",
        groupCount: 47,
        label: "Парето",
        n80: 8,
        pareto: [{ cls: "A", cum: 0.31, name: "Альфа", value: 21 }],
      },
      {
        fence: 1_200_000,
        form: "outliers",
        label: "Выбросы",
        outlierCount: 2,
        outliers: [{ date: "2026-11-14", name: "Альфа", value: 4_400_000 }],
        unit: "₽",
      },
      {
        form: "composition",
        label: "Состав",
        parts: [
          { name: "Опт", value: 55 },
          { name: "Розница", value: 30 },
          { count: 4, name: "", rest: true, value: 15 },
        ],
      },
    ],
    rows: 412,
  };
  const blocks = ru([
    tool("tool-show_metrics", { items: [], title: "Продажи" }, output),
  ]);

  it("turns every form into its block, plain figures side by side", () => {
    expect(blocks.map((b) => b.type)).toEqual([
      "trend",
      "figures",
      "progress",
      "progress",
      "range",
      "facts",
      "bars",
      "movers",
      "bars",
      "bars",
      "stack",
    ]);
    expect(of(blocks, "figures")[0]?.items.map((i) => i.label)).toEqual([
      "Сделок",
      "Клиентов",
    ]);
  });

  it("says the figures as the chat does", () => {
    const [trend] = of(blocks, "trend");
    expect(sp(trend?.value)).toBe("4,8 млн ₽");
    expect(sp(trend?.change)).toBe("+6,7 % к прошлой неделе");
    expect(trend?.tone).toBe("good");
    const [goal, share] = of(blocks, "progress");
    expect(goal?.pct).toBeCloseTo(0.82);
    expect(sp(goal?.value)).toBe("16,4 млн ₽ · 82 %");
    expect(share?.caption).toBe("Альфа, Берёзка, Сибирь");
    const [movers] = of(blocks, "movers");
    expect(sp(movers?.up[0]?.value)).toBe("+3 · +34 %");
    expect(sp(movers?.down[0]?.value)).toBe("−2 · −20 %");
    const [, pareto, outliers] = of(blocks, "bars");
    expect(sp(pareto?.note)).toBe("8 из 47 дают 80 %.");
    expect(sp(outliers?.items[0]?.name)).toBe("Альфа · 14 нояб.");
    expect(sp(of(blocks, "stack")[0]?.items[2]?.name)).toBe("Ещё 4");
  });
});

const chart = (
  kind: string,
  xType: string,
  data: unknown[][],
  series = [{ label: "Выручка", unit: "млн ₽" }]
) =>
  tool(
    "tool-show_chart",
    { kind, series, title: "Выручка", x: { label: "Месяц", type: xType } },
    { data, points: data.length }
  );

describe("charts from show_chart", () => {
  const months = [
    ["2026-09-01", 15.6],
    ["2026-10-01", 17.8],
    ["2026-11-01", 18.6],
  ];

  it("draws a series over time as columns", () => {
    const [c] = of(ru([chart("area", "date", months)]), "columns");
    expect(c?.bars.at(-1)).toBe(1);
    expect(sp(c?.from)).toBe("1 сент.");
    expect(sp(c?.value)).toBe("18,6 млн ₽");
  });

  it("draws categories as bars, a pie as segments, a radar as a table with a line", () => {
    expect(
      of(
        ru([
          chart("bar", "category", [
            ["Опт", 26],
            ["Розница", 14],
          ]),
        ]),
        "bars"
      )[0]?.items[0]?.name
    ).toBe("Опт");
    expect(
      of(
        ru([
          chart("pie", "category", [
            ["Москва", 42],
            ["Питер", 21],
          ]),
        ]),
        "stack"
      )[0]?.items[0]?.pct
    ).toBeCloseTo(42 / 63);
    const radar = ru([
      chart(
        "radar",
        "category",
        [["Скорость", 8.4, 7.9]],
        [
          { label: "Ноябрь", unit: "" },
          { label: "Октябрь", unit: "" },
        ]
      ),
    ]);
    expect(radar.map((b) => b.type)).toEqual(["table", "more"]);
    expect(of(radar, "more")[0]?.text).toBe("График «Выручка» — в Metobe.");
  });
});

describe("the answer as a whole", () => {
  it("leaves the work's steps out and cuts a long one", () => {
    const steps = [
      {
        input: { query: "цены" },
        output: {},
        state: "output-available",
        toolCallId: "s",
        type: "tool-web_search",
      } as unknown as Part,
    ];
    expect(ru([...steps, text("Итог.")]).map((b) => b.type)).toEqual(["p"]);
    const long = ru(
      [text(Array.from({ length: 20 }, (_, i) => `Абзац ${i}.`).join("\n\n"))],
      { maxBlocks: 5 }
    );
    expect(long).toHaveLength(6);
    expect(long.at(-1)).toEqual({
      text: "Продолжение — в Metobe.",
      type: "more",
    });
  });

  it("becomes a letter whose text part holds the figures", async () => {
    const blocks = ru([
      text(
        "Изменились цены у двух товаров:\n\n| Товар | Было | Стало |\n| --- | --- | --- |\n| Кофемашина | 24 990 ₽ | 22 490 ₽ |"
      ),
    ]);
    const { text: plain } = await taskLetter({
      blocks,
      button: { href: "https://m.example.ru/t", label: "Открыть задачу" },
      heading: "Цены изменились",
      kind: "result",
      label: "Новый итог",
      locale: "ru",
      off: { href: "https://m.example.ru/t?off", label: "Отключить" },
      preview: "Кофемашина подешевела.",
      task: {
        color: "#4a3aa7",
        meta: "По понедельникам",
        name: "Цены конкурентов",
      },
      why: "Включены уведомления.",
    });
    expect(sp(plain)).toContain("22 490 ₽");
  });
});
