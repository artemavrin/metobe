import type { ChatMessage } from "@metobe/contracts/chat";
import { describe, expect, it } from "vitest";

import {
  hitWidth,
  indexAt,
  sideGutter,
  threadMapItems,
  topPercent,
} from "./thread-map";
import type { ThreadRow } from "./thread-rows";

const msg = (role: "user" | "assistant", ...texts: string[]) =>
  ({
    id: `${role}-${texts.join(",")}`,
    parts: [
      ...texts.map((text) => ({ text, type: "text" as const })),
      { type: "step-start" as const },
    ],
    role,
  }) as unknown as ChatMessage;

describe("the thread's map", () => {
  it("has a strip per question, with the words of its answer in one line", () => {
    const rows: ThreadRow[] = [
      { key: "q1", message: msg("user", "Выручка  за\nмарт?"), role: "user" },
      {
        key: "answer:q1",
        live: false,
        message: msg("assistant", "Выручка", "— 1,2 млн"),
        role: "assistant",
      },
      { key: "switch:q2", modelId: "m2", role: "switch" },
      { key: "q2", message: msg("user", "А апрель?"), role: "user" },
      { key: "answer:q2", live: true, role: "assistant" },
    ];
    expect(threadMapItems(rows)).toEqual([
      {
        answer: "Выручка — 1,2 млн",
        answerId: "answer:q1",
        id: "q1",
        question: "Выручка за март?",
      },
      { answer: null, answerId: "answer:q2", id: "q2", question: "А апрель?" },
    ]);
  });

  it("reads an answer's markdown as plain words", () => {
    const rows: ThreadRow[] = [
      { key: "q", message: msg("user", "Топ?"), role: "user" },
      {
        key: "answer:q",
        live: false,
        message: msg(
          "assistant",
          "## Итог\n**Молоко** — `81,8 млн`\n\n| Товар | Доля |\n|---|---:|\n| Изюм | 5% |"
        ),
        role: "assistant",
      },
    ];
    expect(threadMapItems(rows)[0]?.answer).toBe(
      "Итог Молоко — 81,8 млн Товар · Доля Изюм · 5%"
    );
  });

  it("puts the strips from top to bottom and finds the one under the pointer", () => {
    expect([0, 1, 2].map((i) => topPercent(i, 3))).toEqual([0, 50, 100]);
    expect(indexAt(5, 100, 40, 100)).toBe(0);
    expect(indexAt(5, 100, 40, 121)).toBe(2);
    expect(indexAt(5, 100, 40, 500)).toBe(4);
    expect(indexAt(0, 100, 40, 110)).toBeNull();
  });

  it("never reaches into the column of text", () => {
    expect(sideGutter(1400, 896)).toBe(252);
    expect(hitWidth(sideGutter(1400, 896))).toBe(40);
    expect(hitWidth(sideGutter(920, 896))).toBe(0);
  });
});
