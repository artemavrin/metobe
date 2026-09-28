import { generateText, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { MAX_STEPS, lastStepAnswers } from "./steps";

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};

describe("the last step of an answer", () => {
  it("answers in words instead of calling tools forever", async () => {
    // A model that calls a tool whenever it may, and answers only when it cannot.
    const model = new MockLanguageModelV4({
      doGenerate: (options) =>
        Promise.resolve(
          (options.tools ?? []).length > 0
            ? {
                content: [
                  {
                    input: "{}",
                    toolCallId: `c${Math.random()}`,
                    toolName: "look",
                    type: "tool-call",
                  },
                ],
                finishReason: { raw: undefined, unified: "tool-calls" },
                usage,
                warnings: [],
              }
            : {
                content: [{ text: "Вот что удалось найти.", type: "text" }],
                finishReason: { raw: undefined, unified: "stop" },
                usage,
                warnings: [],
              }
        ),
    });
    const result = await generateText({
      instructions: "Сервисы чата: …",
      model,
      prepareStep: lastStepAnswers,
      prompt: "у кого скоро день рождения",
      stopWhen: isStepCount(MAX_STEPS),
      tools: {
        look: tool({
          execute: () => ({ found: false }),
          inputSchema: z.object({}),
        }),
      },
    });
    expect(model.doGenerateCalls).toHaveLength(MAX_STEPS);
    const last = model.doGenerateCalls.at(-1);
    expect(last?.tools ?? []).toEqual([]);
    expect(JSON.stringify(last?.prompt)).toContain("No more tool calls");
    expect(JSON.stringify(last?.prompt)).toContain("Сервисы чата");
    expect(result.text).toBe("Вот что удалось найти.");
  });

  it("leaves the steps before it alone", () => {
    expect(
      lastStepAnswers({ instructions: undefined, stepNumber: 0 })
    ).toBeUndefined();
    expect(
      lastStepAnswers({ instructions: undefined, stepNumber: MAX_STEPS - 2 })
    ).toBeUndefined();
  });
});
