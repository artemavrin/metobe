import "server-only";
import { user } from "@metobe/db/schema/auth";
import { messages } from "@metobe/db/schema/chat";
import { APICallError, Output, generateText } from "ai";
import { and, desc, eq, lt } from "drizzle-orm";

import { getLanguageModel } from "./ai";
import { recordRun } from "./chat-run";
import { getDb } from "./db";
import {
  applyWrite,
  createWrite,
  ensureSelf,
  listEntities,
  markWrite,
} from "./memory";
import {
  extractionSchema,
  memoryInstructions,
  memoryPrompt,
  mentionsUser,
  planWrite,
} from "./memory-extract";
import type { KnownCard } from "./memory-extract";
import { getSlotModel } from "./model-slots";
import { announceMemory } from "./task-events";

// The silent writer (ARCH §19.4): a message the person sent is read by the «Память» model, and what it finds goes
// into their memory. Runs in the worker, off the chat's path; a failure is thrown for the queue to try again.

export interface MemoryJob {
  ownerId: string;
  chatId: string;
  messageId: string;
  /** The person's zone when they sent it (D31): «вчера» and «в среду» are counted in it. */
  timeZone: string;
}

/** Memory works only while a model holds the «Память» job and the queue has its Redis (D39). */
export const isMemoryOn = async () =>
  Boolean(process.env.REDIS_URL) && (await getSlotModel("memory")) !== null;

const WRITE_TIMEOUT_MS = 60_000;
/** A message longer than this is cut: what is worth remembering is said in words, not in pasted pages. */
const MAX_TEXT = 8000;

/**
 * Short thinking: on S13 Gemini 3.5 Flash kept every record, date and question with it at less than half the price
 * and a third of the time of its default (`none` it does not take through the Gateway — it came out dearer). A
 * provider that refuses the setting (400) is asked once more with its default.
 */
const extract = async (call: {
  model: Awaited<ReturnType<typeof getLanguageModel>>;
  instructions: string;
  prompt: string;
  abortSignal: AbortSignal;
  providerOptions?: { gateway: { zeroDataRetention: boolean } };
}) => {
  const ask = (reasoning?: "low") =>
    generateText({
      ...call,
      maxRetries: 1,
      output: Output.object({ schema: extractionSchema }),
      ...(reasoning ? { reasoning } : {}),
    });
  try {
    return await ask("low");
  } catch (error) {
    if (APICallError.isInstance(error) && error.statusCode === 400) {
      return ask();
    }
    throw error;
  }
};

const textOf = (parts: (typeof messages.$inferSelect)["parts"]) =>
  parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim();

/**
 * The exchange the message follows: the person's previous message and the answer to it — for the model to understand
 * «он», «передумал» or an answer to the assistant's question (S13, part 5), not to record again.
 */
const exchangeBefore = async (chatId: string, sentAt: Date) => {
  const rows = await getDb()
    .db.select({ parts: messages.parts, role: messages.role })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), lt(messages.createdAt, sentAt)))
    .orderBy(desc(messages.createdAt))
    .limit(4);
  const answer = rows.find((r) => r.role === "assistant");
  const question = rows.find((r) => r.role === "user");
  return {
    assistant: answer ? textOf(answer.parts) || undefined : undefined,
    user: question ? textOf(question.parts) || undefined : undefined,
  };
};

/** What became of the job — for the worker's log. */
export const writeMemory = async (job: MemoryJob) => {
  const model = await getSlotModel("memory");
  if (!model) {
    return "off";
  }
  const write = await createWrite(job.ownerId, {
    chatId: job.chatId,
    messageId: job.messageId,
  });
  if (!["queued", "failed"].includes(write.status)) {
    return write.status;
  }
  const { db } = getDb();
  const [message] = await db
    .select({
      createdAt: messages.createdAt,
      parts: messages.parts,
      role: messages.role,
    })
    .from(messages)
    .where(and(eq(messages.id, job.messageId), eq(messages.chatId, job.chatId)))
    .limit(1);
  // Gone already (the chat deleted, the message edited away) or nothing in words: nothing to read.
  const text = message?.role === "user" ? textOf(message.parts) : "";
  if (!(message && text)) {
    await markWrite(job.ownerId, write.id, "skipped");
    return "skipped";
  }
  const entities = await listEntities(job.ownerId);
  const cards: KnownCard[] = entities.flatMap((e, i) =>
    e.kind === "self"
      ? []
      : [
          {
            aliases: e.aliases,
            id: e.id,
            kind: e.kind,
            name: e.name,
            ref: `c${i + 1}`,
            role: e.role,
          },
        ]
  );
  const started = Date.now();
  let result;
  try {
    result = await extract({
      abortSignal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      instructions: memoryInstructions({
        cards,
        sentAt: message.createdAt,
        timeZone: job.timeZone,
      }),
      model: await getLanguageModel(model.sourceId, model.modelId),
      prompt: memoryPrompt(
        text.slice(0, MAX_TEXT),
        await exchangeBefore(job.chatId, message.createdAt)
      ),
      // A person's memory is not left with the provider behind the Gateway (D39).
      providerOptions:
        model.kind === "gateway"
          ? { gateway: { zeroDataRetention: true } }
          : undefined,
    });
  } catch (error) {
    await recordRun({
      chatId: job.chatId,
      latencyMs: null,
      model,
      purpose: "memory",
      status: "error",
      userId: job.ownerId,
    }).catch((recordError: unknown) =>
      console.error("memory: could not record the run", recordError)
    );
    await markWrite(
      job.ownerId,
      write.id,
      "failed",
      error instanceof Error ? error.message.slice(0, 500) : String(error)
    );
    throw error;
  }
  await recordRun({
    chatId: job.chatId,
    latencyMs: Date.now() - started,
    model,
    providerMetadata: result.providerMetadata,
    purpose: "memory",
    status: "ok",
    usage: result.totalUsage,
    userId: job.ownerId,
  });
  const extraction = result.output;
  let selfId: string | null = null;
  if (mentionsUser(extraction)) {
    const [owner] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, job.ownerId))
      .limit(1);
    const self = await ensureSelf(job.ownerId, owner?.name ?? "");
    selfId = self.id;
  }
  const plan = planWrite(extraction, {
    cards,
    selfId,
    timeZone: job.timeZone,
  });
  const kept = plan.records.length > 0 || plan.drafts.length > 0;
  if ((await applyWrite(job.ownerId, write.id, plan)) && kept) {
    // An open chat shows «Запомнено» or asks its question at once (P18).
    await announceMemory(job.ownerId, job.chatId);
  }
  return kept ? "done" : "skipped";
};
