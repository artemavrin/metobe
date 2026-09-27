import type { UIMessage } from "ai";
import { z } from "zod";

import type { ChartInput, ChartOutput } from "./chart";
import type { TableInput, TableOutput } from "./table";

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
  /** How long the work with tools took, to its last tool result, as the server measured it. */
  workMs: z.number().int().nonnegative().optional(),
});
export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;

/** Data the stream sends besides the answer; `title` — a new chat's name from the titles model (not stored). */
// A type alias, not an interface: AI SDK wants a Record, and an interface is not assignable to one.
// oxlint-disable-next-line typescript/consistent-type-definitions -- see above
export type ChatDataParts = { title: string };

/** Our own tools, drawn in the answer (MCP tools arrive as dynamic tools). */
// oxlint-disable-next-line typescript/consistent-type-definitions -- a Record for AI SDK, as above
export type ChatTools = {
  show_chart: { input: ChartInput; output: ChartOutput };
  show_table: { input: TableInput; output: TableOutput };
};

export type ChatMessage = UIMessage<
  ChatMessageMetadata,
  ChatDataParts,
  ChatTools
>;

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

/**
 * The user's answers to «ask first?» on the last answer's tool calls: which answer, and yes or no per request. Only
 * the decisions travel — the server applies them to its own copy of the answer and carries it on.
 */
export const approvalsSchema = z.object({
  answers: z
    .array(
      z.object({
        approved: z.boolean(),
        id: z.string().min(1).max(200),
        reason: z.string().max(500).optional(),
      })
    )
    .min(1)
    .max(20),
  messageId: z.uuid(),
});
export type Approvals = z.infer<typeof approvalsSchema>;

/**
 * `POST /api/chat`: a new message from the user with the model to answer it (our `models.id` — the source is looked
 * up from it), or the user's answers to the last answer's approvals — carried on by the model that asked.
 */
export const chatRequestSchema = z
  .object({
    approvals: approvalsSchema.optional(),
    /** The MCP servers the question mentions; they join the chat's, whose tools reach the model. */
    catalogIds: z.array(z.uuid()).max(50).optional(),
    id: z.uuid(),
    message: userMessageSchema.optional(),
    modelId: z.uuid().optional(),
  })
  .refine((r) => (r.message ? Boolean(r.modelId) : Boolean(r.approvals)), {
    message: "a message with its model, or approvals",
  })
  .refine((r) => !(r.message && r.approvals), {
    message: "not both",
  });
export type ChatRequest = z.infer<typeof chatRequestSchema>;
