import "server-only";
import {
  MAIL_SOURCE,
  WEB_SOURCE,
  taskChangeSchema,
} from "@metobe/contracts/tasks";
import type { TaskChange, TaskSnapshot } from "@metobe/contracts/tasks";
import { chats } from "@metobe/db/schema/chat";
import { taskRuns, taskVersions, tasks } from "@metobe/db/schema/tasks";
import { generateText, stepCountIs, tool } from "ai";
import { and, asc, eq, gt, inArray, isNotNull } from "drizzle-orm";

import { getLanguageModel } from "./ai";
import { getChatModel } from "./chat";
import { recordRun } from "./chat-run";
import { sourcesOf } from "./chat-tools/task-draft-tool";
import { getDb } from "./db";
import { listChatServers } from "./mcp";
import {
  MIN_GAP_MINUTES,
  isTooFrequent,
  isValidSchedule,
  nextRun,
  scheduleWords,
} from "./task-schedule";
import { getTask } from "./tasks";
import type { TaskRow } from "./tasks";

// A task changed in words (ARCH §16.1a, P15, D28). The model fills `update_task` with what changes; nothing is
// applied — the change is kept as the next version, not the task's yet, and the page shows «было → стало». A test run
// goes on that version. «Применить» moves the task onto it, «Отменить» drops it with its test runs, «Вернуть как
// было» writes the version before the last as a new one. Versions are a line: a pending one is always the task's
// version + 1.

export const TASK_CHANGE_TOOL = "update_task";

const CHANGE_TIMEOUT_MS = 60_000;

type Tx = Parameters<
  Parameters<ReturnType<typeof getDb>["db"]["transaction"]>[0]
>[0];

const snapshotOf = (t: TaskRow): TaskSnapshot => ({
  catalogIds: t.catalogIds,
  cron: t.cron,
  instructions: t.instructions,
  modelId: t.modelId,
  reportWhen: t.reportWhen,
  timezone: t.timezone,
});

const languageOf = (locale: "ru" | "en") =>
  locale === "en" ? "English" : "Russian";

const instructionsFor = (
  task: TaskRow,
  servers: { id: string; key: string; title: string }[],
  locale: "ru" | "en"
) => {
  const sources =
    task.catalogIds === null
      ? "everything the person has"
      : servers
          .filter((s) => task.catalogIds?.includes(s.id))
          .map((s) => s.title)
          .join(", ") || "none";
  return [
    "You change a periodic task at the person's request. Nothing is applied by you: the person sees the change and applies it.",
    `The task now:\nName: ${task.name}\nInstructions:\n${task.instructions}\nSchedule: ${task.cron} (${scheduleWords(task.cron, locale)}), time zone ${task.timezone}\nSources: ${sources}\nReport: ${task.reportWhen === "always" ? "after every run" : "only when something changed"}`,
    `Services the person has: ${servers.map((s) => `${s.key} — ${s.title}`).join("; ") || "none"}; also «${MAIL_SOURCE}» (the person's mail) and «${WEB_SOURCE}» (websites).`,
    `Call ${TASK_CHANGE_TOOL} once with only what changes; everything else null. New instructions are given whole: the current ones with the change made, the rest kept word for word. The schedule is a cron in ${task.timezone}; a task runs at most every ${MIN_GAP_MINUTES} minutes.`,
    `If the request is not a change of this task, or it cannot be done by one, do not call the tool: answer in one short plain sentence in ${languageOf(locale)}.`,
  ].join("\n\n");
};

/** Checks the model's change the way a draft is checked: the cron parses and is not too frequent. */
const checkChange = (change: TaskChange, timeZone: string) => {
  const cron = change.cron?.trim();
  if (cron && !isValidSchedule(cron, timeZone)) {
    return `«${cron}» is not a cron of five fields; give it as minute hour day month weekday.`;
  }
  if (cron && isTooFrequent(cron)) {
    return `«${cron}» runs more often than every ${MIN_GAP_MINUTES} minutes; a task runs at most every ${MIN_GAP_MINUTES} minutes.`;
  }
  return null;
};

