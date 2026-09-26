import type { ChatMessage } from "@metobe/contracts/chat";
import type { ChatStatus } from "ai";

export type ThreadRow =
  | { role: "user"; key: string; message: ChatMessage }
  | {
      role: "assistant";
      key: string;
      /** Absent while the question waits for the stream to start. */
      message?: ChatMessage;
      /** On its way: from the moment the question goes until the last word. */
      live: boolean;
    }
  /** Where the model changes: before the question the new model answered. Drawn only — never a message. */
  | { role: "switch"; key: string; modelId: string };

/**
 * The thread as rows. An answer is keyed by the question before it, so from the moment the question goes until the
 * last word it is one element — the waiting line, the reasoning and the words never unmount in between — and it is
 * live all that time. AI SDK puts the empty answer in on the stream's `start` while the status is still
 * `submitted`, so «live» is the request being busy, not the status being `streaming`.
 *
 * A switch row marks where the model changes, from the models answers name in their metadata (`asked` — the model
 * a question went to, for the answer that has not started yet). It is derived here and never sent: the model's
 * history is read from the database, so the mark cannot touch the prompt or its cache.
 */
/** The model an answer is by: its own metadata, or — while it has not started — the model its question went to. */
const byModel = (
  answer: ChatMessage | undefined,
  live: boolean,
  asked: string | undefined
) => answer?.metadata?.modelId ?? (live ? asked : undefined);

/** A question's row, after a switch row when its answer is by another model than the answer before. */
const questionRows = (
  question: ChatMessage,
  by: string | undefined,
  model: string | undefined
): ThreadRow[] => {
  const row: ThreadRow = { key: question.id, message: question, role: "user" };
  return by && model && by !== model
    ? [{ key: `switch:${question.id}`, modelId: by, role: "switch" }, row]
    : [row];
};

const answerRow = (
  before: ChatMessage | undefined,
  message: ChatMessage | undefined,
  live: boolean
): ThreadRow => ({
  key:
    before?.role === "user" ? `answer:${before.id}` : (message?.id ?? "answer"),
  live,
  message,
  role: "assistant",
});

export const threadRows = (
  messages: ChatMessage[],
  status: ChatStatus,
  asked?: string
): ThreadRow[] => {
  const busy = status === "submitted" || status === "streaming";
  const waiting = busy && messages.at(-1)?.role === "user";
  const list: (ChatMessage | undefined)[] = waiting
    ? [...messages, undefined]
    : messages;
  const isLive = (i: number) => busy && i === list.length - 1;
  const rows: ThreadRow[] = [];
  let model: string | undefined;
  for (const [i, message] of list.entries()) {
    if (message?.role === "user") {
      const by = byModel(list[i + 1], isLive(i + 1), asked);
      rows.push(...questionRows(message, by, model));
      continue;
    }
    model = byModel(message, isLive(i), asked) ?? model;
    rows.push(answerRow(list[i - 1], message, isLive(i)));
  }
  return rows;
};
