import type { ChatMessage } from "@metobe/contracts/chat";
import { convertToModelMessages, generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};

const model = () =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ text: "ok", type: "text" }],
      finishReason: { raw: "stop", unified: "stop" },
      usage,
      warnings: [],
    },
  });

// An answer cut off while a tool ran: its call was stored with no result (state `input-available`).
const history = (): ChatMessage[] => [
  {
    id: "u1",
    parts: [{ text: "How many clients?", type: "text" }],
    role: "user",
  },
  {
    id: "a1",
    parts: [
      {
        input: { query: "select 1" },
        state: "input-available",
        toolCallId: "call-1",
        toolName: "run_query",
        type: "dynamic-tool",
      },
    ],
    role: "assistant",
  },
  { id: "u2", parts: [{ text: "Try again", type: "text" }], role: "user" },
];

describe("a tool call that never got its result", () => {
  it("breaks every later question when it is sent to the model", async () => {
    const messages = await convertToModelMessages(history());
    await expect(generateText({ messages, model: model() })).rejects.toThrow(
      /Tool result is missing/u
    );
  });

  it("is left out of the history, so the chat goes on", async () => {
    const messages = await convertToModelMessages(history(), {
      ignoreIncompleteToolCalls: true,
    });
    expect(JSON.stringify(messages)).not.toContain("call-1");
    const { text } = await generateText({ messages, model: model() });
    expect(text).toBe("ok");
  });
});
