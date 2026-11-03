import "server-only";
import type { ChatMessage, CompactionData } from "@metobe/contracts/chat";
import { APICallError, generateText } from "ai";

import { getLanguageModel } from "./ai";
import { getChatModel, listMessages, saveMessages } from "./chat";
import type { ChatModel } from "./chat";
import { recordRun } from "./chat-run";
import {
  CHARS_PER_TOKEN,
  chunksOf,
  compactInstructions,
  compactPrompt,
  lastCompaction,
  transcriptOf,
} from "./compact-transcript";
import { getSlotModel } from "./model-slots";

// «Сжать чат» (D37): a service model writes the summary of the conversation so far; the summary goes into the history
// as a message of its own, and from then on the chat's model gets the summary and what follows it — the user keeps
// every message. Asked for by the user only, never by itself.

/** Fewer questions than this since the last compaction: nothing worth compacting. */
export const MIN_QUESTIONS = 3;
/** The service model reads at most this share of its window at once; the rest of a long chat in further parts. */
const WINDOW_SHARE = 0.5;
/** A window not stated: read as Anthropic's default trigger would — 100k tokens. */
const DEFAULT_WINDOW = 200_000;
/** A summary is long by design (it replaces the chat), and may take its time on a slow model. */
const MAX_OUTPUT_TOKENS = 4000;
const TIMEOUT_MS = 120_000;

export type CompactResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; reason: "short" | "waiting" | "no-model" | "failed" };

/** The answer the chat ends with still waits for the user: a question of the model's, an approval. */
const waitsOnUser = (last: ChatMessage | undefined) =>
  last?.role === "assistant" &&
  last.parts.some(
    (p) =>
      "state" in p &&
      (p.state === "input-available" || p.state === "approval-requested")
  );

/** The questions asked since the last compaction (or ever). */
const questionsSince = (messages: ChatMessage[]) =>
  messages.slice(lastCompaction(messages) + 1).filter((m) => m.role === "user")
    .length;

/** The model the chat's last answer was by: what writes the summary when no service model has the job. */
const chatModelOf = (messages: ChatMessage[]) => {
  // The last answer's model (toReversed is past the web app's ES2022 target).
  let id: string | undefined;
  for (const m of messages) {
    id = (m.role === "assistant" ? m.metadata?.modelId : undefined) ?? id;
  }
  return id ? getChatModel(id) : Promise.resolve(null);
};

/**
 * The summary in one call; a provider that refuses `reasoning: "none"` (older reasoning models answer 400) is asked
 * once more with its default, as for chat titles.
 */
const summarize = async (
  model: Awaited<ReturnType<typeof getLanguageModel>>,
  locale: string,
  part: string,
  earlier: string | null
) => {
  const call = {
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    instructions: compactInstructions(locale),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 1,
    model,
    prompt: compactPrompt(part, earlier),
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

/** Runs the parts one after another, the summary so far carried into the next — each a run of its own in the usage. */
const summarizeAll = async (run: {
  chunks: string[];
  earlier: string | null;
  model: ChatModel;
  chatId: string;
  userId: string;
  locale: string;
}) => {
  const languageModel = await getLanguageModel(
    run.model.sourceId,
    run.model.modelId
  );
  let summary = run.earlier;
  for (const part of run.chunks) {
    const started = Date.now();
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each part needs the summary of the parts before it
      const result = await summarize(languageModel, run.locale, part, summary);
      // oxlint-disable-next-line eslint/no-await-in-loop -- recorded as it happens, so a failure later still counts this
      await recordRun({
        chatId: run.chatId,
        latencyMs: Date.now() - started,
        model: run.model,
        providerMetadata: result.providerMetadata,
        purpose: "compact",
        status: "ok",
        usage: result.totalUsage,
        userId: run.userId,
      });
      summary = result.text.trim() || summary;
    } catch (error) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- the failed call is billed too
        await recordRun({
          chatId: run.chatId,
          latencyMs: null,
          model: run.model,
          purpose: "compact",
          status: "error",
          userId: run.userId,
        });
      } catch (recordError) {
        console.error(
          "chat: could not record a failed compaction",
          recordError
        );
      }
      throw error;
    }
  }
  return summary;
};

/**
 * Compacts the user's chat: the summary of everything since the last compaction (with that one's summary) becomes a
 * new message at the end of the history. The caller checks the chat is the user's and that no answer is being
 * written; here — that there is enough to compact and that the chat does not wait on the user.
 */
export const compactChat = async (run: {
  chatId: string;
  userId: string;
  /** The user's interface language: the summary is written in it. */
  locale: string;
}): Promise<CompactResult> => {
  const messages = await listMessages(run.chatId);
  if (questionsSince(messages) < MIN_QUESTIONS) {
    return { ok: false, reason: "short" };
  }
  if (waitsOnUser(messages.at(-1))) {
    return { ok: false, reason: "waiting" };
  }
  const model =
    (await getSlotModel("summaries")) ?? (await chatModelOf(messages));
  if (!model) {
    return { ok: false, reason: "no-model" };
  }
  const { blocks, earlier } = transcriptOf(messages);
  const window = model.contextWindow ?? DEFAULT_WINDOW;
  const chunks = chunksOf(
    blocks,
    Math.floor(window * WINDOW_SHARE * CHARS_PER_TOKEN)
  );
  let summary: string | null;
  try {
    summary = await summarizeAll({ ...run, chunks, earlier, model });
  } catch (error) {
    console.error("chat: could not compact", run.chatId, model.id, error);
    return { ok: false, reason: "failed" };
  }
  if (!summary) {
    return { ok: false, reason: "failed" };
  }
  const data: CompactionData = {
    messages: messages.length,
    modelId: model.id,
    summary,
  };
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    metadata: { createdAt: new Date().toISOString() },
    parts: [{ data, type: "data-compaction" }],
    role: "system",
  };
  await saveMessages(run.chatId, [message]);
  return { message, ok: true };
};
