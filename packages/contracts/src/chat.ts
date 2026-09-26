import type { UIMessage } from "ai";
import { z } from "zod";

// Chat (ARCH §5.3, §6.1): messages are stored and sent as AI SDK UI messages. Our own data parts (`data-status`,
// M3.2) and tools (M4) extend `ChatMessage` when they arrive.

/**
 * What a message carries besides its parts: when it was written (the thread's toolbar says it; stored messages
 * take it from their row), the model that wrote an answer (our `models.id`) and how long it reasoned before its
 * first word, as the server measured it.
 */
export const chatMessageMetadataSchema = z.object({
  createdAt: z.iso.datetime().optional(),
  modelId: z.uuid().optional(),
  reasoningMs: z.number().int().nonnegative().optional(),
});
export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;

/** Data the stream sends besides the answer; `title` — a new chat's name from the titles model (not stored). */
// A type alias, not an interface: AI SDK wants a Record, and an interface is not assignable to one.
// oxlint-disable-next-line typescript/consistent-type-definitions -- see above
export type ChatDataParts = { title: string };

export type ChatMessage = UIMessage<ChatMessageMetadata, ChatDataParts>;

/** What `POST /api/chat` answers instead of a stream; the chat screen says it in the user's language. */
export const chatErrorCodes = [
  "unauthorized",
  "bad-request",
  "forbidden",
  "model-unavailable",
  "generation-failed",
] as const;
export type ChatErrorCode = (typeof chatErrorCodes)[number];

export const chatRoles = ["user", "assistant", "system"] as const;
export type ChatRole = (typeof chatRoles)[number];

export const chatVisibilities = ["private", "public"] as const;
export type ChatVisibility = (typeof chatVisibilities)[number];

export const chatKinds = ["chat", "agent_run"] as const;
export type ChatKind = (typeof chatKinds)[number];

/** A new chat is named by its first line until real titles arrive (M3.3); the sidebar shows it before the server. */
export const chatTitleFrom = (text: string) => {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
};

/** A generous bound for one message: long pastes are normal, a runaway client is not. */
const MAX_TEXT = 100_000;

const textPartSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT),
  type: z.literal("text"),
});

/** The one message the client sends; the history comes from the database. Attachments arrive with M3.3. */
export const userMessageSchema = z.object({
  id: z.uuid(),
  parts: z.array(textPartSchema).min(1).max(20),
  role: z.literal("user"),
});

/** `POST /api/chat`. `modelId` is our `models.id` — the source is looked up from it. */
export const chatRequestSchema = z.object({
  id: z.uuid(),
  message: userMessageSchema,
  modelId: z.uuid(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
