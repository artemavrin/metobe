import type { ModelMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { reportedCostOf, sumUsage, withPromptCache } =
  await import("./chat-run");

const chat: ModelMessage[] = [
  { content: "Первый вопрос", role: "user" },
  { content: "Ответ", role: "assistant" },
  { content: "Второй вопрос", role: "user" },
];

describe("withPromptCache", () => {
  it("marks the newest message for Anthropic and leaves the history as it was", () => {
    const { messages, providerOptions } = withPromptCache("anthropic", chat);
    expect(providerOptions).toBeUndefined();
    expect(messages.slice(0, -1)).toEqual(chat.slice(0, -1));
    expect(messages.at(-1)?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
    // The input is not touched: the stored history stays byte for byte the same.
    expect(chat.at(-1)?.providerOptions).toBeUndefined();
  });

  it("asks the Gateway to cache by itself", () => {
    expect(withPromptCache("gateway", chat)).toEqual({
      messages: chat,
      providerOptions: { gateway: { caching: "auto" } },
    });
  });

  it("leaves sources that cache a repeated prefix on their own", () => {
    for (const kind of ["openai", "yandex", "openai-compatible"] as const) {
      expect(withPromptCache(kind, chat)).toEqual({ messages: chat });
    }
  });
});

describe("what an answer with tools cost", () => {
  it("sums the Gateway's cost over every step, not only the last", () => {
    expect(
      reportedCostOf([
        { gateway: { cost: "0.0125" } },
        { gateway: { cost: 0.03 } },
        { gateway: { cost: "0.005" } },
      ])
    ).toBe(String(0.0125 + 0.03 + 0.005));
  });

  it("skips a step that reported nothing, and says nothing when none did", () => {
    expect(reportedCostOf([{ gateway: { cost: "0.01" } }, undefined, {}])).toBe(
      "0.01"
    );
    expect(reportedCostOf([undefined, {}])).toBeNull();
    expect(reportedCostOf([])).toBeNull();
  });
});

const step = (input: number, cacheRead: number, output: number) =>
  ({
    inputTokenDetails: {
      cacheReadTokens: cacheRead,
      cacheWriteTokens: 0,
      noCacheTokens: input - cacheRead,
    },
    inputTokens: input,
    outputTokenDetails: { reasoningTokens: undefined, textTokens: output },
    outputTokens: output,
    raw: undefined,
    totalTokens: input + output,
  }) as Parameters<typeof sumUsage>[0][number];

describe("the tokens of the finished steps", () => {
  it("adds them up, cache split included", () => {
    const total = sumUsage([step(1000, 800, 50), step(1200, 1000, 70)]);
    expect(total.inputTokens).toBe(2200);
    expect(total.outputTokens).toBe(120);
    expect(total.inputTokenDetails.cacheReadTokens).toBe(1800);
    expect(total.inputTokenDetails.noCacheTokens).toBe(400);
  });

  it("keeps «unknown» unknown", () => {
    expect(sumUsage([]).inputTokens).toBeUndefined();
  });
});
