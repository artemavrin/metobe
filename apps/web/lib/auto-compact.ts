import type { ChatMessage } from "@metobe/contracts/chat";

import { MIN_QUESTIONS } from "./compaction";
import { triggerOf } from "./context-budget";

// The chat compacts by itself (D37, the owner's decision of 2026-11-24): before an answer, when what the model would
// be sent of the history — after the earlier questions' results and reasoning are cut — passes a line, the same
// compaction as «Сжать чат» runs first, and the answer goes from its summary. The user sees the summary in the thread
// as after their own compaction.

/**
 * The line: half the model's window, at most 100k tokens; 100k for a window not known — where the budget starts
 * clearing results (lib/context-budget) and Anthropic's own compaction triggers by default.
 */
export const autoCompactAt = (window: number | null) => triggerOf(window);

/** The questions asked since the last compaction (or ever). */
const questionsSince = (history: ChatMessage[]) => {
  let count = 0;
  for (const m of history) {
    if (m.parts.some((p) => p.type === "data-compaction")) {
      count = 0;
    } else if (m.role === "user") {
      count += 1;
    }
  }
  return count;
};

/**
 * Compacts the history before the question asked now (the thread's last message), when the history sent is over the
 * line and enough was asked since the last compaction — so a chat heavy even after one is not compacted at every
 * question. The compaction stored, or null: none was due, or it failed — then the answer goes on as it is.
 */
export const compactBeforeAnswer = async ({
  thread,
  tokens,
  window,
  compact,
}: {
  thread: ChatMessage[];
  /** What the model would be sent of the history, by the budget's guess. */
  tokens: number;
  window: number | null;
  compact: (history: ChatMessage[]) => Promise<ChatMessage | null>;
}): Promise<ChatMessage | null> => {
  const history = thread.slice(0, -1);
  if (
    tokens <= autoCompactAt(window) ||
    questionsSince(history) < MIN_QUESTIONS
  ) {
    return null;
  }
  try {
    return await compact(history);
  } catch (error) {
    console.error("chat: could not compact before the answer", error);
    return null;
  }
};