/** The version the change makes: the task's own fields with the changed ones put in. */
const nextSnapshot = (
  current: TaskSnapshot,
  change: TaskChange,
  servers: { id: string; key: string; title: string }[],
  locale: "ru" | "en"
): TaskSnapshot => {
  const found = change.sources
    ? sourcesOf(change.sources, servers, locale)
    : null;
  return {
    ...current,
    catalogIds: found
      ? found
          .filter((s) => s.id !== MAIL_SOURCE && s.id !== WEB_SOURCE)
          .map((s) => s.id)
      : current.catalogIds,
    cron: change.cron?.trim() || current.cron,
    instructions: change.instructions?.trim() || current.instructions,
    reportWhen: change.reportWhen ?? current.reportWhen,
  };
};

const same = (a: TaskSnapshot, b: TaskSnapshot) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Drops a change not applied: its version and its test runs with their chats. */
const dropPending = async (tx: Tx, task: TaskRow) => {
  const tests = await tx
    .select({ chatId: taskRuns.chatId })
    .from(taskRuns)
    .where(
      and(
        eq(taskRuns.taskId, task.id),
        gt(taskRuns.taskVersion, task.version),
        isNotNull(taskRuns.chatId)
      )
    );
  await tx
    .delete(taskRuns)
    .where(
      and(eq(taskRuns.taskId, task.id), gt(taskRuns.taskVersion, task.version))
    );
  const ids = tests.flatMap((r) => (r.chatId ? [r.chatId] : []));
  if (ids.length > 0) {
    await tx.delete(chats).where(inArray(chats.id, ids));
  }
  await tx
    .delete(taskVersions)
    .where(
      and(
        eq(taskVersions.taskId, task.id),
        gt(taskVersions.version, task.version)
      )
    );
};

/** Moves the task onto a version: its fields from the snapshot; a new schedule counts the next run at once. */
const moveTo = async (
  tx: Tx,
  task: TaskRow,
  snapshot: TaskSnapshot,
  version: number,
  now: Date
) => {
  const scheduleChanged =
    snapshot.cron !== task.cron || snapshot.timezone !== task.timezone;
  await tx
    .update(tasks)
    .set({
      catalogIds: snapshot.catalogIds,
      cron: snapshot.cron,
      instructions: snapshot.instructions,
      modelId: snapshot.modelId,
      nextRunAt: scheduleChanged
        ? nextRun(snapshot.cron, snapshot.timezone, now)
        : task.nextRunAt,
      reportWhen: snapshot.reportWhen,
      timezone: snapshot.timezone,
      updatedAt: now,
      version,
    })
    .where(eq(tasks.id, task.id));
};

export type ProposeResult =
  | { ok: true }
  | {
      ok: false;
      error: "not-found" | "no-model" | "no-change" | "failed";
      /** The model's words when it made no change. */
      reply?: string;
    };

/**
 * Asks the task's model for a change and keeps it as the next version, not applied. A change asked again replaces the
 * one before it, with its test runs.
 */
