import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  budgetMessages,
  capOf,
  estimateTokens,
  isContextOverflow,
  triggerOf,
} from "./context-budget";

// Text of a given size in tokens by the module's own guess (3 characters a token).
const big = (tokens: number) => "я".repeat(tokens * 3);

const user = (text: string): ModelMessage => ({ content: text, role: "user" });
const call = (id: string, name = "run_query"): ModelMessage => ({
  content: [
    { input: { q: id }, toolCallId: id, toolName: name, type: "tool-call" },
  ],
  role: "assistant",
});
const result = (
  id: string,
  tokens: number,
  name = "run_query"
): ModelMessage => ({
  content: [
    {
      output: { type: "text", value: big(tokens) },
      toolCallId: id,
      toolName: name,
      type: "tool-result",
    },
  ],
  role: "tool",
});
const answer = (text: string): ModelMessage => ({
  content: [{ text, type: "text" }],
  role: "assistant",
});

/** A chat of `n` questions, each with a tool result of `tokens`. */
const chat = (n: number, tokens: number) =>
  Array.from({ length: n }, (_, i) => [
    user(`вопрос ${i}`),
    call(`c${i}`),
    result(`c${i}`, tokens),
    answer(`ответ ${i}`),
  ]).flat();

const outputs = (messages: ModelMessage[]) =>
  messages.flatMap((m) =>
    Array.isArray(m.content)
      ? m.content.flatMap((p) =>
          p.type === "tool-result"
            ? [(p.output as { value: string }).value]
            : []
        )
      : []
  );
const cleared = (messages: ModelMessage[]) =>
  outputs(messages).filter((o) => o.startsWith("[The result of"));

const calls = (ms: ModelMessage[]) =>
  ms.flatMap((m) =>
    Array.isArray(m.content)
      ? m.content.filter((p) => p.type === "tool-call")
      : []
  );

describe("where the limits stand", () => {
  it("takes Anthropic's defaults for a window that is not known, and a share of a small one", () => {
    expect(triggerOf(null)).toBe(100_000);
    expect(capOf(null)).toBe(25_000);
    expect(triggerOf(8000)).toBe(4000);
    expect(capOf(8000)).toBe(2000);
    // A big window does not raise them: 100k is where the model stops recalling well, not where it stops fitting.
    expect(triggerOf(1_000_000)).toBe(100_000);
  });
});

describe("a short chat", () => {
  it("is sent as it is", () => {
    const messages = chat(3, 500);
    expect(budgetMessages(messages, { window: null })).toBe(messages);
  });
});

describe("a tool's response over the cap", () => {
  it("is cut, and the model is told how to get the rest", () => {
    const messages = [user("дай"), call("a"), result("a", 40_000)];
    const [text] = outputs(budgetMessages(messages, { window: null }));
    expect(text?.length).toBeLessThan(big(26_000).length);
    expect(text).toContain("Truncated: the first 75000 of 120000 characters");
    expect(text).toContain("Narrow the request");
  });

  it("leaves a response under the cap alone", () => {
    const messages = [user("дай"), call("a"), result("a", 20_000)];
    expect(outputs(budgetMessages(messages, { window: null }))).toEqual(
      outputs(messages)
    );
  });

  it("keeps an error an error", () => {
    const errored: ModelMessage = {
      content: [
        {
          output: { type: "error-text", value: big(40_000) },
          toolCallId: "e",
          toolName: "x",
          type: "tool-result",
        },
      ],
      role: "tool",
    };
    const out = budgetMessages([user("q"), call("e", "x"), errored], {
      window: null,
    });
    const content = out[2]?.content as { output: { type: string } }[];
    expect(content[0]?.output.type).toBe("error-text");
  });
});

