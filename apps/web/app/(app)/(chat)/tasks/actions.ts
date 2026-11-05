"use server";

import {
  createRun,
  getRunAnswer,
  getTask,
  markTaskSeen,
  setTaskEnabled,
  setTaskNotify,
} from "@metobe/core/tasks";
import { enqueueRun } from "@metobe/core/tasks-queue";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// What the task page does (ARCH §16.4): on and off, letters on and off, «Прогнать сейчас», the answer of a past run,
// «seen». Every action is the owner's own task only — someone else's is as missing as one that never was.

const id = z.uuid();

const owner = async () => {
  const { user } = await getSettingsViewer();
  return user?.id ?? null;
};

export const setTaskEnabledAction = async (
  taskId: string,
  enabled: boolean
) => {
  const userId = await owner();
  if (!userId || !id.safeParse(taskId).success) {
    return { ok: false };
  }
  const ok = await setTaskEnabled(userId, taskId, enabled);
  revalidatePath("/", "layout");
  return { ok };
};

export const setTaskNotifyAction = async (taskId: string, on: boolean) => {
  const userId = await owner();
  if (!userId || !id.safeParse(taskId).success) {
    return { ok: false };
  }
  return { ok: await setTaskNotify(userId, taskId, on) };
};

/**
 * «Прогнать сейчас»: a run for this moment. The job goes first, then its row — the worker makes the same row for the
 * same time, so whichever comes first, there is one run; the row is there at once for the page to show «в очереди».
 */
export const runTaskNowAction = async (taskId: string) => {
  const userId = await owner();
  if (!userId || !id.safeParse(taskId).success) {
    return { ok: false };
  }
  if (!(await getTask(userId, taskId))) {
    return { ok: false };
  }
  const now = new Date();
  try {
    await enqueueRun(taskId, now, "manual");
  } catch (error) {
    console.error("tasks: run now", error);
    return { ok: false };
  }
  await createRun(taskId, now, "manual");
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
};

/** A past run's answer, opened from the list under the spoiler. */
export const runAnswerAction = async (runId: string) => {
  const userId = await owner();
  if (!userId || !id.safeParse(runId).success) {
    return null;
  }
  return await getRunAnswer(userId, runId);
};

/** The person opened the task: its new result is seen, the dot in the sidebar goes out. */
export const markTaskSeenAction = async (taskId: string) => {
  const userId = await owner();
  if (!userId || !id.safeParse(taskId).success) {
    return;
  }
  await markTaskSeen(userId, taskId);
  revalidatePath("/", "layout");
};
