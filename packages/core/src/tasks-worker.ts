import "server-only";
import { Worker } from "bullmq";

import { executeRun } from "./task-run";
import { claimDueTasks, createRun } from "./tasks";
import {
  TASKS_QUEUE,
  closeTasksQueue,
  enqueueRun,
  startDispatch,
  tasksConnection,
} from "./tasks-queue";
import type { TaskJob } from "./tasks-queue";

// The worker's side of periodic tasks (ARCH §16.2): the minute tick claims what is due in Postgres and queues a run
// for each; a run job creates its row (the same one again for the same due time) and executes it. Runs go a few at a
// time — sources have quotas, and a task waits a minute without harm. A job's abort signal stops the run's model call.

/** How many runs go at once. */
const CONCURRENCY = 2;

const process = async (
  job: { name: string; data: TaskJob },
  _token?: string,
  signal?: AbortSignal
) => {
  if (job.data.kind === "dispatch") {
    const due = await claimDueTasks();
    await Promise.all(
      due.map((d) => enqueueRun(d.taskId, d.scheduledFor, "schedule"))
    );
    return { queued: due.length };
  }
  const runId = await createRun(
    job.data.taskId,
    new Date(job.data.scheduledFor),
    job.data.trigger
  );
  if (runId) {
    await executeRun(runId, signal);
  }
  return { runId };
};

/** Starts the minute tick and the runs; answers how to stop them. */
export const startTasksWorker = async () => {
  await startDispatch();
  const worker = new Worker<TaskJob>(TASKS_QUEUE, process, {
    concurrency: CONCURRENCY,
    connection: tasksConnection(),
  });
  worker.on("failed", (job, error) =>
    console.error(`tasks: ${job?.name ?? "job"} failed`, error)
  );
  return async () => {
    await worker.close();
    await closeTasksQueue();
  };
};
