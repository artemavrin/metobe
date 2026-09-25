import type { UIMessage } from "ai";
import { z } from "zod";

// Chat (ARCH §5.3, §6.1): messages are stored and sent as AI SDK UI messages. Our own data parts (`data-status`,
// M3.2) and tools (M4) extend `ChatMessage` when they arrive.

export type ChatMessage = UIMessage;

export const chatRoles = ["user", "assistant", "system"] as const;
export type ChatRole = (typeof chatRoles)[number];

export const chatVisibilities = ["private", "public"] as const;
export type ChatVisibility = (typeof chatVisibilities)[number];

export const chatKinds = ["chat", "agent_run"] as const;
export type ChatKind = (typeof chatKinds)[number];

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
