import { describe, expect, it } from "vitest";

import { RETOLD_MAX, retoldOf } from "./memory-retold";

const text = (t: string) => ({ text: t, type: "text" });
const tool = (type: string, state = "output-available") => ({ state, type });
const mcp = (toolName: string) => ({
  state: "output-available",
  toolName,
  type: "dynamic-tool",
});

describe("an answer that retells what a tool read (Г1.6а)", () => {
  it("is the words after a mail, web or MCP result", () => {
    expect(
      retoldOf([
        text("Посмотрю почту."),
        tool("tool-email_search"),
        text("Ольга прислала подписанный договор вчера."),
      ])
    ).toBe("Ольга прислала подписанный договор вчера.");
    expect(
      retoldOf([mcp("find_invoice"), text("Счёт №118 оплачен 12 ноября.")])
    ).toBe("Счёт №118 оплачен 12 ноября.");
    expect(retoldOf([tool("tool-web_fetch"), text("Сайт обновлён.")])).toBe(
      "Сайт обновлён."
    );
  });

  it("is nothing without a reading tool: advice, the memory's tools, widgets, a call that did not finish", () => {
    expect(retoldOf([text("Стоит напомнить Ольге про договор.")])).toBeNull();
    expect(
      retoldOf([tool("tool-search_memory"), text("Ольга обещала договор.")])
    ).toBeNull();
    expect(
      retoldOf([tool("tool-show_table"), text("Вот таблица.")])
    ).toBeNull();
    expect(
      retoldOf([tool("tool-email_read", "output-error"), text("Не открылось.")])
    ).toBeNull();
    expect(retoldOf([tool("tool-email_read")])).toBeNull();
  });

  it("is cut at its limit", () => {
    const long = "а".repeat(RETOLD_MAX + 50);
    expect(retoldOf([tool("tool-email_read"), text(long)])).toHaveLength(
      RETOLD_MAX
    );
  });
});
