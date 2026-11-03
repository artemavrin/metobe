import type { ModelMessage, TextStreamPart, ToolSet } from "ai";

import { ANSWER_NOW, ANSWER_NOW_TURN } from "./steps";

// An answer must end in words. A model may do all the work and still end on a thought — out of steps, or deaf to
// «answer now» (DeepSeek v4.1 Flash on a 1С report, 2026-11-02: 20 steps, then blank lines, and the user took it for
// a hang). Then, in the same answer and without a word from the user, one more pass with no tools answers from what
// the work found.

/** A step as the sum-up reads it: its words, and its tool calls with the results they got. */
interface StepLike {
  text: string;
  toolCalls?: readonly { toolCallId: string }[];
  toolResults?: readonly { toolCallId: string }[];
}

/**
 * The step stopped on a call with no result: one the user answers — the model's questions, «connect X to go on», a
 * call that asks first. The answer is not over, it waits; a pass now would be refused for the missing result.
 */
const waitsOnUser = (step: StepLike) =>
  (step.toolCalls ?? []).some(
    (call) =>
      !(step.toolResults ?? []).some((r) => r.toolCallId === call.toolCallId)
  );

/** The answer's last step said nothing (blank lines are nothing), and does not wait on the user. */
export const saidNothing = (steps: readonly StepLike[]) => {
  const last = steps.at(-1);
  return last !== undefined && !last.text.trim() && !waitsOnUser(last);
};

/** The sum-up pass's instructions and messages: the work so far, then «answer now» as the last turn. */
export const sumUpPrompt = (
  instructions: string,
  messages: ModelMessage[]
) => ({
  instructions: instructions ? `${instructions}\n\n${ANSWER_NOW}` : ANSWER_NOW,
  messages: [...messages, { content: ANSWER_NOW_TURN, role: "user" as const }],
});

/** A pass of the model, as much of `streamText`'s result as the answer needs. */
interface Pass {
  stream: ReadableStream<TextStreamPart<ToolSet>>;
  steps: PromiseLike<readonly StepLike[]>;
  response: PromiseLike<{ messages: ModelMessage[] }>;
}

/** Every chunk of a stream, in order, to the end. */
const drain = async <C>(
  stream: ReadableStream<C>,
  write: (chunk: C) => void
) => {
  const reader = stream.getReader();
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    write(value);
  }
};

/**
 * Writes an answer into the chat's stream: the work as it goes, then — if it said nothing — the sum-up pass, as the
 * same message. The answer's end (`finish`, with its metadata) goes once, after the last pass; a stopped or failed
 * answer ends as the SDK ends it.
 */
export const streamAnswer = async <C>({
  first,
  sumUp,
  toUI,
  write,
  stopped,
  finish,
}: {
  first: Pass;
  /** The pass that answers, given the messages of the work. */
  sumUp: (work: ModelMessage[]) => Pass;
  toUI: (
    stream: Pass["stream"],
    options: { sendStart?: boolean; sendFinish?: boolean }
  ) => ReadableStream<C>;
  write: (chunk: C) => void;
  stopped: () => boolean;
  /** The answer's end, when no sum-up pass sends its own. */
  finish: () => C;
}) => {
  await drain(toUI(first.stream, { sendFinish: false }), write);
  const steps = await Promise.resolve(first.steps).catch(() => null);
  if (!steps || stopped()) {
    return;
  }
  if (!saidNothing(steps)) {
    write(finish());
    return;
  }
  const { messages } = await first.response;
  await drain(toUI(sumUp(messages).stream, { sendStart: false }), write);
};
