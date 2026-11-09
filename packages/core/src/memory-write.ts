import "server-only";
import { user } from "@metobe/db/schema/auth";
import { messages } from "@metobe/db/schema/chat";
import {
  APICallError,
  Output,
  experimental_evaluate as evaluate,
  generateText,
} from "ai";
import type { LanguageModelUsage } from "ai";
import { and, desc, eq, lt } from "drizzle-orm";

import { getEvaluationModel, getLanguageModel } from "./ai";
import { recordRun } from "./chat-run";
import { getDb } from "./db";
import {
  applyWrite,
  ensureSelf,
  listEntities,
  listRecords,
  markWrite,
} from "./memory";
import type { QueuedWrite } from "./memory";
import {
  CONTEXT_TURNS,
  extractionSchema,
  memoryInstructions,
  memoryPrompt,
  mentionsUser,
  planWrite,
} from "./memory-extract";
import type { ChatTurn, KnownCard, OpenCommitment } from "./memory-extract";
import { GATE_QUESTIONS, gateState, nothingToKeep } from "./memory-gate";
import { groupMembers } from "./memory-groups";
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

/**
 * Told to the chat's model while the memory is on (ARCH §19). It reads the memory (a block in front of the message,
 * three tools) but does not keep it: without this it said «эту заметку убираю» about a promise that stayed there.
 */
export const MEMORY_NOTE = `The user has a memory of their work: people, organizations, projects, promises, events and rules from what they say in chats. When a message mentions someone the memory knows, what it keeps comes in a <memory> block in front of the message, from the app, not from the user; search_memory, memory_card, list_commitments and list_cards read more — list_cards when the question is who fits something, by meaning. A card's [id] (eight letters and digits) is for memory_card only: never show it to the user. Use the memory when it helps, and say where it comes from («по памяти, Ольга обещала…»); the user's words now come first. You can only read it: a separate memory keeps itself after your answer, and the user sees what it kept under your answer — never say you saved, noted, removed or updated anything, in it or in any «заметки». When you ask the user which one they mean («Андрей» — Седов or Ланьшин?), wait for the answer: do not go on with a guess in the same answer.`;

/** Memory works only while a model holds the «Память» job and the queue has its Redis (D39). */
export const isMemoryOn = async () =>
  Boolean(process.env.REDIS_URL) && (await getSlotModel("memory")) !== null;

/** The person turned their memory off (ARCH §19.1). */
const isOffFor = async (userId: string) => {
  const [row] = await getDb()
    .db.select({ off: user.memoryOff })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.off ?? true;
};

/**
 * The memory as one person has it: `service` — a model holds the «Память» job; `on` — and they have not turned theirs
 * off. Off either way, nothing of theirs is written or read.
 */
export const memoryStateFor = async (userId: string) => {
  const service = await isMemoryOn();
  return { on: service && !(await isOffFor(userId)), service };
};

export const isMemoryOnFor = async (userId: string) => {
  const state = await memoryStateFor(userId);
  return state.on;
};

/** The person's switch, in the account settings. */
export const setMemoryOff = async (userId: string, off: boolean) => {
  await getDb()
    .db.update(user)
    .set({ memoryOff: off })
    .where(eq(user.id, userId));
};

/** The note for the chat's instructions: `MEMORY_NOTE` while the person's memory is on, nothing while it is off. */
export const chatMemoryNote = async (userId: string) =>
  (await isMemoryOnFor(userId)) ? MEMORY_NOTE : "";

const WRITE_TIMEOUT_MS = 60_000;
/** Open commitments the model sees, newest first: enough for a person's running promises, short for the prompt. */
const MAX_OPEN = 60;
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
 * The chat the message follows (ARCH §19.8.2): the messages before it, as many as `chatContext` keeps — for the model
 * to understand «он», «передумал», an answer to the assistant's question or a story told over a few messages (S13,
 * part 5), not to record again: the queue reads a person's messages in order, what the earlier ones said is kept.
 */
const chatBefore = async (chatId: string, sentAt: Date) => {
  const rows = await getDb()
    .db.select({ parts: messages.parts, role: messages.role })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), lt(messages.createdAt, sentAt)))
    .orderBy(desc(messages.createdAt))
    .limit(CONTEXT_TURNS);
  return rows.toReversed().flatMap((r): ChatTurn[] => {
    const text = textOf(r.parts);
    return text && (r.role === "user" || r.role === "assistant")
      ? [{ role: r.role, text }]
      : [];
  });
};

/** A decision model's run, as usage counts it: its input only — it writes nothing. */
const decisionUsage = (
  inputTokens: number | undefined
): LanguageModelUsage => ({
  inputTokenDetails: {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    noCacheTokens: inputTokens,
  },
  inputTokens,
  outputTokenDetails: { reasoningTokens: 0, textTokens: 0 },
  outputTokens: 0,
  totalTokens: inputTokens,
});

const GATE_TIMEOUT_MS = 15_000;

/**
 * The first step (ARCH §19.4, Б2b): with a model in «Решения», it answers the gate's yes/no questions, and only a sure
 * «no» to all of them keeps the «Память» model from reading the message. No model, a failure or a timeout — the
 * message is read as before: the step only saves, it never loses a message.
 */
