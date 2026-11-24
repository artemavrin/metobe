import { simulateReadableStream, stepCountIs, streamText, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ChatModel } from "./chat";

// One row of `model_runs` per pass, with what its finished steps cost, whatever way the pass ended (S21). The rows go
// to an array instead of the database: `getDb` is replaced, `recordRun` itself counts the cost as it does for real.

vi.mock("server-only", () => ({}));

const rows: Record<string, unknown>[] = [];
vi.mock("./db", () => ({
  getDb: () => ({
    db: {
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          rows.push(row);
          return Promise.resolve();
        },
      }),
    },
  }),
}));

const { passRun, recordRun } = await import("./chat-run");

/** $3 / $15 per 1M tokens: a step of 1000 in and 100 out costs 0.0045. */
const model = {
  id: "model-test",
  priceCacheRead: null,
  priceCacheWrite: null,
  priceCurrency: "USD",
  priceInput: "3",
  priceOutput: "15",
  priceUnitTokens: 1_000_000,
} as unknown as ChatModel;
const STEP_COST = 0.0045;

type Act = "tool" | "text" | "throw" | "break" | "error-chunk";

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1000, total: 1000 },
  outputTokens: { reasoning: 0, text: 100, total: 100 },
};

/** A model that does what the script says on each call; with `gateway`, it reports each step's cost as the Gateway does. */
const scripted = (
  script: Act[],
  gateway: boolean,
  onCall?: (n: number) => void
) => {
  let n = 0;
  return new MockLanguageModelV4({
    doStream: () => {
      const call = n;
      n += 1;
      onCall?.(call);
      const act = script[Math.min(call, script.length - 1)] as Act;
      if (act === "throw") {
        return Promise.reject(new Error("provider down"));
      }
      const providerMetadata = gateway
        ? { gateway: { cost: String(STEP_COST) } }
        : undefined;
      const words = [
        { id: "t", type: "text-start" as const },
        { delta: `Ответ ${call}`, id: "t", type: "text-delta" as const },
      ];
      if (act === "break") {
        // Words, then the connection drops: no `finish`, no usage.
        const stream = new ReadableStream({
          start(controller) {
            for (const c of [
              { type: "stream-start", warnings: [] },
              ...words,
            ]) {
              controller.enqueue(c);
            }
            setTimeout(() => controller.error(new Error("socket hang up")), 5);
          },
        });
        return Promise.resolve({ stream });
      }
      const chunks: unknown[] = [{ type: "stream-start", warnings: [] }];
      if (act === "tool") {
        chunks.push({
          input: JSON.stringify({ q: `step ${call}` }),
          toolCallId: `call-${call}`,
          toolName: "look",
          type: "tool-call",
        });
      } else {
        chunks.push(...words, { id: "t", type: "text-end" });
      }
      if (act === "error-chunk") {
        chunks.push({ error: new Error("overloaded"), type: "error" });
      }
      const finishReason = {
        "error-chunk": { raw: "error", unified: "error" },
        text: { raw: "end_turn", unified: "stop" },
        tool: { raw: "tool_use", unified: "tool-calls" },
      }[act];
      chunks.push({
        finishReason,
        providerMetadata,
        type: "finish",
        usage,
      });
      return Promise.resolve({
        stream: simulateReadableStream({
          chunkDelayInMs: 1,
          chunks: chunks as never[],
        }),
      });
    },
  });
};

/** Two steps with a tool, then the third as the script says — recorded the way the chat route records a pass. */
const answer = async (
  third: Act,
  { gateway, abort = false }: { gateway: boolean; abort?: boolean }
) => {
  rows.length = 0;
  const controller = new AbortController();
  const pass = passRun();
  const result = streamText({
    abortSignal: controller.signal,
    messages: [{ content: "?", role: "user" }],
    model: scripted(["tool", "tool", third], gateway, (n) => {
      if (abort && n === 2) {
        controller.abort();
      }
    }),
    ...pass.callbacks,
    stopWhen: stepCountIs(10),
    tools: {
      look: tool({
        execute: () => ({ ok: true }),
        inputSchema: z.object({ q: z.string() }),
      }),
    },
  });
  await pass.settle(result, (run) =>
    recordRun({ chatId: null, latencyMs: null, model, userId: "u", ...run })
  );
  return rows.map((r) => ({
    cost: r.cost === null ? null : Number(Number(r.cost).toFixed(6)),
    inputTokens: r.inputTokens,
    status: r.status,
  }));
};

const costOf = (steps: number) => Number((STEP_COST * steps).toFixed(6));

describe("a pass writes one row with what its finished steps cost", () => {
  for (const gateway of [true, false]) {
    const by = gateway ? "the Gateway's cost" : "the source's prices";

    it(`an answer that ends in words (${by})`, async () => {
      const written = await answer("text", { gateway });
      expect(written).toEqual([
        { cost: costOf(3), inputTokens: 3000, status: "ok" },
      ]);
    });

    it(`a stream that breaks off in the middle of a step (${by})`, async () => {
      // ai@7 fires only `onStepError` here: no onError, no onEnd, no onAbort — the row used to be lost.
      const written = await answer("break", { gateway });
      expect(written).toEqual([
        { cost: costOf(2), inputTokens: 2000, status: "error" },
      ]);
    });

    it(`a provider call that rejects (${by})`, async () => {
      // ai@7 fires onError and then onEnd with an empty `totalUsage`: two rows used to be written, the priced one at 0.
      const written = await answer("throw", { gateway });
      expect(written).toEqual([
        { cost: costOf(2), inputTokens: 2000, status: "error" },
      ]);
    });

    it(`a provider's error chunk (${by})`, async () => {
      // The step ends with its usage; onError and onEnd both fire.
      const written = await answer("error-chunk", { gateway });
      expect(written).toEqual([
        { cost: costOf(3), inputTokens: 3000, status: "error" },
      ]);
    });

    it(`«stop» in the middle of the third step (${by})`, async () => {
      const written = await answer("text", { abort: true, gateway });
      expect(written).toEqual([
        { cost: costOf(2), inputTokens: 2000, status: "aborted" },
      ]);
    });
  }
});

describe("a caller that writes the row itself (tasks, Telegram)", () => {
  it("still has the finished steps when the stream breaks off and `result.steps` rejects", async () => {
    const pass = passRun();
    const result = streamText({
      messages: [{ content: "?", role: "user" }],
      model: scripted(["tool", "tool", "break"], false),
      onError: () => {},
      onStepEnd: pass.callbacks.onStepEnd,
      stopWhen: stepCountIs(10),
      tools: {
        look: tool({
          execute: () => ({ ok: true }),
          inputSchema: z.object({ q: z.string() }),
        }),
      },
    });
    await result.consumeStream({ onError: () => {} });
    await expect(result.steps).rejects.toThrow("socket hang up");
    const kept = pass.run();
    expect(kept.stepsMetadata).toHaveLength(2);
    expect(kept.usage?.inputTokens).toBe(2000);
    expect(kept.usage?.outputTokens).toBe(200);
  });
});
