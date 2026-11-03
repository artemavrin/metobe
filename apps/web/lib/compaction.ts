import type { ChatMessage, CompactionData } from "@metobe/contracts/chat";
import { summaryForModel } from "@metobe/core/compact-transcript";

// The chat's side of «Сжать чат» (D37): what the model is sent once a chat was compacted, and when the chat offers
// to compact — by what the last answer actually sent the model a step, after the earlier data was cut.

/** An answer that sent the model more than this a step on average offers to compact the chat. */
export const HEAVY_STEP_TOKENS = 40_000;
/** Fewer questions than this since the last compaction: nothing to compact (as the server checks too). */
export const MIN_QUESTIONS = 3;

/** A compaction message's data; none for any other message. */
export const compactionOf = (message: ChatMessage): CompactionData | null => {
  for (const part of message.parts) {
    if (part.type === "data-compaction") {
      return part.data;
    }
  }
  return null;
};

const lastCompactionAt = (messages: ChatMessage[]) => {
  let at = -1;
  for (const [i, m] of messages.entries()) {
    if (compactionOf(m)) {
      at = i;
    }
  }
  return at;
};

/**
 * What the model is sent of the history: after the last compaction, its summary as the first message and everything
 * after it; with none, the history as it is. A system message is never sent as one (a compaction is the only kind).
 */
export const fromCompaction = (messages: ChatMessage[]): ChatMessage[] => {
  const at = lastCompactionAt(messages);
  if (at === -1) {
    return messages.filter((m) => m.role !== "system");
  }
  const data = compactionOf(messages[at] as ChatMessage) as CompactionData;
  const summary: ChatMessage = {
    id: `summary-${messages[at]?.id ?? ""}`,
    parts: [{ text: summaryForModel(data.summary), type: "text" }],
    role: "user",
  };
  return [
    summary,
    ...messages.slice(at + 1).filter((m) => m.role !== "system"),
  ];
};

/**
 * Whether the chat offers to compact: its last message is a finished answer that was heavy, and enough was asked
 * since the last compaction. The answer's id comes back, so «Не сейчас» hides the offer until the next heavy answer.
 */
export const heavyAnswer = (messages: ChatMessage[]): string | null => {
  const last = messages.at(-1);
  if (
    last?.role !== "assistant" ||
    (last.metadata?.stepTokens ?? 0) < HEAVY_STEP_TOKENS
  ) {
    return null;
  }
  const asked = messages
    .slice(lastCompactionAt(messages) + 1)
    .filter((m) => m.role === "user").length;
  return asked >= MIN_QUESTIONS ? last.id : null;
};
