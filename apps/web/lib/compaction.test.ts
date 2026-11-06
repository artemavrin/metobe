import type { ChatMessage } from "@metobe/contracts/chat";
import { describe, expect, it } from "vitest";

import { fromCompaction, HEAVY_STEP_TOKENS, heavyAnswer } from "./compaction";

const user = (id: string): ChatMessage => ({
  id,
  parts: [{ text: `вопрос ${id}`, type: "text" }],
  role: "user",
});
const answer = (id: string, stepTokens?: number): ChatMessage => ({
  id,
  metadata: stepTokens === undefined ? {} : { stepTokens },
  parts: [{ text: `ответ ${id}`, type: "text" }],
  role: "assistant",
});
const compaction = (id: string, summary: string): ChatMessage => ({
  id,
  parts: [{ data: { messages: 6, summary }, type: "data-compaction" }],
  role: "system",
});

describe("what the model is sent after a compaction", () => {
  it("is the summary first, then what came after it — nothing before", () => {
    const sent = fromCompaction([
      user("q1"),
      answer("a1"),
      compaction("s1", "итог"),
      user("q2"),
    ]);
    expect(sent).toHaveLength(2);
    expect(sent[0]?.role).toBe("user");
    expect(JSON.stringify(sent[0]?.parts)).toContain("итог");
    expect(sent[1]?.id).toBe("q2");
  });

  it("goes from the last of several compactions", () => {
    const sent = fromCompaction([
      compaction("s1", "первый"),
      user("q1"),
      compaction("s2", "второй"),
      user("q2"),
    ]);
    expect(JSON.stringify(sent[0]?.parts)).toContain("второй");
    expect(sent.map((m) => m.id)).toEqual(["summary-s2", "q2"]);
  });

  it("is the history as it is when it was never compacted", () => {
    const history = [user("q1"), answer("a1")];
    expect(fromCompaction(history)).toEqual(history);
  });
});

describe("when the chat offers to compact", () => {
  const heavy = HEAVY_STEP_TOKENS + 1;
  const long = [user("q1"), answer("a1"), user("q2"), answer("a2"), user("q3")];

  it("after a heavy answer in a chat of a few questions — by that answer's id", () => {
    expect(heavyAnswer([...long, answer("a3", heavy)])).toBe("a3");
  });

  it("not after a light answer, nor in a short chat", () => {
    expect(heavyAnswer([...long, answer("a3", 1000)])).toBe(null);
    expect(heavyAnswer([user("q1"), answer("a1", heavy)])).toBe(null);
  });

  it("not right after a compaction, until enough is asked again", () => {
    expect(
      heavyAnswer([
        ...long,
        compaction("s1", "итог"),
        user("q4"),
        answer("a4", heavy),
      ])
    ).toBe(null);
  });
});
