import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { costOf } from "../../packages/core/src/pricing";
import type { Prices } from "../../packages/core/src/pricing";

// A model that never goes to the network: its tokens are counted from the prompt it gets (≈ 4 characters a
// token), so the history growing step by step makes each step dearer, as it does for real. In Gateway mode it
// reports `providerMetadata.gateway.cost` the way the Gateway does — a decimal string per step.

/** $3 / $15 per 1M tokens, cache read $0.30 — a mid-size model, for the numbers in the README. */
export const PRICES: Prices = {
  cacheRead: "0.3",
  cacheWrite: "3.75",
  input: "3",
  output: "15",
  unitTokens: 1_000_000,
};

export type Act =
  /** Calls `tool` (when the step has tools), else answers in words. */
  | "tool"
  /** Answers in words. */
  | "text"
  /** The provider call rejects: no step result. */
  | "throw"
  /** The stream ends on a provider's `error` chunk after some words, with usage. */
  | "error-chunk"
  /** The stream breaks off after some words: no `finish`, no usage. */
  | "break";

export const tokensOf = (prompt: unknown) =>
  Math.ceil(JSON.stringify(prompt).length / 4);

export const mockModel = ({
  script,
  gateway,
  tool = "look",
  outputTokens = 60,
  textOutputTokens = 150,
  onCall,
}: {
  /** What each call does, by its number; past the end — the last one again. */
  script: Act[];
  /** Report the cost in `providerMetadata.gateway.cost` (true) or leave it to the prices (false). */
  gateway: boolean;
  tool?: string;
  outputTokens?: number;
  textOutputTokens?: number;
  onCall?: (n: number) => void;
}) => {
  let n = 0;
  return new MockLanguageModelV4({
    doStream: (options) => {
      const act = script[Math.min(n, script.length - 1)] as Act;
      const call = n;
      n += 1;
      onCall?.(call);
      if (act === "throw") {
        return Promise.reject(new Error(`provider down on call ${call}`));
      }
      const input = tokensOf(options.prompt);
      const hasTools = (options.tools ?? []).length > 0;
      const callsTool = act === "tool" && hasTools;
      const output = callsTool ? outputTokens : textOutputTokens;
      const usage = {
        inputTokens: {
          cacheRead: 0,
          cacheWrite: 0,
          noCache: input,
          total: input,
        },
        outputTokens: { reasoning: 0, text: output, total: output },
      };
      const cost = costOf(
        {
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          inputTokens: input,
          outputTokens: output,
        },
        PRICES
      ) as string;
      const providerMetadata = gateway ? { gateway: { cost } } : undefined;
      const words = [
        { id: "t", type: "text-start" as const },
        { delta: `Ответ ${call}`, id: "t", type: "text-delta" as const },
      ];
      const chunks: unknown[] = [{ type: "stream-start", warnings: [] }];
      if (callsTool) {
        chunks.push({
          input: JSON.stringify({ q: `step ${call}` }),
          toolCallId: `call-${call}`,
          toolName: tool,
          type: "tool-call",
        });
        chunks.push({
          finishReason: { raw: "tool_use", unified: "tool-calls" },
          providerMetadata,
          type: "finish",
          usage,
        });
      } else if (act === "error-chunk") {
        chunks.push(...words, { id: "t", type: "text-end" });
        chunks.push({ error: new Error("overloaded"), type: "error" });
        chunks.push({
          finishReason: { raw: "error", unified: "error" },
          providerMetadata,
          type: "finish",
          usage,
        });
      } else if (act === "break") {
        // Words, then the connection drops: the stream errors, no finish.
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
      } else {
        chunks.push(...words, { id: "t", type: "text-end" });
        chunks.push({
          finishReason: { raw: "end_turn", unified: "stop" },
          providerMetadata,
          type: "finish",
          usage,
        });
      }
      return Promise.resolve({
        stream: simulateReadableStream({ chunkDelayInMs: 1, chunks }),
      });
    },
  });
};
