import { chatRequestSchema } from "@metobe/contracts/chat";
import type { ChatMessage } from "@metobe/contracts/chat";
import { getLanguageModel } from "@metobe/core/ai";
import {
  createChat,
  getChat,
  getChatModel,
  listMessages,
  saveMessages,
} from "@metobe/core/chat";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from "ai";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";

// POST /api/chat (ARCH §6), after vercel/chatbot: the client sends only its newest message, the history comes
// from the database. The user's message is saved before the model is called, the answer when the stream ends —
// even if the client has gone by then. Errors are codes; the chat screen says them in the user's language.
// Tools (M4), stop, resume and statuses (M3.2) come on their steps.

export const maxDuration = 300;

type ErrorCode =
  | "unauthorized"
  | "bad-request"
  | "forbidden"
  | "model-unavailable"
  | "generation-failed";

const fail = (code: ErrorCode, status: number) =>
  Response.json({ error: code }, { status });

/** A new chat is named by its first line until real titles arrive (M3.3). */
const provisionalTitle = (message: ChatMessage) => {
  const text = message.parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join(" ");
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
};

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

  if (!chat) {
    await createChat({
      id,
      title: provisionalTitle(message),
      userId: session.user.id,
    });
  }
  const history = chat ? await listMessages(id) : [];
  const uiMessages = await validateUIMessages<ChatMessage>({
    messages: [...history, message],
  });
  await saveMessages(id, [message]);

  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer }) => {
      const result = streamText({
        messages: await convertToModelMessages(uiMessages),
        model: languageModel,
      });
      // Runs the generation to its end on the server, so the answer is saved even when the client has left.
      void result.consumeStream();
      writer.merge(
        toUIMessageStream({ sendReasoning: true, stream: result.stream })
      );
    },
    generateId: () => crypto.randomUUID(),
    onEnd: async ({ messages: finished }) => {
      await saveMessages(id, finished);
    },
    onError: (error) => {
      console.error("chat: generation failed", model.id, error);
      return "generation-failed" satisfies ErrorCode;
    },
  });

  return createUIMessageStreamResponse({ stream });
};