const nothingToKeepSaid = async (
  job: MemoryJob,
  text: string,
  before: ChatTurn[],
  sentAt: Date
) => {
  const model = await getSlotModel("decisions");
  if (!model) {
    return false;
  }
  const started = Date.now();
  const today = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: job.timeZone,
    weekday: "long",
    year: "numeric",
  }).format(sentAt);
  try {
    const result = await evaluate({
      abortSignal: AbortSignal.timeout(GATE_TIMEOUT_MS),
      maxRetries: 1,
      model: await getEvaluationModel(model.sourceId, model.modelId),
      providerOptions: { gateway: { zeroDataRetention: true } },
      questions: GATE_QUESTIONS,
      state: gateState(text.slice(0, MAX_TEXT), today, before),
    });
    await recordRun({
      chatId: job.chatId,
      latencyMs: Date.now() - started,
      model,
      providerMetadata: result.providerMetadata,
      purpose: "decide",
      status: "ok",
      usage: decisionUsage(result.usage.inputTokens),
      userId: job.ownerId,
    });
    return nothingToKeep(result.answers);
  } catch (error) {
    console.error("memory: the decision model did not answer", error);
    await recordRun({
      chatId: job.chatId,
      latencyMs: null,
      model,
      purpose: "decide",
      status: "error",
      userId: job.ownerId,
    }).catch((recordError: unknown) =>
      console.error("memory: could not record the run", recordError)
    );
    return false;
  }
};

/** A plan that adds, asks, settles or ends something — «Запомнено» or a question to show. */
const changesAnything = (plan: ReturnType<typeof planWrite>) =>
  plan.records.length > 0 ||
  plan.drafts.length > 0 ||
  plan.statuses.length > 0 ||
  plan.ends.length > 0;

/** The cards the model may point at, by short refs; a group with its people now, by the same refs. */
const knownCards = (
  entities: Awaited<ReturnType<typeof listEntities>>,
  members: Map<string, Set<string>>
): KnownCard[] => {
  const refs = new Map(entities.map((e, i) => [e.id, `c${i + 1}`]));
  return entities.flatMap((e) =>
    e.kind === "self"
      ? []
      : [
          {
            aliases: e.aliases,
            id: e.id,
            kind: e.kind,
            members:
              e.kind === "group"
                ? [...(members.get(e.id) ?? [])].flatMap(
                    (id) => refs.get(id) ?? []
                  )
                : undefined,
            name: e.name,
            ref: refs.get(e.id) ?? "",
            role: e.role,
          },
        ]
  );
};

/** The zone a queued message is read in: its own, else the person's from their settings (D31). */
const zoneOf = async (ownerId: string, write: QueuedWrite) => {
  if (write.timeZone) {
    return write.timeZone;
  }
  const [owner] = await getDb()
    .db.select({ timeZone: user.timeZone })
    .from(user)
    .where(eq(user.id, ownerId))
    .limit(1);
  return owner?.timeZone ?? "UTC";
};

/**
 * Reads the next message of a person's queue (ARCH §19.8.1) and answers what became of it: `off` — no model in
 * «Память», the message stays queued for later; `skipped` or `done`. A failed read is thrown for the drain to count.
 */
export const readWrite = async (ownerId: string, write: QueuedWrite) => {
  const model = await getSlotModel("memory");
  if (!model) {
    return "off";
  }
  // Turned off by the person since the message was queued, or the chat deleted: not read.
  if (!write.chatId || (await isOffFor(ownerId))) {
    await markWrite(ownerId, write.id, "skipped");
    return "skipped";
  }
  const job: MemoryJob = {
    chatId: write.chatId,
    messageId: write.messageId,
    ownerId,
    timeZone: await zoneOf(ownerId, write),
  };
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
  // Gone already (the message edited away) or nothing in words: nothing to read.
  const text = message?.role === "user" ? textOf(message.parts) : "";
  if (!(message && text)) {
    await markWrite(ownerId, write.id, "skipped");
    return "skipped";
  }
  const before = await chatBefore(job.chatId, message.createdAt);
  // A sure «nothing to keep» from the decision model: the «Память» model does not read it (Б2b).
  if (await nothingToKeepSaid(job, text, before, message.createdAt)) {
    await markWrite(job.ownerId, write.id, "skipped");
    return "skipped";
  }
  const [entities, facts] = await Promise.all([
    listEntities(job.ownerId),
    listRecords(job.ownerId, { kinds: ["fact"] }),
  ]);
  const cards = knownCards(entities, groupMembers(facts));
  const promises = await listRecords(job.ownerId, { kinds: ["commitment"] });
  const commitments: OpenCommitment[] = promises
    .flatMap((r) =>
      r.status === "open" || r.status === "unconfirmed"
        ? [{ due: r.dueAt, id: r.id, status: r.status, text: r.text }]
        : []
    )
    .slice(0, MAX_OPEN)
    .map((c, i) => ({ ...c, ref: `k${i + 1}` }));
  const started = Date.now();
  let result;
  try {
    result = await extract({
      abortSignal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      instructions: memoryInstructions({
        cards,
        commitments,
        sentAt: message.createdAt,
        timeZone: job.timeZone,
      }),
      model: await getLanguageModel(model.sourceId, model.modelId),
      prompt: memoryPrompt(text.slice(0, MAX_TEXT), before),
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
    // The drain counts the attempt: the message stays first in the queue until it is read or given up (§19.8.1).
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
    commitments,
    facts,
    selfId,
    timeZone: job.timeZone,
  });
  const kept = changesAnything(plan);
  if ((await applyWrite(job.ownerId, write.id, plan)) && kept) {
    // An open chat shows «Запомнено» or asks its question at once (P18).
    await announceMemory(job.ownerId, job.chatId);
  }
  return kept ? "done" : "skipped";
};
