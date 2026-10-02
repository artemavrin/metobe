import "server-only";
import { files } from "@metobe/db/schema/files";
import { APICallError, generateText } from "ai";
import { eq } from "drizzle-orm";

import { getLanguageModel } from "./ai";
import { recordRun } from "./chat-run";
import { getDb } from "./db";
import { getSlotModel } from "./model-slots";

// «Vision» (D33, level 3 of reading a file): a picture goes to the service model with sight, which says what it shows
// and writes out the text in it; a chat model that cannot see reads that. The words are kept on the file's row, so a
// picture is described once.

const INSTRUCTIONS =
  "Describe this picture for someone who cannot see it: what it shows, in a few plain sentences, then every piece " +
  "of text in it, written out exactly as it stands (a table as rows). Do not guess what is not visible. " +
  "Answer in the language of the text in the picture, or in English if it has none.";

/** Sight wants no thinking: it is faster, and the answer is the description. A provider that refuses `none` gets its default. */
const describeCall = async (
  model: Awaited<ReturnType<typeof getLanguageModel>>,
  image: Uint8Array,
  mediaType: string
) => {
  const call = {
    maxOutputTokens: 2000,
    messages: [
      {
        content: [
          { text: INSTRUCTIONS, type: "text" as const },
          { image, mediaType, type: "image" as const },
        ],
        role: "user" as const,
      },
    ],
    model,
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

export type Description = { text: string } | { error: "off" | "failed" };

/**
 * What a picture shows, by the «vision» service model; `off` when no model has the job. The run is recorded as a
 * service one and the words are kept on the file.
 */
export const describeImage = async (run: {
  chatId: string;
  userId: string;
  fileId: string;
  mediaType: string;
  bytes: Uint8Array;
}): Promise<Description> => {
  const model = await getSlotModel("vision");
  if (!model) {
    return { error: "off" };
  }
  const started = Date.now();
  try {
    const result = await describeCall(
      await getLanguageModel(model.sourceId, model.modelId),
      run.bytes,
      run.mediaType
    );
    await recordRun({
      chatId: run.chatId,
      latencyMs: Date.now() - started,
      model,
      providerMetadata: result.providerMetadata,
      purpose: "describe",
      status: "ok",
      usage: result.totalUsage,
      userId: run.userId,
    });
    const text = result.text.trim();
    if (!text) {
      return { error: "failed" };
    }
    const { db } = getDb();
    await db
      .update(files)
      .set({ description: text })
      .where(eq(files.id, run.fileId));
    return { text };
  } catch (error) {
    console.error("vision: could not describe", run.fileId, model.id, error);
    try {
      await recordRun({
        chatId: run.chatId,
        latencyMs: null,
        model,
        purpose: "describe",
        status: "error",
        userId: run.userId,
      });
    } catch (recordError) {
      console.error("vision: could not record the run", recordError);
    }
    return { error: "failed" };
  }
};
