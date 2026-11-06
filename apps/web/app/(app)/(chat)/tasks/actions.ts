"use server";

import {
  applyTaskChange,
  cancelTaskChange,
  proposeTaskChange,
  revertTaskChange,
} from "@metobe/core/task-change";
import {
  createRun,
  createTaskFromDraft,
  deleteTask,
  getRunAnswer,
  getTask,
  markTaskSeen,
  setTaskEnabled,
  setTaskNotify,
} from "@metobe/core/tasks";
import { enqueueRun } from "@metobe/core/tasks-queue";
import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// What the task page does (ARCH §16.4): on and off, letters on and off, «Прогнать сейчас», delete, the answer of a past run,
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

/** «Удалить задачу»: for good, after the person confirmed it; the sidebar loses it. */
export const deleteTaskAction = async (taskId: string) => {
  const userId = await owner();
  if (!userId || !id.safeParse(taskId).success) {
    return { ok: false };
  }
  const ok = await deleteTask(userId, taskId);
  revalidatePath("/", "layout");
  return { ok };
};

// ── A change in words (ARCH §16.1a, P15) ─────────────────────────────────────────────────────────────────────────

const request = z.string().trim().min(1).max(2000);

/** «Что поменять в задаче…»: the model's change, kept as a version not applied; the page shows «было → стало». */
export const proposeTaskChangeAction = async (taskId: string, text: string) => {
  const userId = await owner();
  const asked = request.safeParse(text);
  if (!userId || !id.safeParse(taskId).success || !asked.success) {
    return { error: "failed" as const, ok: false as const };
  }
  const locale = await getLocale();
  const result = await proposeTaskChange({
    locale: locale === "en" ? "en" : "ru",
    ownerId: userId,
    request: asked.data,
    taskId,
  });
  revalidatePath(`/tasks/${taskId}`);
  return result;
};

const changeAction =
  (fn: (userId: string, taskId: string) => Promise<boolean>) =>
  async (taskId: string) => {
    const userId = await owner();
    if (!userId || !id.safeParse(taskId).success) {
      return { ok: false };
    }
    const ok = await fn(userId, taskId);
    revalidatePath("/", "layout");
    return { ok };
  };

export const applyTaskChangeAction = changeAction((userId, taskId) =>
  applyTaskChange(userId, taskId)
);

export const cancelTaskChangeAction = changeAction(cancelTaskChange);

export const revertTaskChangeAction = changeAction(async (userId, taskId) => {
  const t = await getTranslations("tasks");
  return revertTaskChange(userId, taskId, t("revertedSummary"));
});

/** «Тестовый запуск»: a run on the change not applied yet — no letters, not counted among failures. */
export const testTaskChangeAction = async (taskId: string) => {
  const userId = await owner();
  if (!userId || !id.safeParse(taskId).success) {
    return { ok: false };
  }
  if (!(await getTask(userId, taskId))) {
    return { ok: false };
  }
  const now = new Date();
  try {
    await enqueueRun(taskId, now, "test");
  } catch (error) {
    console.error("tasks: test run", error);
    return { ok: false };
  }
  await createRun(taskId, now, "test");
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

const draftInput = z.object({
  chatId: z.uuid(),
  color: z.string().max(40),
  name: z.string().trim().min(1).max(60),
  timeZone: z.string().max(80),
  toolCallId: z.string().min(1).max(200),
});

/** «Создать задачу» on a draft's card (P11): the task from the draft stored in the chat, in the browser's time zone. */
export const createTaskAction = async (input: z.input<typeof draftInput>) => {
  const userId = await owner();
  const parsed = draftInput.safeParse(input);
  if (!userId || !parsed.success) {
    return { ok: false as const };
  }
  const result = await createTaskFromDraft({ ...parsed.data, ownerId: userId });
  return result.id
    ? { id: result.id, ok: true as const }
    : { ok: false as const };
};
