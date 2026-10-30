import "server-only";
import { chats } from "@metobe/db/schema/chat";
import { APICallError, generateText } from "ai";
import { eq } from "drizzle-orm";

import { getLanguageModel } from "./ai";
import { recordRun } from "./chat-run";
import { cleanTitle } from "./chat-title-clean";
import { getDb } from "./db";
import { getSlotModel } from "./model-slots";

/** A locale's language in English words, for the model: `ru` → «Russian»; the code itself when it is not known. */
const languageOf = (locale: string) => {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale
    );
  } catch {
    return locale;
  }
};

/**
 * The title is in the language the user picked for the interface, not the message's: a chat started with an English
 * error log still reads as the rest of the sidebar. The message comes inside tags, so a short one («привет») is not
 * taken for part of the task — a small model answered «User's first message» to it.
 */
const instructionsFor = (locale: string) =>
  `You name chats. The user's first message is inside <message> tags. Write a title for the conversation it starts: ` +
  `2–6 words in ${languageOf(locale)}, about what the user wants, starting with a capital letter, no quotes, no final punctuation. ` +
  `Answer with the title only — never describe the message itself.`;

/**
 * A title wants no thinking: it is faster and a thinking model would spend the few output tokens on it. A provider
 * that does not take `none` (older OpenAI reasoning models) refuses with 400 — then once more with its default.
 */
const titleText = async (
  model: Awaited<ReturnType<typeof getLanguageModel>>,
  text: string,
  locale: string
) => {
  const call = {
    instructions: instructionsFor(locale),
    maxOutputTokens: 40,
    model,
    prompt: `<message>\n${text.slice(0, 4000)}\n</message>`,
  };
  try {
    return await generateText({ ...call, reasoning: "none" });
  } catch (error) {
    if (APICallError.isInstance(error) && error.statusCode === 400) {
      return generateText(call);
    }
    throw error;
  }
};

/**
 * A chat's title from its first message by the «titles» service model; null when no model has the job, the call
 * fails or says nothing — the chat keeps its first line then. The run is recorded as a service one.
 */
export const generateChatTitle = async (run: {
  chatId: string;
  userId: string;
  text: string;
  /** The user's interface language (`ru`, `en`): the title is written in it. */
  locale: string;
  /** Called once a model has the job, before it is asked: the chat can say it is being named. */
  onStart?: () => void;
}) => {
  const model = await getSlotModel("titles");
  if (!model) {
    return null;
  }
  run.onStart?.();
  const started = Date.now();
  try {
    const result = await titleText(
      await getLanguageModel(model.sourceId, model.modelId),
      run.text,
      run.locale
    );
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
