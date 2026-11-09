import "server-only";
import { Queue, Worker } from "bullmq";

import { writeMemory, isMemoryOnFor } from "./memory-write";
import type { MemoryJob } from "./memory-write";
import { tasksConnection } from "./tasks-queue";

// The memory's queue (ARCH §19.4): a message to read is a job, the worker reads it. Off the chat's path, and with
// retries — the S13 runs saw a model time out now and then. The same message queued twice is read once: the write
// row is the guard (core/memory), not the job id, so a message sent again after an edit is read afresh.

const MEMORY_QUEUE = "memory";
const CONCURRENCY = 2;

let queue: Queue<MemoryJob> | undefined;

const getMemoryQueue = () => {
  queue ??= new Queue<MemoryJob>(MEMORY_QUEUE, {
    connection: tasksConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { delay: 30_000, type: "exponential" },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  });
  return queue;
};

/**
 * Queues a message for the memory — nothing at all while the memory is off. Never throws: the chat that calls it
 * must not stumble on the memory.
 */
export const queueMemoryWrite = async (job: MemoryJob) => {
  try {
    if (await isMemoryOnFor(job.ownerId)) {
      await getMemoryQueue().add("write", job);
    }
  } catch (error) {
    console.error("memory: could not queue a write", error);
  }
};

/** Starts reading queued messages; answers how to stop. */
export const startMemoryWorker = () => {
  const worker = new Worker<MemoryJob>(
    MEMORY_QUEUE,
    (job) => writeMemory(job.data),
    { concurrency: CONCURRENCY, connection: tasksConnection() }
  );
  worker.on("failed", (job, error) =>
    console.error(
      `memory: write failed (attempt ${job?.attemptsMade ?? "?"})`,
      error.message
    )
  );
  return async () => {
    await worker.close();
    await queue?.close();
  };
};