export const proposeTaskChange = async (input: {
  ownerId: string;
  taskId: string;
  request: string;
  locale: "ru" | "en";
}): Promise<ProposeResult> => {
  const task = await getTask(input.ownerId, input.taskId);
  if (!task) {
    return { error: "not-found", ok: false };
  }
  const [model, servers] = await Promise.all([
    getChatModel(task.modelId),
    listChatServers(input.ownerId),
  ]);
  if (!model) {
    return { error: "no-model", ok: false };
  }
  let proposed: TaskChange | null = null;
  const started = Date.now();
  try {
    const result = await generateText({
      abortSignal: AbortSignal.timeout(CHANGE_TIMEOUT_MS),
      instructions: instructionsFor(task, servers, input.locale),
      maxRetries: 1,
      model: await getLanguageModel(model.sourceId, model.modelId),
      prompt: input.request,
      stopWhen: [stepCountIs(3), () => proposed !== null],
      tools: {
        [TASK_CHANGE_TOOL]: tool({
          description:
            "Proposes a change of the task: only the fields that change. Shown to the person, who applies it.",
          execute: (change: TaskChange) => {
            const error = checkChange(change, task.timezone);
            if (error) {
              return { error, ok: false };
            }
            proposed = change;
            return { ok: true };
          },
          inputSchema: taskChangeSchema,
        }),
      },
    });
    await recordRun({
      chatId: task.chatId,
      latencyMs: Date.now() - started,
      model,
      providerMetadata: result.providerMetadata,
      purpose: "task",
      status: "ok",
      usage: result.totalUsage,
      userId: input.ownerId,
    });
    const change = proposed as TaskChange | null;
    if (!change) {
      return { error: "no-change", ok: false, reply: result.text.trim() };
    }
    const current = snapshotOf(task);
    const next = nextSnapshot(current, change, servers, input.locale);
    if (same(current, next)) {
      return { error: "no-change", ok: false };
    }
    await getDb().db.transaction(async (tx) => {
      await dropPending(tx, task);
      await tx.insert(taskVersions).values({
        changeSummary: change.summary.trim(),
        changedBy: input.ownerId,
        request: input.request,
        snapshot: next,
        taskId: task.id,
        version: task.version + 1,
      });
    });
    return { ok: true };
  } catch (error) {
    console.error("tasks: could not propose a change", task.id, error);
    return { error: "failed", ok: false };
  }
};

/** A task's versions, the first first: the applied ones and a pending one after them. */
export const getTaskVersions = async (taskId: string) => {
  const { db } = getDb();
  return await db
    .select({
      changeSummary: taskVersions.changeSummary,
      createdAt: taskVersions.createdAt,
      request: taskVersions.request,
      snapshot: taskVersions.snapshot,
      version: taskVersions.version,
    })
    .from(taskVersions)
    .where(eq(taskVersions.taskId, taskId))
    .orderBy(asc(taskVersions.version));
};
export type TaskVersionRow = Awaited<
  ReturnType<typeof getTaskVersions>
>[number];

const pendingOf = async (tx: Tx, task: TaskRow) => {
  const [row] = await tx
    .select()
    .from(taskVersions)
    .where(
      and(
        eq(taskVersions.taskId, task.id),
        eq(taskVersions.version, task.version + 1)
      )
    )
    .limit(1);
  return row ?? null;
};

/** «Применить»: the task moves onto the pending version. False — nothing to apply. */
export const applyTaskChange = async (
  ownerId: string,
  taskId: string,
  now = new Date()
) => {
  const task = await getTask(ownerId, taskId);
  if (!task) {
    return false;
  }
  return await getDb().db.transaction(async (tx) => {
    const pending = await pendingOf(tx, task);
    if (!pending) {
      return false;
    }
    await moveTo(tx, task, pending.snapshot, pending.version, now);
    return true;
  });
};

/** «Отменить»: the pending version goes, with its test runs. */
export const cancelTaskChange = async (ownerId: string, taskId: string) => {
  const task = await getTask(ownerId, taskId);
  if (!task) {
    return false;
  }
  await getDb().db.transaction((tx) => dropPending(tx, task));
  return true;
};

/**
 * «Вернуть как было»: the version before the current one, written as a new version and applied — the line of
 * versions stays whole. A pending change goes first.
 */
export const revertTaskChange = async (
  ownerId: string,
  taskId: string,
  summary: string,
  now = new Date()
) => {
  const task = await getTask(ownerId, taskId);
  if (!task || task.version < 2) {
    return false;
  }
  return await getDb().db.transaction(async (tx) => {
    const [before] = await tx
      .select({ snapshot: taskVersions.snapshot })
      .from(taskVersions)
      .where(
        and(
          eq(taskVersions.taskId, task.id),
          eq(taskVersions.version, task.version - 1)
        )
      )
      .limit(1);
    if (!before) {
      return false;
    }
    await dropPending(tx, task);
    const version = task.version + 1;
    await tx.insert(taskVersions).values({
      changeSummary: summary,
      changedBy: ownerId,
      request: null,
      snapshot: before.snapshot,
      taskId: task.id,
      version,
    });
    await moveTo(tx, task, before.snapshot, version, now);
    return true;
  });
};