describe("a long chat", () => {
  // 12 questions with 20k-token results: 240k tokens of results against a 100k trigger.
  const long = chat(12, 20_000);

  it("keeps the last three results whole and clears the older ones", () => {
    const out = budgetMessages(long, { window: null });
    const all = outputs(out);
    expect(cleared(out).length).toBeGreaterThan(0);
    expect(all.slice(-3).every((o) => !o.startsWith("[The result of"))).toBe(
      true
    );
    expect(estimateTokens(out)).toBeLessThan(estimateTokens(long) / 2);
  });

  it("leaves what was asked and what was answered as it was, and every call", () => {
    const out = budgetMessages(long, { window: null });
    expect(out.map((m) => m.role)).toEqual(long.map((m) => m.role));
    expect(out.filter((m) => m.role === "user")).toEqual(
      long.filter((m) => m.role === "user")
    );
    expect(calls(out)).toEqual(calls(long));
  });

  it("names the tool in the note and says how to get the data back", () => {
    const [first] = cleared(budgetMessages(long, { window: null }));
    expect(first).toContain("run_query");
    expect(first).toContain("Call run_query again");
  });

  it("does not touch the messages it was given", () => {
    const before = JSON.stringify(long);
    budgetMessages(long, { window: null });
    expect(JSON.stringify(long)).toBe(before);
  });

  it("gives the same prompt for the same history, and is idempotent", () => {
    const once = budgetMessages(long, { window: null });
    expect(budgetMessages(long, { window: null })).toEqual(once);
    expect(budgetMessages(once, { window: null })).toEqual(once);
  });

  it("does not change what is cleared when a question with no tools is added — the cache stays", () => {
    const now = budgetMessages(long, { window: null });
    const next = budgetMessages(
      [...long, user("ещё вопрос"), answer("ещё ответ")],
      { window: null }
    );
    expect(next.slice(0, now.length)).toEqual(now);
  });

  it("moves the cut forward only when a new tool result comes", () => {
    const now = cleared(budgetMessages(long, { window: null })).length;
    const more = cleared(
      budgetMessages([...long, ...chat(1, 20_000)], { window: null })
    ).length;
    expect(more).toBeGreaterThanOrEqual(now);
  });
});

describe("what does not apply", () => {
  it("does not clear results too small to be worth breaking the cache for", () => {
    // Many results, each under the smallest worth clearing: the history is over the trigger by words alone.
    const messages = [...chat(30, 400), user("а ещё"), answer(big(101_000))];
    expect(cleared(budgetMessages(messages, { window: null }))).toEqual([]);
  });

  it("does not clear when it would free less than the least", () => {
    const messages = [
      user("q"),
      call("a"),
      result("a", 2000),
      answer(big(101_000)),
    ];
    expect(budgetMessages(messages, { window: null })).toBe(messages);
  });

  it("works on a small window: 8k clears from 4k", () => {
    const messages = chat(6, 1500);
    const out = budgetMessages(messages, { window: 8000 });
    expect(estimateTokens(out)).toBeLessThan(estimateTokens(messages));
    expect(cleared(out).length).toBeGreaterThan(0);
  });
});

describe("a provider's «does not fit» error", () => {
  it("is known by its meaning, whatever its words", () => {
    for (const text of [
      "This model's maximum context length is 128000 tokens",
      "prompt is too long: 250000 tokens > 200000 maximum",
      "the request exceeds the available context size (8192 tokens)",
      "Input is too long for requested model",
      "context_length_exceeded",
    ]) {
      expect(isContextOverflow(new Error(text))).toBe(true);
    }
  });

  it("finds it down the cause chain and in the response body", () => {
    const inner = Object.assign(new Error("Bad Request"), {
      responseBody: '{"error":{"type":"exceed_context_size_error"}}',
    });
    expect(isContextOverflow(new Error("call failed", { cause: inner }))).toBe(
      true
    );
  });

  it("does not take another error for it", () => {
    expect(isContextOverflow(new Error("401 invalid api key"))).toBe(false);
    expect(isContextOverflow("nope")).toBe(false);
  });
});
