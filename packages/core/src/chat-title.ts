import "server-only";
import { chats } from "@metobe/db/schema/chat";
import { generateText } from "ai";
import { eq } from "drizzle-orm";

import { getLanguageModel } from "./ai";
import { recordRun } from "./chat-run";
import { cleanTitle } from "./chat-title-clean";
import { getDb } from "./db";
import { getSlotModel } from "./model-slots";

const INSTRUCTIONS =
  "Name the conversation that starts with the user's message: 3–6 words, in the language of the message, " +
  "no quotes, no final punctuation. Answer with the title only.";

/**
 * A chat's title from its first message by the «titles» service model; null when no model has the job, the call
 * fails or says nothing — the chat keeps its first line then. The run is recorded as a service one.
 */
export const generateChatTitle = async (run: {
  chatId: string;
  userId: string;
  text: string;
}) => {
  const model = await getSlotModel("titles");
  if (!model) {
    return null;
  }
  const started = Date.now();
  try {
    const result = await generateText({
      instructions: INSTRUCTIONS,
      maxOutputTokens: 40,
      model: await getLanguageModel(model.sourceId, model.modelId),
      prompt: run.text.slice(0, 4000),
    });
    await recordRun({
      chatId: run.chatId,
      latencyMs: Date.now() - started,
      model,
      providerMetadata: result.providerMetadata,
      purpose: "title",
      status: "ok",
      usage: result.totalUsage,
      userId: run.userId,
    });
    const title = cleanTitle(result.text);
    if (!title) {
      return null;
    }
    const { db } = getDb();
    await db.update(chats).set({ title }).where(eq(chats.id, run.chatId));
    return title;
  } catch (error) {
    console.error("chat: could not make a title", model.id, error);
    try {
      await recordRun({
        chatId: run.chatId,
        latencyMs: null,
        model,
        purpose: "title",
        status: "error",
        userId: run.userId,
      });
    } catch (recordError) {
      console.error(
        "chat: could not record the title run",
        model.id,
        recordError
      );
    }
    return null;
  }
};
