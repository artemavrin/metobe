import {
  createUIMessageStream,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import type {
  LanguageModel,
  ModelMessage,
  TextStreamPart,
  ToolSet,
  UIMessage,
  UIMessageChunk,
} from "ai";

import { recordStream } from "../../apps/web/lib/resume-stream";
import { MAX_STEPS } from "../../apps/web/lib/steps";
import { saidNothing, sumUpPrompt } from "../../apps/web/lib/sum-up";
import type { Prices } from "../../packages/core/src/pricing";
import { atLeast, costOfSteps } from "./budget";
import type { Budget } from "./budget";

// The chat route's answer (apps/web/app/api/chat/route.ts) cut to what the budget touches: one `streamText` pass with
// the budget in `stopWhen` / `prepareStep` / `onStepEnd`, the sum-up pass only while money is left, the line about
// the limit as a data part, the stream recorded for a reloaded page (lib/resume-stream) and the rows of `model_runs`
// as `recordRun` would write them.

/** The line about the limit: a data part, saved with the answer and replayed by resume; the model never sees it. */
export interface LimitLine {
  window: "five-hours" | "week";
  resetAt: string;
}

export type Message = UIMessage<unknown, { limit: LimitLine }>;

export interface Run {
  pass: "answer" | "sum-up";
  status: "ok" | "error" | "aborted";
  cost: string;
  steps: number;
}

export const runAnswer = async ({
  chatId,
  model,
  budget,
  prices,
  tools,
  messages,
  originalMessages,
  soft = false,
  abortSignal,
  limit = { resetAt: "2026-11-24T18:00:00.000Z", window: "five-hours" },
}: {
  chatId: string;
  model: LanguageModel;
  budget: Budget;
  prices: Prices | null;
  tools: ToolSet;
  messages: ModelMessage[];
  /** The answer carried on after approvals: the same message goes on. */
  originalMessages?: Message[];
  /** The soft way too: the step that would reach the budget answers without tools. */
  soft?: boolean;
  abortSignal?: AbortSignal;
  limit?: LimitLine;
}) => {
  const runs: Run[] = [];
  let saved: Message[] = [];
  let sumUpCost: string | null = null;
  const stream = createUIMessageStream<Message>({
    execute: async ({ writer }) => {
      // How the pass ended, as its callbacks say; the row is written once, after the pass, from what `onStepEnd`
      // kept. `onEnd` alone is not enough: a stream that breaks off fires neither `onEnd` nor `onError`, and a
      // rejected call fires both (callbacks.test.ts).
      const ended = { aborted: false, failed: false };
      const first = streamText({
        abortSignal,
        messages,
        model,
        onAbort: () => {
          ended.aborted = true;
        },
        onError: () => {
          ended.failed = true;
        },
        onStepEnd: budget.onStepEnd,
        onStepError: () => {
          ended.failed = true;
        },
        prepareStep: soft
          ? (options) =>
              budget.lastStepIfShort({
                instructions: options.instructions,
                messages: options.messages,
                steps: options.steps,
              })
          : undefined,
        stopWhen: [isStepCount(MAX_STEPS), budget.stop],
        tools,
      });
      const toUI = (
        s: ReadableStream<TextStreamPart<ToolSet>>,
        options: { sendStart?: boolean; sendFinish?: boolean }
      ) =>
        toUIMessageStream<ToolSet, Message>({
          onError: () => "An error occurred.",
          originalMessages,
          stream: s,
          ...options,
        });
      const consumed = first.consumeStream({
        onError: () => {
          ended.failed = true;
        },
      });
      writer.merge(toUI(first.stream, { sendFinish: false }));
      await consumed;
      runs.push({
        cost: budget.spent(),
        pass: "answer",
        status: ended.aborted ? "aborted" : ended.failed ? "error" : "ok",
        steps: budget.steps(),
      });
      // Its steps say whether it ended in words.
      const steps = await Promise.resolve(first.steps).catch(() => null);
      if (!steps || abortSignal?.aborted) {
        return;
      }
      // The sum-up pass: only for an answer that said nothing, and only while money is left (ARCH §20.8).
      if (saidNothing(steps) && !atLeast("0", budget.left())) {
        // `responseMessages`, not `response.messages`: in ai@7 the latter is the last step's only.
        const work = await first.responseMessages;
        const pass = streamText({
          ...sumUpPrompt("", [...messages, ...work]),
          model,
          onEnd: ({ steps: done }) => {
            sumUpCost = costOfSteps(done, prices).total;
            runs.push({
              cost: sumUpCost,
              pass: "sum-up",
              status: "ok",
              steps: done.length,
            });
          },
        });
        void pass.consumeStream();
        writer.merge(
          toUI(pass.stream, { sendFinish: false, sendStart: false })
        );
        await pass.steps;
      }
      // The line: the budget cut the answer, or the answer waits on the user with nothing left to carry it on.
      const last = steps.at(-1);
      const waits = (last?.toolCalls ?? []).some(
        (c) =>
          !(last?.toolResults ?? []).some((r) => r.toolCallId === c.toolCallId)
      );
      if (budget.stopped() || (waits && budget.over())) {
        writer.write({ data: limit, type: "data-limit" });
      }
      writer.write({ type: "finish" });
    },
    onEnd: ({ messages: finished }) => {
      saved = finished;
    },
    originalMessages,
  });
  // As the route does: one copy for the client, one for the record a reloaded page joins.
  const [toClient, toRecord] = stream.tee();
  const forget = recordStream(
    chatId,
    toRecord as ReadableStream<UIMessageChunk>
  );
  const chunks: UIMessageChunk[] = [];
  const reader = toClient.getReader();
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value as UIMessageChunk);
  }
  return {
    chunks,
    forget,
    runs,
    saved: () => saved,
    sumUpCost: () => sumUpCost,
  };
};
