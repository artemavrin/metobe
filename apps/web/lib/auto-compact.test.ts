import type { ChatMessage } from "@metobe/contracts/chat";
import { describe, expect, it, vi } from "vitest";

import { autoCompactAt, compactBeforeAnswer } from "./auto-compact";

const user = (id: string): ChatMessage => ({
  id,
  parts: [{ text: `вопрос ${id}`, type: "text" }],
  role: "user",
});
const answer = (id: string): ChatMessage => ({
  id,
  parts: [{ text: `ответ ${id}`, type: "text" }],
  role: "assistant",
});
const summary: ChatMessage = {
  id: "s",
  parts: [{ data: { messages: 8, summary: "итог" }, type: "data-compaction" }],
  role: "system",
};

/** A chat of `n` answered questions and the question asked now. */
const thread = (n: number) => [
  ...Array.from({ length: n }, (_, i) => [
    user(`q${i}`),
    answer(`a${i}`),
  ]).flat(),
  user("now"),
];

describe("where the chat compacts by itself", () => {
  it("is half the model's window, at most 100k tokens", () => {
    expect(autoCompactAt(64_000)).toBe(32_000);
    expect(autoCompactAt(1_000_000)).toBe(100_000);
  });

  it("is 100k for a model whose window is not known", () => {
    expect(autoCompactAt(null)).toBe(100_000);
  });
});

describe("compacting before an answer", () => {
  it("compacts the history before the question when what is sent is over the line", async () => {
    const compact = vi.fn(() => Promise.resolve(summary));
    const got = await compactBeforeAnswer({
      compact,
      thread: thread(4),
      tokens: 150_000,
      window: null,
    });
    expect(got).toBe(summary);
    // The question asked now is not in what is compacted: it is answered from the summary.
    expect(compact).toHaveBeenCalledWith(thread(4).slice(0, -1));
  });

  it("does not compact under the line", async () => {
    const compact = vi.fn(() => Promise.resolve(summary));
    const got = await compactBeforeAnswer({
      compact,
      thread: thread(4),
      tokens: 90_000,
      window: null,
    });
    expect(got).toBeNull();
    expect(compact).not.toHaveBeenCalled();
  });

  it("goes by the model's window", async () => {
    const compact = vi.fn(() => Promise.resolve(summary));
    await compactBeforeAnswer({
      compact,
      thread: thread(4),
      tokens: 40_000,
      window: 64_000,
    });
    expect(compact).toHaveBeenCalledOnce();
  });

  it("does not compact again until a few questions were asked after the last compaction", async () => {
    const compact = vi.fn(() => Promise.resolve(summary));
    const after = [
      ...thread(4).slice(0, -1),
      summary,
      user("q5"),
      answer("a5"),
      user("now"),
    ];
    const got = await compactBeforeAnswer({
      compact,
      thread: after,
      tokens: 150_000,
      window: null,
    });
    expect(got).toBeNull();
    expect(compact).not.toHaveBeenCalled();
  });

  it("lets the answer go on when the compaction fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => null);
    const got = await compactBeforeAnswer({
      compact: () => Promise.reject(new Error("the service model is down")),
      thread: thread(4),
      tokens: 150_000,
      window: null,
    });
    expect(got).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
