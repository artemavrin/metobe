import "server-only";
import { DelayedError, Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import { createClient } from "redis";
import { z } from "zod";

import { isChatMemoryOff } from "./chat";
import {
  CHAT_SOURCE,
  createWrite,
  failWriteAttempt,
  nextQueuedWrite,
} from "./memory";
import type { WriteMaterial } from "./memory";
import { drainQueue } from "./memory-drain";
import { memorySource } from "./memory-sources";
import { isMemoryOnFor, readWrite } from "./memory-write";
import { isGuardUnavailable } from "./pii-guard";
import { tasksConnection } from "./tasks-queue";

// The memory's queue (ARCH §19.4, §19.8.1). Material to read — a chat's message today (ARCH §19.9.5) — is a row in
// `memory_writes`, made when it is queued; a job only says whose queue to read. The worker reads a person's queue in
// the order the material was said, one at a time, under a lock in Redis — two messages in a row never race for the
// same cards. Different people are read side by side. A read that fails stays first in line: the job is tried again
// later, and nothing later overtakes it.

/** Material for the memory, from any source. */
export interface MemoryMaterial {
  ownerId: string;
  /** Which adapter loads it (`memory-sources.ts`), and which material it is there: for a chat — the message's id. */
  source: string;
  sourceKey: string;
  /** The chat it was said in, when there is one. */
  chatId?: string;
  /** When it was said — the queue's order; asked of the source, if not given. */
  at?: Date;
  /** The person's zone when they said it (D31): «вчера» and «в среду» are counted in it. */
  timeZone: string;
  /** The material itself, for a source with no store of its own: the write keeps it, sealed. */
  material?: WriteMaterial;
}

/** A job queued before §19.9.5: a chat's message, named by its own fields. */
interface ChatMessageJob {
  ownerId: string;
  chatId: string;
  messageId: string;
  timeZone: string;
}

const MEMORY_QUEUE = "memory";
/** People read side by side; one person's messages — always one at a time. */
const CONCURRENCY = 2;
/** Reads of one message before it is given up and the queue goes on. */
const MAX_ATTEMPTS = 3;
/** Longer than one read can take (the gate's 15 s and the model's 60 s); held again after each message. */
const LOCK_MS = 120_000;
/** A job that finds the person's queue being read waits this long and looks again. */
const BUSY_DELAY_MS = 5000;
/**
 * Data protection down: the queue waits this long, the message stays first and loses no attempt. Retried sooner, each
 * read is half a minute of the service's work while it is overloaded, and three of them gave the message up.
 */
const GUARD_DELAY_MS = 5 * 60_000;

/** A job: whose queue to read. Jobs queued before §19.8.1 carry the message too — it is put in the queue first. */
type QueueJob = { ownerId: string } | ChatMessageJob;

let queue: Queue<QueueJob> | undefined;

const getMemoryQueue = () => {
  queue ??= new Queue<QueueJob>(MEMORY_QUEUE, {
    connection: tasksConnection(),
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff: { delay: 30_000, type: "exponential" },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  });
  return queue;
};

/**
 * Puts material in its person's queue: the write row, once — queuing it again changes nothing. Its place in the queue
 * is when it was said: what the caller says, else what its source says, else now.
 */
const enqueue = async (material: MemoryMaterial) => {
  const write = await createWrite(material.ownerId, {
    chatId: material.chatId,
    material: material.material,
    sentAt:
      material.at ??
      (await memorySource(material.source)?.saidAt?.(material.sourceKey)),
    source: material.source,
    sourceKey: material.sourceKey,
    timeZone: material.timeZone,
  });
  return write.id;
};

/**
 * Queues material for the memory — nothing at all while the memory is off — and gives its write's id; null — not
 * queued. Never throws: the chat that calls it must not stumble on the memory.
 */
export const queueMemoryWrite = async (material: MemoryMaterial) => {
  try {
    // «Не запоминать этот чат»: a message of such a chat is not read at all (§19.8.13).
    if (
      material.source === CHAT_SOURCE &&
      material.chatId &&
      (await isChatMemoryOff(material.ownerId, material.chatId))
    ) {
      return null;
    }
    if (await isMemoryOnFor(material.ownerId)) {
      const id = await enqueue(material);
      await getMemoryQueue().add("write", { ownerId: material.ownerId });
      return id;
    }
  } catch (error) {
    console.error("memory: could not queue a write", error);
  }
  return null;
};

// ── The lock: one reader of a person's queue at a time ─────────────────────────────────────────────────────────────

/** Holds the lock longer, only while it is still this reader's. */
const HOLD = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
/** Lets the lock go, only while it is still this reader's. */
const DROP = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

const connect = async () => {
  const client = createClient({ url: z.url().parse(process.env.REDIS_URL) }).on(
    "error",
    (error) => console.error("memory: redis", error)
  );
  await client.connect();
  return client;
};

let lockClient: ReturnType<typeof connect> | undefined;
const locks = async () => {
  lockClient ??= connect();
  try {
    return await lockClient;
  } catch (error) {
    // The next job tries to connect again.
    lockClient = undefined;
    throw error;
  }
};

const lockKey = (ownerId: string) => `memory:lock:${ownerId}`;

const takeLock = async (ownerId: string) => {
  const token = crypto.randomUUID();
  const client = await locks();
  const set = await client.set(lockKey(ownerId), token, {
    condition: "NX",
    expiration: { type: "PX", value: LOCK_MS },
  });
  return set === "OK" ? token : null;
};

const holdLock = async (ownerId: string, token: string) => {
  const client = await locks();
  const held = await client.eval(HOLD, {
    arguments: [token, String(LOCK_MS)],
    keys: [lockKey(ownerId)],
  });
  return held === 1;
};

const dropLock = async (ownerId: string, token: string) => {
  try {
    const client = await locks();
    await client.eval(DROP, { arguments: [token], keys: [lockKey(ownerId)] });
  } catch (error) {
    // It runs out by itself in LOCK_MS.
    console.error("memory: could not let the lock go", error);
  }
};

// ── The worker ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Reads a person's queue to the end; another reader at it — the job waits a little and looks again. */
const readQueue = async (job: Job<QueueJob>, token?: string) => {
  const { ownerId } = job.data;
  if ("messageId" in job.data) {
    const { chatId, messageId, timeZone } = job.data;
    await enqueue({
      chatId,
      ownerId,
      source: CHAT_SOURCE,
      sourceKey: messageId,
      timeZone,
    });
  }
  const lock = await takeLock(ownerId);
  if (!lock) {
    await job.moveToDelayed(Date.now() + BUSY_DELAY_MS, token);
    throw new DelayedError();
  }
  let end: Awaited<ReturnType<typeof drainQueue>>;
  try {
    end = await drainQueue({
      fail: (id, error) => failWriteAttempt(ownerId, id, error, MAX_ATTEMPTS),
      hold: () => holdLock(ownerId, lock),
      next: () => nextQueuedWrite(ownerId),
      read: (write) => readWrite(ownerId, write),
      waits: isGuardUnavailable,
    });
  } finally {
    await dropLock(ownerId, lock);
  }
  if (end === "waiting") {
    console.warn("memory: data protection is down, the queue waits");
    await job.moveToDelayed(Date.now() + GUARD_DELAY_MS, token);
    throw new DelayedError();
  }
  return end;
};

/** Starts reading queued messages; answers how to stop. */
export const startMemoryWorker = () => {
  const worker = new Worker<QueueJob>(MEMORY_QUEUE, readQueue, {
    concurrency: CONCURRENCY,
    connection: tasksConnection(),
  });
  worker.on("failed", (job, error) =>
    console.error(
      `memory: reading a queue failed (attempt ${job?.attemptsMade ?? "?"})`,
      error.message
    )
  );
  return async () => {
    await worker.close();
    await queue?.close();
    if (lockClient) {
      try {
        const client = await lockClient;
        await client.quit();
      } catch {
        // Closing anyway: the lock runs out by itself.
      }
    }
  };
};
