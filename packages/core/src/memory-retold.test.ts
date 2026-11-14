import { describe, expect, it } from "vitest";

import type { OpenCommitment } from "./memory-extract";
import {
  RETOLD_MAX,
  retoldOf,
  retoldPrompt,
  retoldStatuses,
} from "./memory-retold";

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

const open = (ref: string, status: OpenCommitment["status"] = "open") => ({
  due: null,
  id: `id-${ref}`,
  ref,
  status,
  text: ref,
});

describe("what it may change", () => {
  const commitments = [open("k1"), open("k2", "unconfirmed"), open("k3")];

  it("sets «ждёт проверки» on an open commitment it shows done, with the words that say so", () => {
    expect(
      retoldStatuses(
        {
          settled: [
            { evidence: "договор пришёл", ref: "k1" },
            { evidence: "договор пришёл", ref: " k1 " },
          ],
        },
        commitments
      )
    ).toEqual([{ recordId: "id-k1", status: "unconfirmed" }]);
  });

  it("leaves one already said to be done, one the person's words settle, an unknown ref and one with no words", () => {
    expect(
      retoldStatuses(
        {
          settled: [
            { evidence: "готово", ref: "k2" },
            { evidence: "готово", ref: "k3" },
            { evidence: "готово", ref: "k9" },
            { evidence: " ", ref: "k1" },
          ],
        },
        commitments,
        new Set(["id-k3"])
      )
    ).toEqual([]);
  });

  it("shows the model the commitments, the request and the answer", () => {
    expect(
      retoldPrompt({
        commitments: [open("k1")],
        message: "Пришёл договор от Ольги?",
        retold: "Да, пришёл вчера.",
        today: "Friday, 13 November 2026 (2026-11-13)",
      })
    ).toBe(
      "Today is Friday, 13 November 2026 (2026-11-13).\n\nOpen commitments (ref: text):\n- k1: k1\n\n<request>\nПришёл договор от Ольги?\n</request>\n<answer>\nДа, пришёл вчера.\n</answer>"
    );
  });
});
