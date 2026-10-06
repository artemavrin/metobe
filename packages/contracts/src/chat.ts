import type { UIMessage } from "ai";
import { z } from "zod";

import type { ChartInput, ChartOutput } from "./chart";
import { FILES_PER_MESSAGE } from "./files";
import type { MetricsInput, MetricsOutput } from "./metrics";
import type { TableInput, TableOutput } from "./table";
import type {
  WebFetchInput,
  WebFetchOutput,
  WebSearchInput,
  WebSearchOutput,
} from "./web";

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
  /** How long each step took, by its key — a tool call's id, `reasoning:N` or `text:N` for the N-th thought or note of the answer; a step the server did not see through — none. */
  stepMs: z.record(z.string(), z.number().int().nonnegative()).optional(),
  /** When each step began (the server's clock, ms since 1970), by the same key: the time of a step still going. */
  stepStartedAt: z
    .record(z.string(), z.number().int().nonnegative())
    .optional(),
  /** How long the work with tools took, to its last tool result, as the server measured it. */
  workMs: z.number().int().nonnegative().optional(),
});
export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;

/**
 * Data the stream sends besides the answer; `title` — a new chat's name from the titles model, `naming` — that the
 * request for it has begun, so the sidebar shows the chat being named, `clock` — the server's time now, so the page can
 * count a running step from the server's clock (none of them is stored).
 */
// A type alias, not an interface: AI SDK wants a Record, and an interface is not assignable to one.
// oxlint-disable-next-line typescript/consistent-type-definitions -- see above
export type ChatDataParts = { title: string; naming: boolean; clock: number };

/**
 * Our own tools (MCP tools arrive as dynamic tools): the table and the chart drawn in the answer, searching the web
 * and reading its pages, reading the user's attached files, and the search a big server's tools are found with (AI SDK's tool search).
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- a Record for AI SDK, as above
export type ChatTools = {
  find_tools: {
    input: { query: string };
    output: { tools: { name: string; description?: string }[] };
  };
  /** The model asks the user to connect a per-user server this answer needs; the user's answer comes back as output. */
  request_connection: {
    input: RequestConnectionInput;
    output: RequestConnectionOutput;
  };
  /** The clock: the model has none of its own. Not drawn in the answer. */
  current_time: {
    input: { timeZone?: string };
    output: { local: string; timeZone: string; utc: string };
  };
  /** Reads an attached file as text, a page at a time; a failure comes back as `{ error }`, not as a thrown error. */
  read_attachment: {
    input: { id: string; page?: number };
    output:
      | {
          name: string;
          page: number;
          pages: number;
          text: string;
          note?: string;
        }
      | { error: string };
  };
  show_chart: { input: ChartInput; output: ChartOutput };
  show_metrics: { input: MetricsInput; output: MetricsOutput };
  show_table: { input: TableInput; output: TableOutput };
  web_fetch: { input: WebFetchInput; output: WebFetchOutput };
  web_search: { input: WebSearchInput; output: WebSearchOutput };
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
  "context-full",
  "too-fast",
  "daily-limit",
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

/** «Connect X to go on»: which server (its key) and, in a line, why this answer needs it. */
export const requestConnectionInputSchema = z.object({
  reason: z.string().min(1).max(300),
  server: z.string().min(1).max(100),
});
export type RequestConnectionInput = z.infer<
  typeof requestConnectionInputSchema
>;

/** Whether the server is connected now — as the server saw it, not as the client said. */
export const requestConnectionOutputSchema = z.object({
  connected: z.boolean(),
});
export type RequestConnectionOutput = z.infer<
  typeof requestConnectionOutputSchema
>;

/** A generous bound for one message: long pastes are normal, a runaway client is not. */
const MAX_TEXT = 100_000;

const textPartSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT),
  type: z.literal("text"),
});

/** An attachment (D33): our URL only — the server takes the name and the type from its own row. */
const filePartSchema = z.object({
  filename: z.string().max(255).optional(),
  mediaType: z.string().max(100),
  type: z.literal("file"),
  url: z.string().regex(/^\/api\/files\/[0-9a-f-]{36}$/u),
});

/** The one message the client sends; the history comes from the database. Text, files, or both. */
export const userMessageSchema = z.object({
  id: z.uuid(),
  parts: z
    .array(z.union([textPartSchema, filePartSchema]))
    .min(1)
    .max(20)
    .refine(
      (parts) =>
        parts.filter((p) => p.type === "file").length <= FILES_PER_MESSAGE,
      {
        message: "too many files",
      }
    ),
  role: z.literal("user"),
});

/**
 * The user's answers to «ask first?» on the last answer's tool calls: which answer, and yes or no per request. Only
 * the decisions travel — the server applies them to its own copy of the answer and carries it on.
 */
export const approvalsSchema = z
  .object({
    answers: z
      .array(
        z.object({
          approved: z.boolean(),
          id: z.string().min(1).max(200),
          reason: z.string().max(500).optional(),
        })
      )
      .max(20)
      .default([]),
    /** The user's answers to «connect X to go on», by tool call; the server checks the connection itself. */
    connections: z
      .array(
        z.object({ connected: z.boolean(), id: z.string().min(1).max(200) })
      )
      .max(10)
      .default([]),
    messageId: z.uuid(),
  })
  .refine((a) => a.answers.length + a.connections.length > 0, {
    message: "an approval or a connection",
  });
export type Approvals = z.infer<typeof approvalsSchema>;

/**
 * `POST /api/chat`: a new message from the user with the model to answer it (our `models.id` — the source is looked
 * up from it), or the user's answers to the last answer's approvals — carried on by the model that asked.
 */
export const chatRequestSchema = z
  .object({
    approvals: approvalsSchema.optional(),
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
