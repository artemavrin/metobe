import type { ChatMessage } from "@metobe/contracts/chat";
import { describe, expect, it } from "vitest";

import {
  chunksOf,
  compactInstructions,
  lastCompaction,
  summaryForModel,
  transcriptOf,
} from "./compact-transcript";

const user = (id: string, text: string): ChatMessage => ({
  id,
  parts: [{ text, type: "text" }],
  role: "user",
});

const answer = (id: string, parts: ChatMessage["parts"]): ChatMessage => ({
  id,
  parts,
  role: "assistant",
});

const compaction = (id: string, summary: string): ChatMessage => ({
  id,
  parts: [{ data: { messages: 4, summary }, type: "data-compaction" }],
  role: "system",
});

const query = {
  dynamic: true,
  input: { query: "ВЫБРАТЬ Сумма ИЗ Продажи" },
  output: { rows: Array.from({ length: 500 }, (_, i) => ({ i })) },
  state: "output-available",
  toolCallId: "c1",
  toolName: "run_query",
  type: "dynamic-tool",
} as ChatMessage["parts"][number];

describe("what the service model reads", () => {
  it("has the user's words, the answers and every call with its arguments", () => {
    const { blocks, earlier } = transcriptOf([
      user("q1", "Выручка за март"),
      answer("a1", [query, { text: "41,2 млн ₽", type: "text" }]),
    ]);
    expect(earlier).toBe(null);
    expect(blocks[0]).toBe("User:\nВыручка за март");
    expect(blocks[1]).toContain(
      '[run_query({"query":"ВЫБРАТЬ Сумма ИЗ Продажи"})'
    );
    expect(blocks[1]).toContain("41,2 млн ₽");
  });

  it("keeps only the head of a big result, and says how much is left out", () => {
    const { blocks } = transcriptOf([user("q1", "x"), answer("a1", [query])]);
    expect(blocks[1]?.length).toBeLessThan(2000);
    expect(blocks[1]).toMatch(/more characters\]/u);
  });

  it("leaves the reasoning out", () => {
    const { blocks } = transcriptOf([
      user("q1", "x"),
      answer("a1", [
        { state: "done", text: "долго думаю", type: "reasoning" },
        { text: "ответ", type: "text" },
      ]),
    ]);
    expect(blocks.join(",")).not.toContain("долго думаю");
  });

  it("starts from the last compaction: its summary first, then what came after it", () => {
    const history = [
      user("q1", "старое"),
      compaction("s1", "итог 1"),
      user("q2", "новое"),
    ];
    expect(lastCompaction(history)).toBe(1);
    const { blocks, earlier } = transcriptOf(history);
    expect(earlier).toBe("итог 1");
    expect(blocks).toEqual(["User:\nновое"]);
  });
});

describe("a long chat read in parts", () => {
  it("puts blocks together up to the size, and a part never empty", () => {
    const chunks = chunksOf(
      ["a".repeat(40), "b".repeat(40), "c".repeat(40)],
      90
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("a");
    expect(chunks[0]).toContain("b");
    expect(chunks[1]).toBe("c".repeat(40));
  });

  it("clips a block bigger than a part", () => {
    const [only] = chunksOf(["x".repeat(500)], 100);
    expect(only?.startsWith("x".repeat(100))).toBe(true);
    expect(only).toMatch(/more characters\]/u);
  });
});

describe("what the chat model is told", () => {
  it("is the summary inside its tag, said to be the earlier conversation", () => {
    const text = summaryForModel("**Цель.** Отчёт");
    expect(text).toMatch(/^<conversation-summary>/u);
    expect(text).toContain("**Цель.** Отчёт");
  });
});

describe("the summary's sections", () => {
  it("are named in the user's language", () => {
    const ru = compactInstructions("ru");
    expect(ru).toContain("1. Цель —");
    expect(ru).toContain("6. Сообщения пользователя —");
    expect(ru).not.toContain("1. Goal");
    expect(compactInstructions("en")).toContain("1. Goal —");
  });
});
