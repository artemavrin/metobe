import type { ChatMessage } from "@metobe/contracts/chat";

type Part = ChatMessage["parts"][number];
export type AskPart = Extract<Part, { type: "tool-request_connection" }>;

/** The user's answers to an answer's «connect X to go on», as the request carries them. */
export const connectionsOf = (answer: ChatMessage) =>
  answer.parts.flatMap((p) =>
    p.type === "tool-request_connection" && p.state === "output-available"
      ? [{ connected: p.output.connected, id: p.toolCallId }]
      : []
  );

/**
 * The last answer ends on an ask the user has just answered: the answer carries on by itself. Only then — an answer
 * that ends on words or on a table is done, and must not be sent again.
 */
export const answeredAsk = (messages: ChatMessage[]) => {
  const last = messages.at(-1);
  if (last?.role !== "assistant") {
    return false;
  }
  // The last part that is not a step's start (findLast is past the ES2022 target).
  let end: Part | undefined;
  for (const p of last.parts) {
    if (p.type !== "step-start") {
      end = p;
    }
  }
  return (
    end?.type === "tool-request_connection" && end.state === "output-available"
  );
};
