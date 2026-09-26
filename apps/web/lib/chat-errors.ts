import { chatErrorCodes } from "@metobe/contracts/chat";
import type { ChatErrorCode } from "@metobe/contracts/chat";

type ChatProblem = ChatErrorCode | "network" | "unknown";

const known = new Set<string>(chatErrorCodes);
const isCode = (value: unknown): value is ChatErrorCode =>
  typeof value === "string" && known.has(value);

/**
 * What went wrong, from `useChat`'s error. A refused request carries our code in its body (`{"error": …}`), a
 * failed generation sends the code as the stream's error text, and a fetch that never reached us is a TypeError.
 */
export const chatProblem = (error: Error): ChatProblem => {
  const text = error.message.trim();
  if (isCode(text)) {
    return text;
  }
  try {
    const code: unknown = (JSON.parse(text) as { error?: unknown }).error;
    if (isCode(code)) {
      return code;
    }
  } catch {
    // Not a response body.
  }
  return error instanceof TypeError ? "network" : "unknown";
};
