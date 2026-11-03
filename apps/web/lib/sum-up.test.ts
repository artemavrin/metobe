import { streamText, toUIMessageStream } from "ai";
import type { UIMessageChunk } from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";

import { saidNothing, streamAnswer, sumUpPrompt } from "./sum-up";

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};

/** A model that streams these words, then stops. */
const saying = (text: string) =>
  new MockLanguageModelV4({
    doStream: () =>
      Promise.resolve({
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { id: "t", type: "text-start" },
          { delta: text, id: "t", type: "text-delta" },
          { id: "t", type: "text-end" },
          {
            finishReason: { raw: undefined, unified: "stop" },
            type: "finish",
            usage,
          },
        ]),
      }),
  });

const run = async (first: string, second: string) => {
  const answering = saying(second);
  const chunks: UIMessageChunk[] = [];
  await streamAnswer({
    finish: () =>
      ({ messageMetadata: { done: true }, type: "finish" }) as UIMessageChunk,
    first: streamText({
      model: saying(first),
      prompt: "прибыль Тверской за сентябрь",
    }),
    stopped: () => false,
    sumUp: (work) => streamText({ model: answering, ...sumUpPrompt("", work) }),
    toUI: (stream, options) => toUIMessageStream({ stream, ...options }),
    write: (chunk) => chunks.push(chunk),
  });
  const words = chunks
    .flatMap((c) => (c.type === "text-delta" ? [c.delta] : []))
    .join("");
  return { answering, chunks, words };
};

describe("an answer that said nothing", () => {
  it("is answered in the same message, with no word from the user", async () => {
    const { answering, chunks, words } = await run(
      "\n\n",
      "Валовая прибыль — 3 658 672,75 ₽."
    );
    expect(words).toContain("3 658 672,75");
    // One message: one start, one finish, the sum-up told to answer now as the last turn.
    expect(chunks.filter((c) => c.type === "start")).toHaveLength(1);
    expect(chunks.filter((c) => c.type === "finish")).toHaveLength(1);
    expect(JSON.stringify(answering.doStreamCalls[0]?.prompt.at(-1))).toContain(
      "Write your final answer"
    );
    expect(answering.doStreamCalls[0]?.tools ?? []).toEqual([]);
  });

  it("leaves an answer that said something as it is", async () => {
    const { answering, chunks } = await run(
      "Валовая прибыль — 3,66 млн ₽.",
      "лишнее"
    );
    expect(answering.doStreamCalls).toHaveLength(0);
    const finish = chunks.filter((c) => c.type === "finish");
    expect(finish).toHaveLength(1);
    expect(finish[0]).toMatchObject({ messageMetadata: { done: true } });
  });

  it("counts blank lines as nothing", () => {
    expect(saidNothing([{ text: " \n\n " }])).toBe(true);
    expect(saidNothing([{ text: "Готово." }])).toBe(false);
    expect(saidNothing([])).toBe(false);
    // Stopped on a call the user answers (a question, «connect X», an approval): waiting, not silent.
    expect(
      saidNothing([
        { text: "\n\n", toolCalls: [{ toolCallId: "c1" }], toolResults: [] },
      ])
    ).toBe(false);
    // Out of steps with every call answered: silent — the sum-up answers.
    expect(
      saidNothing([
        {
          text: "",
          toolCalls: [{ toolCallId: "c1" }],
          toolResults: [{ toolCallId: "c1" }],
        },
      ])
    ).toBe(true);
  });
});
