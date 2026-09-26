import {
  chatMessageMetadataSchema,
  chatRequestSchema,
  chatTitleFrom,
} from "@metobe/contracts/chat";
import type { ChatErrorCode, ChatMessage } from "@metobe/contracts/chat";
import { getLanguageModel } from "@metobe/core/ai";
import {
  createChat,
  deleteMessagesFrom,
  getChat,
  getChatModel,
  listMessages,
  saveMessages,
} from "@metobe/core/chat";
import { recordRun, withPromptCache } from "@metobe/core/chat-run";
import { generateChatTitle } from "@metobe/core/chat-title";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from "ai";
import type { ToolSet } from "ai";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";

// POST /api/chat (ARCH §6), after vercel/chatbot: the client sends only its newest message, the history comes
// from the database. The user's message is saved before the model is called, the answer when the stream ends —
// even if the client has gone by then. Errors are codes; the chat screen says them in the user's language.
// Every call is recorded in model_runs with its cache split; prompt caching per source is in core/chat-run.
// Tools (M4), stop, resume and statuses (M3.2) come on their steps.

export const maxDuration = 300;

const fail = (code: ChatErrorCode, status: number) =>
  Response.json({ error: code }, { status });

/** Chunks that mean the model has started answering. */
const FIRST_TOKEN = new Set([
  "text-delta",
  "reasoning-delta",
  "tool-call",
  "tool-input-start",
]);

/**
 * Why a call failed, as «name: message» down the cause chain (a retry's last error first) — where the real reason
 * is, like a proxy that does not resolve. The request itself stays out of the log: it holds the prompt.
 */
const causes = (error: unknown) => {
  const chain: string[] = [];
  let current: unknown = (error as { lastError?: unknown }).lastError ?? error;
  while (current instanceof Error && chain.length < 6) {
    const status = (current as { statusCode?: number }).statusCode;
    chain.push(
      `${current.name}: ${current.message}${status ? ` (${status})` : ""}`
    );
    current = current.cause;
  }
  return chain.join(" ← ");
};

const textOf = (message: ChatMessage) =>
  message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ");

const provisionalTitle = (message: ChatMessage) =>
  chatTitleFrom(textOf(message));

export const POST = async (request: Request) => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return fail("unauthorized", 401);
  }
  const body = chatRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!body.success) {
    return fail("bad-request", 400);
  }
  const { id, message, modelId } = body.data;

  const [chat, model] = await Promise.all([getChat(id), getChatModel(modelId)]);
  if (chat && chat.userId !== session.user.id) {
    return fail("forbidden", 403);
  }
  if (!model) {
    return fail("model-unavailable", 422);
  }

  let languageModel: Awaited<ReturnType<typeof getLanguageModel>>;
  try {
    languageModel = await getLanguageModel(model.sourceId, model.modelId);
  } catch (error) {
    console.error("chat: could not build the model", model.id, error);
    return fail("model-unavailable", 422);
  }

  const stored = chat ? await listMessages(id) : [];
  // The same message again (a retry after an error): it and what followed it go, then it is sent anew.
  const again = stored.findIndex((m) => m.id === message.id);
  const history = again === -1 ? stored : stored.slice(0, again);
  // Checked before anything is written, so a history that does not validate leaves no empty chat behind.
  let uiMessages: ChatMessage[];
  try {
    uiMessages = await validateUIMessages<ChatMessage>({
      messages: [...history, message],
      // A message the client sends has no metadata; stored ones have their time, answers their model.
      metadataSchema: chatMessageMetadataSchema.optional(),
    });
  } catch (error) {
    console.error("chat: the history does not validate", id, error);
    return fail("bad-request", 400);
  }
  if (!chat) {
    await createChat({
      id,
      title: provisionalTitle(message),
      userId: session.user.id,
    });
  }
  if (again !== -1) {
    await deleteMessagesFrom(id, message.id);
  }
  await saveMessages(id, [message]);

  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer }) => {
      // A new chat gets its name from the titles model while the answer streams; the sidebar takes it at once.
      const name = async () => {
        const title = chat
          ? null
          : await generateChatTitle({
              chatId: id,
              text: textOf(message),
              userId: session.user.id,
            });
        if (title) {
          writer.write({ data: title, transient: true, type: "data-title" });
        }
      };
      const naming = name();
      const prompt = withPromptCache(
        model.kind,
        await convertToModelMessages(uiMessages)
      );
      const started = Date.now();
      let firstChunk: number | null = null;
      // How long the model reasoned: from its first reasoning to its first word (the folded reasoning says it).
      let reasoningFrom: number | null = null;
      let reasoningTo: number | null = null;
      const run = { chatId: id, model, userId: session.user.id };
      const record = async (
        r: Omit<Parameters<typeof recordRun>[0], keyof typeof run>
      ) => {
        try {
          await recordRun({ ...run, ...r });
        } catch (error) {
          console.error("chat: could not record the run", model.id, error);
        }
      };
      const result = streamText({
        messages: prompt.messages,
        model: languageModel,
        onAbort: () => record({ latencyMs: firstChunk, status: "aborted" }),
        onChunk: ({ chunk }) => {
          // Time to the first thing the user sees, not to the stream's own bookkeeping.
          if (FIRST_TOKEN.has(chunk.type)) {
            firstChunk ??= Date.now() - started;
          }
          if (chunk.type === "reasoning-delta") {
            reasoningFrom ??= Date.now();
          } else if (chunk.type === "text-delta" && reasoningFrom !== null) {
            reasoningTo ??= Date.now();
          }
        },
        onEnd: ({ providerMetadata, totalUsage }) =>
          record({
            latencyMs: firstChunk,
            providerMetadata,
            status: "ok",
            usage: totalUsage,
          }),
        // The provider's own error: the stream passes on only «An error occurred».
        onError: ({ error }) => {
          console.error("chat: the model failed", model.id, causes(error));
          return record({ latencyMs: firstChunk, status: "error" });
        },
        providerOptions: prompt.providerOptions,
      });
      // Runs the generation to its end on the server, so the answer is saved even when the client has left.
      void result.consumeStream();
      writer.merge(
        toUIMessageStream<ToolSet, ChatMessage>({
          // The answer names its model, so the thread can show who wrote it after the chat switches models, and at
          // the end how long it reasoned.
          messageMetadata: ({ part }) => {
            if (part.type === "start") {
              return { createdAt: new Date().toISOString(), modelId: model.id };
            }
            return part.type === "finish" && reasoningFrom !== null
              ? { reasoningMs: (reasoningTo ?? Date.now()) - reasoningFrom }
              : undefined;
          },
          sendReasoning: true,
          stream: result.stream,
        })
      );
      await naming;
    },
    generateId: () => crypto.randomUUID(),
    onEnd: async ({ messages: finished }) => {
      await saveMessages(id, finished);
    },
    onError: (error) => {
      console.error("chat: generation failed", model.id, error);
      return "generation-failed" satisfies ChatErrorCode;
    },
  });

  return createUIMessageStreamResponse({ stream });
};
