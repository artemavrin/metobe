import "server-only";
import type {
  ModelLabel,
  ModelPayload,
  ModelStepView,
} from "@metobe/contracts/chat";
import { modelPayloads } from "@metobe/db/schema/chat";
import { eq } from "drizzle-orm";

import { getDb } from "./db";
import type { MaskedCall, ModelAnswer } from "./pii-guard";
import { toolOutputText } from "./pii-guard";

// What the model saw (PII-GUARD-PLAN З4, P31): while data protection masks a chat's calls, the
// masked requests and the answers as the model wrote them are collected, and once the answer is
// saved they are kept next to its messages — the person's message as it went, each step's tool
// calls and results and its text before the values came back, and the labels in them.

type PromptMessage = NonNullable<MaskedCall["prompt"]>[number];

const textOf = (message: PromptMessage): string => {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  return (content as { type: string; text?: string }[])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
};

/** Every tool result in the masked requests, by the id of its call, as the model got it. */
const outputsOf = (calls: MaskedCall[]): Map<string, string> => {
  const outputs = new Map<string, string>();
  for (const call of calls) {
    for (const message of call.prompt ?? []) {
      if (message.role !== "tool") {
        continue;
      }
      for (const part of message.content as {
        type: string;
        toolCallId?: string;
        output?: unknown;
      }[]) {
        const text =
          part.type === "tool-result" ? toolOutputText(part.output) : null;
        if (part.toolCallId && text !== null) {
          outputs.set(part.toolCallId, text);
        }
      }
    }
  }
  return outputs;
};

const labelsOf = (calls: MaskedCall[]): ModelLabel[] => {
  const labels = new Map<string, ModelLabel>();
  for (const call of calls) {
    for (const entity of call.entities) {
      labels.set(entity.placeholder, {
        label: entity.placeholder,
        type: entity.type,
        value: entity.value,
      });
    }
  }
  return [...labels.values()];
};

/** The person's message and the answer as the model saw them; null when nothing was masked. */
export const buildPayloads = (
  calls: MaskedCall[],
  answers: ModelAnswer[]
): { question: ModelPayload | null; answer: ModelPayload } | null => {
  if (calls.length === 0) {
    return null;
  }
  const labels = labelsOf(calls);
  const outputs = outputsOf(calls);
  const first = calls[0]?.prompt ?? [];
  // The last user message (a loop: the web's lib target has no findLast).
  let asked: PromptMessage | undefined;
  for (let i = first.length - 1; i >= 0 && !asked; i -= 1) {
    if (first[i]?.role === "user") {
      asked = first[i];
    }
  }
  const steps: ModelStepView[] = answers.map((answer) => ({
    text: answer.text || undefined,
    tools: answer.toolCalls.map((call) => ({
      input: call.input,
      output: outputs.get(call.toolCallId),
      toolCallId: call.toolCallId,
    })),
  }));
  return {
    answer: { labels, steps },
    question: asked ? { labels, text: textOf(asked) } : null,
  };
};

/** Collects a chat's masked calls; `save` keeps them once the answer's messages are saved. */
export const payloadRecorder = () => {
  const calls: MaskedCall[] = [];
  const answers: ModelAnswer[] = [];
  return {
    save: async (run: {
      chatId: string;
      /** The person's new message; none when an answer carries on after approvals. */
      questionId?: string;
      answerId?: string;
    }) => {
      const built = buildPayloads(calls, answers);
      if (!built) {
        return;
      }
      const { db } = getDb();
      if (run.questionId && built.question) {
        await db
          .insert(modelPayloads)
          .values({
            chatId: run.chatId,
            messageId: run.questionId,
            payload: built.question,
          })
          .onConflictDoUpdate({
            set: { payload: built.question },
            target: modelPayloads.messageId,
          });
      }
      if (!run.answerId) {
        return;
      }
      // An answer carried on after approvals adds its steps to what it had.
      const [had] = await db
        .select({ payload: modelPayloads.payload })
        .from(modelPayloads)
        .where(eq(modelPayloads.messageId, run.answerId))
        .limit(1);
      const labels = new Map(
        [...(had?.payload.labels ?? []), ...built.answer.labels].map((l) => [
          l.label,
          l,
        ])
      );
      const payload: ModelPayload = {
        labels: [...labels.values()],
        steps: [...(had?.payload.steps ?? []), ...(built.answer.steps ?? [])],
      };
      await db
        .insert(modelPayloads)
        .values({ chatId: run.chatId, messageId: run.answerId, payload })
        .onConflictDoUpdate({
          set: { payload },
          target: modelPayloads.messageId,
        });
    },
    use: {
      onAnswer: (answer: ModelAnswer) => {
        answers.push(answer);
      },
      onMasked: (call: MaskedCall) => {
        calls.push(call);
      },
    },
  };
};
