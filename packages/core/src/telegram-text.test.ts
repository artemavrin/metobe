import type { LetterBlock } from "@metobe/emails/blocks";
import { describe, expect, it } from "vitest";

import { escapeHtml, telegramHtml } from "./telegram-text";

const html = (...blocks: LetterBlock[]) => telegramHtml(blocks);

describe("the blocks of a letter as a Telegram message (D43)", () => {
  it("escapes what Telegram would read as markup", () => {
    expect(html({ text: "a < b & c > d", type: "p" })).toBe(
      "a &lt; b &amp; c &gt; d"
    );
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("draws the runs: bold, italic, code, and a link only for http(s)", () => {
    const out = html({
      runs: [
        { b: true, text: "Важно" },
        { text: " и " },
        { i: true, text: "курсив" },
        { text: " " },
        { code: true, text: "x<1" },
        { text: " " },
        { href: "https://example.com/?a=1&b=2", text: "ссылка" },
        { text: " " },
        { href: ["java", "script:alert(1)"].join(""), text: "нет" },
      ],
      type: "p",
    });
    expect(out).toContain("<b>Важно</b> и <i>курсив</i> <code>x&lt;1</code>");
    expect(out).toContain(
      '<a href="https://example.com/?a=1&amp;b=2">ссылка</a>'
    );
    expect(out).not.toContain("javascript");
    expect(out).toContain(" нет");
  });

  it("makes lists, headings, quotes and code", () => {
    expect(
      html(
        { text: "Итоги", type: "heading" },
        {
          items: [
            { strong: "Один", sub: ["вложенный"], text: "первый" },
            { text: "второй" },
          ],
          type: "list",
        },
        { items: [{ text: "а" }, { text: "б" }], ordered: true, type: "list" },
        { text: "цитата", type: "quote" },
        { text: "let a = 1 < 2;", type: "code" }
      )
    ).toBe(
      [
        "<b>Итоги</b>",
        "• <b>Один</b> первый\n   – вложенный\n• второй",
        "1. а\n2. б",
        "<blockquote>цитата</blockquote>",
        "<pre>let a = 1 &lt; 2;</pre>",
      ].join("\n\n")
    );
  });

  it("aligns a table in a <pre>, numbers to the right, and says how many rows are not shown", () => {
    const rows = Array.from({ length: 14 }, (_, i) => [
      `Товар ${i + 1}`,
      String((i + 1) * 100),
    ]);
    const out = html({
      head: ["Название", "Сумма"],
      right: [1],
      rows,
      title: "Продажи",
      total: ["Итого", "10 500"],
      type: "table",
    });
    expect(out).toContain("<b>Продажи</b>");
    expect(out).toContain("<pre>Название   Сумма\nТовар 1      100");
    expect(out).toMatch(/Итого\s+10 500/u);
    expect(out).toContain("<i>+2</i>");
    expect(out).not.toContain("Товар 13");
  });

  it("draws figures, a trend, a share and a ranking in characters", () => {
    const out = html(
      {
        items: [{ change: "+12 %", label: "Выручка", value: "1,2 млн" }],
        type: "figures",
      },
      {
        bars: [0, 0.5, 1],
        change: "−3 %",
        from: "янв",
        label: "Заказы",
        to: "мар",
        type: "trend",
        value: "340",
      },
      {
        caption: "из 100",
        label: "План",
        pct: 0.6,
        type: "progress",
        value: "60",
      },
      {
        items: [
          { name: "Север", pct: 1, value: "50" },
          { name: "Юг", pct: 0.2, value: "10" },
        ],
        label: "Регионы",
        type: "bars",
      }
    );
    expect(out).toContain("Выручка: <b>1,2 млн</b> +12 %");
    expect(out).toContain("Заказы: <b>340</b> −3 %\n▁▅█  янв → мар");
    expect(out).toContain("██████░░░░  из 100");
    expect(out).toContain("██████████ Север — 50");
    expect(out).toContain("██░░░░░░░░ Юг — 10");
  });

  it("keeps whole blocks under the limit and says the rest is cut", () => {
    const blocks: LetterBlock[] = Array.from({ length: 10 }, (_, i) => ({
      text: `Абзац ${i} ${"я".repeat(300)}`,
      type: "p" as const,
    }));
    const out = telegramHtml(blocks, { limit: 1000 });
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toContain("Абзац 0");
    expect(out).not.toContain("Абзац 9");
  });

  it("cuts one block that is longer than the limit to plain text", () => {
    const out = telegramHtml(
      [{ runs: [{ b: true, text: "ж".repeat(5000) }], type: "p" }],
      { limit: 500 }
    );
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out).not.toContain("<b>");
  });
});
