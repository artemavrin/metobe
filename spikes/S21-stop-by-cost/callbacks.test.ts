import { isStepCount, streamText, tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { mockModel } from "./mock-model";
import type { Act } from "./mock-model";

// Which of `streamText`'s callbacks fire, and with what, when an answer fails or is stopped on its third step —
// as `ai@7.0.173` does it, not as its docs say. The route's rows of `model_runs` hang on exactly this.

const probe = async (act: Act, abortOnThird = false) => {
  const events: string[] = [];
  const controller = new AbortController();
  const result = streamText({
    abortSignal: controller.signal,
    messages: [{ content: "?", role: "user" }],
    model: mockModel({
      gateway: true,
      onCall: (n) => {
        if (abortOnThird && n === 2) {
          controller.abort();
        }
      },
      script: ["tool", "tool", act],
    }),
    onAbort: ({ steps }) => {
      events.push(`onAbort steps=${steps.length}`);
    },
    onEnd: ({ steps, totalUsage }) => {
      events.push(
        `onEnd steps=${steps.length} totalUsage.input=${totalUsage.inputTokens ?? "undefined"} sumOfSteps.input=${steps.reduce((a, s) => a + (s.usage.inputTokens ?? 0), 0)}`
      );
    },
    onError: () => {
      events.push("onError");
    },
    onStepEnd: (step) => {
      events.push(
        `onStepEnd finish=${step.finishReason} cost=${String(step.providerMetadata?.gateway?.cost ?? "-")}`
      );
    },
    onStepError: () => {
      events.push("onStepError");
    },
    stopWhen: isStepCount(10),
    tools: {
      look: tool({
        execute: () => ({ ok: true }),
        inputSchema: z.object({ q: z.string() }),
      }),
    },
  });
  await result.consumeStream({
    onError: () => {
      events.push("stream error");
    },
  });
  // Let the callbacks that run after the stream settle.
  await new Promise((r) => setTimeout(r, 20));
  return events;
};

describe("streamText callbacks on the third step of three", () => {
  it("prints what fires", async () => {
    const table: Record<string, string[]> = {};
    for (const act of ["text", "throw", "error-chunk", "break"] as Act[]) {
      table[act] = await probe(act);
    }
    table["abort"] = await probe("text", true);
    console.log(JSON.stringify(table, null, 2));

    // A clean answer: three steps, the total is their sum.
    expect(table.text?.at(-1)).toMatch(/^onEnd steps=3 /u);
    // A call that rejects: onStepError, onError — and then onEnd with the two finished steps, whose `totalUsage` is empty.
    expect(table.throw).toEqual(
      expect.arrayContaining(["onStepError", "onError"])
    );
    expect(table.throw?.at(-1)).toMatch(
      /^onEnd steps=2 totalUsage.input=undefined sumOfSteps.input=\d+/u
    );
    // An `error` chunk: the step ends normally (finish=error, with its cost), onError, onEnd with three steps.
    expect(table["error-chunk"]?.[2]).toBe("onError");
    expect(table["error-chunk"]?.[3]).toMatch(
      /^onStepEnd finish=error cost=0\.\d+$/u
    );
    expect(table["error-chunk"]?.at(-1)).toMatch(/^onEnd steps=3 /u);
    // A stream that breaks off in the middle of a step: onStepError only — no onError, no onEnd, no onAbort.
    expect(table.break).toEqual([
      expect.stringMatching(/^onStepEnd finish=tool-calls/u),
      expect.stringMatching(/^onStepEnd finish=tool-calls/u),
      "onStepError",
      "stream error",
    ]);
    // «Stop»: onAbort with the two finished steps, no onEnd.
    expect(table.abort?.at(-1)).toBe("onAbort steps=2");
  });
});
