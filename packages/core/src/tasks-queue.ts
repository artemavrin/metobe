import "server-only";
import type { TaskTrigger } from "@metobe/contracts/tasks";
import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { createClient } from "redis";
import { z } from "zod";

import { runJobId } from "./task-schedule";

// The queue periodic tasks run through (ARCH §16.2): one job scheduler ticks every minute («dispatch»: claim what is
// due in Postgres), and each due task becomes a «run» job whose id is the task and its due time — so a tick that
// comes twice, or «Прогнать сейчас» pressed twice in the same second, never runs it twice. The worker processes both.

export const TASKS_QUEUE = "tasks";
export const DISPATCH_SCHEDULER = "tasks-dispatch";

export interface DispatchJob {
  kind: "dispatch";
}
export interface RunJob {
  kind: "run";
  taskId: string;
  scheduledFor: string;
  trigger: TaskTrigger;
}
export type TaskJob = DispatchJob | RunJob;

/**
 * The queue's Redis: `REDIS_URL`, through node-redis — the client the rest of core uses. BullMQ 6 takes a client
 * instance and connects it itself (and duplicates it for a worker's waiting commands), so `ioredis` is not needed.
 * A new client each time: a queue and a worker each hold their own.
 */
export const tasksConnection = (): ConnectionOptions => {
  const url = z.url().parse(process.env.REDIS_URL);
  return createClient({ url }).on("error", (error) =>
    console.error("tasks: redis", error)
  ) as unknown as ConnectionOptions;
};

let queue: Queue<TaskJob> | undefined;

export const getTasksQueue = () => {
  queue ??= new Queue<TaskJob>(TASKS_QUEUE, {
    connection: tasksConnection(),
    // Finished jobs are the runs' business, kept in Postgres: Redis keeps only a short tail to look at.
    defaultJobOptions: { removeOnComplete: 200, removeOnFail: 500 },
  });
  return queue;
};

/** One run of a task for a due time; the same task, time and trigger again is the same job. */
export const enqueueRun = (
  taskId: string,
  scheduledFor: Date,
  trigger: TaskTrigger
) =>
  getTasksQueue().add(
    "run",
    { kind: "run", scheduledFor: scheduledFor.toISOString(), taskId, trigger },
    { jobId: runJobId(taskId, scheduledFor, trigger) }
  );

/** The minute tick, one for the whole installation: upserting it again changes nothing. */
export const startDispatch = () =>
  getTasksQueue().upsertJobScheduler(
    DISPATCH_SCHEDULER,
    { pattern: "* * * * *" },
    { data: { kind: "dispatch" }, name: "dispatch" }
  );

export const closeTasksQueue = async () => {
  await queue?.close();
  queue = undefined;
};
