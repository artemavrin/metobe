import "server-only";
import type { ChatMessage } from "@metobe/contracts/chat";
import type {
  TaskOutcome,
  TaskReportWhen,
  TaskRunStatus,
  TaskSnapshot,
  TaskTrigger,
} from "@metobe/contracts/tasks";
import {
  MAIL_SOURCE,
  TASK_COLORS,
  WEB_SOURCE,
  colorForTask,
} from "@metobe/contracts/tasks";
import { taskRuns, taskVersions, tasks } from "@metobe/db/schema/tasks";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { getChat, listMessages } from "./chat";
import { getDb } from "./db";
import { isValidSchedule, nextRun, planDue } from "./task-schedule";

// Periodic tasks in the database (ARCH §16, D23): a task and its versions, the minute tick that claims what is due,
// and a run's life from queued to done. Postgres holds the schedule; BullMQ only executes what the tick hands it.

/** Five failed runs in a row stop a task by itself; the person sees why. */
export const MAX_FAILURES = 5;

export interface NewTask {
  ownerId: string;
  name: string;
  color: string;
  instructions: string;
  modelId: string;
  cron: string;
  timezone: string;
  reportWhen?: TaskReportWhen;
  notifyEmail?: boolean;
  catalogIds?: string[] | null;
  chatId?: string | null;
  /** The person's words the task grew from. */
  request?: string;
}

const snapshotOf = (t: {
  catalogIds: string[] | null;
  cron: string;
  instructions: string;
  modelId: string;
  reportWhen: TaskReportWhen;
  timezone: string;
}): TaskSnapshot => ({
  catalogIds: t.catalogIds,
  cron: t.cron,
  instructions: t.instructions,
  modelId: t.modelId,
  reportWhen: t.reportWhen,
  timezone: t.timezone,
});

/** A new task with its first version; its first run counted from now. */
export const createTask = async (input: NewTask, now = new Date()) => {
  const { db } = getDb();
  const reportWhen = input.reportWhen ?? "changes";
  const catalogIds = input.catalogIds ?? null;
  return await db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        catalogIds,
        chatId: input.chatId ?? null,
        color: input.color,
        cron: input.cron,
        instructions: input.instructions,
        modelId: input.modelId,
        name: input.name,
        nextRunAt: nextRun(input.cron, input.timezone, now),
        notifyEmail: input.notifyEmail ?? false,
        ownerId: input.ownerId,
        reportWhen,
        timezone: input.timezone,
      })
      .returning({ id: tasks.id, nextRunAt: tasks.nextRunAt });
    if (!task) {
      throw new Error("tasks: insert returned nothing");
    }
    await tx.insert(taskVersions).values({
      changeSummary: null,
      changedBy: input.ownerId,
      request: input.request ?? null,
      snapshot: snapshotOf({ ...input, catalogIds, reportWhen }),
      taskId: task.id,
      version: 1,
    });
    return task;
  });
};

/**
 * The minute tick: takes the tasks that are due — `SKIP LOCKED`, so two ticks never take one task — moves each one's
 * next run on from now, and answers what to run. A task whose schedule no longer parses stops with the reason.
 */
export const claimDueTasks = async (now = new Date()) => {
  const { db } = getDb();
  return await db.transaction(async (tx) => {
    const due = await tx
      .select({
        cron: tasks.cron,
        id: tasks.id,
        nextRunAt: tasks.nextRunAt,
        timezone: tasks.timezone,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.enabled, true),
          isNull(tasks.pausedReason),
          lte(tasks.nextRunAt, now)
        )
      )
      .for("update", { skipLocked: true });
    // Plan every due task first, then write them all: one transaction, one round of updates.
    const plans = due.flatMap(
      (t): { id: string; next: Date | null; scheduledFor: Date | null }[] => {
        if (!t.nextRunAt) {
          return [];
        }
        try {
          return [
            {
              id: t.id,
              ...planDue(
                { cron: t.cron, nextRunAt: t.nextRunAt, timezone: t.timezone },
                now
              ),
            },
          ];
        } catch {
          return [{ id: t.id, next: null, scheduledFor: null }];
        }
      }
    );
    await Promise.all(
      plans.map((p) =>
        p.next
          ? tx
              .update(tasks)
              .set({ nextRunAt: p.next })
              .where(eq(tasks.id, p.id))
          : tx
              .update(tasks)
              .set({
                nextRunAt: null,
                pausedReason: "Расписание не распознаётся",
              })
              .where(eq(tasks.id, p.id))
      )
    );
    return plans.flatMap((p) =>
      p.next && p.scheduledFor
        ? [{ scheduledFor: p.scheduledFor, taskId: p.id }]
        : []
    );
  });
};

/** A run row for a task at its due time; the same task, time and trigger twice — the existing one. */
export const createRun = async (
  taskId: string,
  scheduledFor: Date,
  trigger: TaskTrigger
) => {
  const { db } = getDb();
  const [task] = await db
    .select({ version: tasks.version })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) {
    return null;
  }
  const [run] = await db
    .insert(taskRuns)
    .values({ scheduledFor, taskId, taskVersion: task.version, trigger })
    .onConflictDoNothing()
    .returning({ id: taskRuns.id });
  if (run) {
    return run.id;
  }
  const [existing] = await db
    .select({ id: taskRuns.id })
    .from(taskRuns)
    .where(
      and(
        eq(taskRuns.taskId, taskId),
        eq(taskRuns.scheduledFor, scheduledFor),
        eq(taskRuns.trigger, trigger)
      )
    )
    .limit(1);
  return existing?.id ?? null;
};

/** What a run needs: the run, its task, and the version it runs with (a change made meanwhile waits for the next). */
export const getRunContext = async (runId: string) => {
  const { db } = getDb();
  const [row] = await db
    .select({ run: taskRuns, snapshot: taskVersions.snapshot, task: tasks })
    .from(taskRuns)
    .innerJoin(tasks, eq(tasks.id, taskRuns.taskId))
    .innerJoin(
      taskVersions,
      and(
        eq(taskVersions.taskId, taskRuns.taskId),
        eq(taskVersions.version, taskRuns.taskVersion)
      )
    )
    .where(eq(taskRuns.id, runId))
    .limit(1);
  return row ?? null;
};

/** The result of the task's last finished run that had something to say — what the new run compares with. */
export const lastResultChat = async (taskId: string, before: string) => {
  const { db } = getDb();
  const [row] = await db
    .select({ chatId: taskRuns.chatId, summary: taskRuns.summary })
    .from(taskRuns)
    .where(
      and(
        eq(taskRuns.taskId, taskId),
        eq(taskRuns.status, "done"),
        sql`${taskRuns.outcome} in ('news', 'question')`,
        sql`${taskRuns.id} <> ${before}`
      )
    )
    .orderBy(desc(taskRuns.finishedAt))
    .limit(1);
  return row ?? null;
};

export const markRunning = async (runId: string, chatId: string) => {
  const { db } = getDb();
  await db
    .update(taskRuns)
    .set({ chatId, startedAt: new Date(), status: "running" })
    .where(eq(taskRuns.id, runId));
};

/**
 * A run ends: done with what `report` said, or failed with why. A failure counts towards the five that stop the
 * task; a test run's does not, and anything done resets the count.
 */
export const finishRun = async (
  runId: string,
  end: {
    status: Extract<TaskRunStatus, "done" | "failed" | "cancelled">;
    outcome?: TaskOutcome | null;
    summary?: string | null;
    error?: string | null;
  }
) => {
  const { db } = getDb();
  await db.transaction(async (tx) => {
    const [run] = await tx
      .update(taskRuns)
      .set({
        error: end.error ?? null,
        finishedAt: new Date(),
        outcome: end.outcome ?? null,
        status: end.status,
        summary: end.summary ?? null,
      })
      .where(eq(taskRuns.id, runId))
      .returning({ taskId: taskRuns.taskId, trigger: taskRuns.trigger });
    if (!run || run.trigger === "test") {
      return;
    }
    if (end.status === "done") {
      await tx
        .update(tasks)
        .set({ consecutiveFailures: 0 })
        .where(eq(tasks.id, run.taskId));
      return;
    }
    if (end.status === "failed") {
      const [t] = await tx
        .update(tasks)
        .set({ consecutiveFailures: sql`${tasks.consecutiveFailures} + 1` })
        .where(eq(tasks.id, run.taskId))
        .returning({ failures: tasks.consecutiveFailures });
      if (t && t.failures >= MAX_FAILURES) {
        const reason = `${MAX_FAILURES} сбоев подряд: ${end.error ?? "причина в журнале запуска"}`;
        await tx
          .update(tasks)
          .set({ pausedReason: reason })
          .where(eq(tasks.id, run.taskId));
        // The person must know the task stopped: the last run waits for them (ARCH §16.2).
        await tx
          .update(taskRuns)
          .set({ outcome: "action", summary: `Задача остановлена: ${reason}` })
          .where(eq(taskRuns.id, runId));
      }
    }
  });
};

// ── What the pages read and do (ARCH §16.4) ───────────────────────────────────────────────────────────────────────

export type TaskRow = typeof tasks.$inferSelect;
export type TaskRunRow = typeof taskRuns.$inferSelect;

/** Whether a finished run waits for the person: a result not seen yet, a question or an action not closed. */
export const waitsFor = (
  run:
    | Pick<TaskRunRow, "outcome" | "seenAt" | "resolvedAt" | "status">
    | null
    | undefined
) => {
  if (
    !run ||
    run.status !== "done" ||
    !run.outcome ||
    run.outcome === "quiet"
  ) {
    return false;
  }
  return run.outcome === "news" ? run.seenAt === null : run.resolvedAt === null;
};

/** The latest finished run of each task given. */
const latestRuns = async (taskIds: string[]) => {
  if (taskIds.length === 0) {
    return new Map<string, TaskRunRow>();
  }
  const { db } = getDb();
  const rows = await db
    .selectDistinctOn([taskRuns.taskId])
    .from(taskRuns)
    .where(
      and(
        inArray(taskRuns.taskId, taskIds),
        inArray(taskRuns.status, ["done", "failed"])
      )
    )
    .orderBy(taskRuns.taskId, desc(taskRuns.finishedAt));
  return new Map(rows.map((r) => [r.taskId, r]));
};

/** The owner's tasks with each one's latest finished run, the newest task first. */
export const listTasks = async (ownerId: string) => {
  const { db } = getDb();
  const list = await db
    .select()
    .from(tasks)
    .where(eq(tasks.ownerId, ownerId))
    .orderBy(desc(tasks.createdAt));
  const last = await latestRuns(list.map((t) => t.id));
  return list.map((task) => ({ last: last.get(task.id) ?? null, task }));
};

/** One of the owner's tasks; null for anyone else's. */
export const getTask = async (ownerId: string, id: string) => {
  const { db } = getDb();
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
    .limit(1);
  return task ?? null;
};

/** A task's runs, the newest first; a run still going is among them. */
export const listTaskRuns = async (taskId: string, limit = 30) => {
  const { db } = getDb();
  return await db
    .select()
    .from(taskRuns)
    .where(eq(taskRuns.taskId, taskId))
    .orderBy(desc(taskRuns.scheduledFor))
    .limit(limit);
};

/** Turns a task on or off. On again: the next run is counted from now, and a stop after failures is lifted. */
export const setTaskEnabled = async (
  ownerId: string,
  id: string,
  enabled: boolean,
  now = new Date()
) => {
  const task = await getTask(ownerId, id);
  if (!task) {
    return false;
  }
  const { db } = getDb();
  await db
    .update(tasks)
    .set(
      enabled
        ? {
            consecutiveFailures: 0,
            enabled,
            nextRunAt: nextRun(task.cron, task.timezone, now),
            pausedReason: null,
            updatedAt: now,
          }
        : { enabled, updatedAt: now }
    )
    .where(eq(tasks.id, id));
  return true;
};

/** The person opened the task: its results are seen, the dot goes out. Questions and actions stay until closed. */
export const markTaskSeen = async (
  ownerId: string,
  id: string,
  now = new Date()
) => {
  if (!(await getTask(ownerId, id))) {
    return;
  }
  const { db } = getDb();
  await db
    .update(taskRuns)
    .set({ seenAt: now })
    .where(
      and(
        eq(taskRuns.taskId, id),
        isNull(taskRuns.seenAt),
        eq(taskRuns.status, "done")
      )
    );
};

/** A run's answer — the result as the chat stores it — for the owner of its task only; null for anyone else's. */
export const getRunAnswer = async (ownerId: string, runId: string) => {
  const { db } = getDb();
  const [row] = await db
    .select({ chatId: taskRuns.chatId })
    .from(taskRuns)
    .innerJoin(tasks, eq(tasks.id, taskRuns.taskId))
    .where(and(eq(taskRuns.id, runId), eq(tasks.ownerId, ownerId)))
    .limit(1);
  if (!row?.chatId) {
    return null;
  }
  const messages = await listMessages(row.chatId);
  // The run's last answer: the one after `report`'s write-up, when there was one.
  const answers = messages.filter((m) => m.role === "assistant");
  return answers.at(-1) ?? null;
};

/** Letters about the task on or off (P14); false — not the owner's task. */
export const setTaskNotify = async (
  ownerId: string,
  id: string,
  notifyEmail: boolean,
  now = new Date()
) => {
  const { db } = getDb();
  const changed = await db
    .update(tasks)
    .set({ notifyEmail, updatedAt: now })
    .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
    .returning({ id: tasks.id });
  return changed.length > 0;
};

/** The task set up in this chat, if there is one: the chat is its own (§16.1). */
export const getTaskByChat = async (ownerId: string, chatId: string) => {
  const { db } = getDb();
  const [task] = await db
    .select({ color: tasks.color, id: tasks.id, name: tasks.name })
    .from(tasks)
    .where(and(eq(tasks.chatId, chatId), eq(tasks.ownerId, ownerId)))
    .limit(1);
  return task ?? null;
};

/** The person's words the task grew from: the first question of the chat. */
const firstAsk = (messages: ChatMessage[]) =>
  messages
    .find((m) => m.role === "user")
    ?.parts.flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .slice(0, 2000) ?? null;

/**
 * «Создать задачу» on a draft's card (P11): the task is made from the draft the server stored in the chat — never from
 * what the page sends — with the person's name and colour, the model that drafted it, and the chat as its own.
 */
export const createTaskFromDraft = async (input: {
  ownerId: string;
  chatId: string;
  toolCallId: string;
  name: string;
  color: string;
  timeZone: string;
}) => {
  const chat = await getChat(input.chatId);
  if (!chat || chat.userId !== input.ownerId) {
    return { error: "not-found" as const };
  }
  if (await getTaskByChat(input.ownerId, input.chatId)) {
    return { error: "exists" as const };
  }
  const messages = await listMessages(input.chatId);
  const message = messages.find((m) =>
    m.parts.some(
      (p) => p.type === "tool-draft_task" && p.toolCallId === input.toolCallId
    )
  );
  const part = message?.parts.find(
    (p) => p.type === "tool-draft_task" && p.toolCallId === input.toolCallId
  );
  if (part?.type !== "tool-draft_task") {
    return { error: "not-found" as const };
  }
  const modelId = message?.metadata?.modelId;
  if (part.state !== "output-available" || !part.output.ok || !modelId) {
    return { error: "incomplete" as const };
  }
  const draft = part.input;
  const { cron } = draft;
  if (!cron) {
    return { error: "incomplete" as const };
  }
  const timezone = isValidSchedule(cron, input.timeZone)
    ? input.timeZone
    : part.output.timeZone;
  const task = await createTask({
    // The mail and the web are no catalog servers: a task with only them takes no server at all.
    catalogIds:
      part.output.sources
        ?.filter((s) => s.id !== MAIL_SOURCE && s.id !== WEB_SOURCE)
        .map((s) => s.id) ?? null,
    chatId: input.chatId,
    color: TASK_COLORS.includes(input.color)
      ? input.color
      : colorForTask(input.name),
    cron,
    instructions: draft.instructions,
    modelId,
    name: input.name.trim().slice(0, 60) || draft.name,
    notifyEmail: draft.email,
    ownerId: input.ownerId,
    reportWhen: draft.reportWhen,
    request: firstAsk(messages) ?? undefined,
    timezone,
  });
  return { id: task.id };
};
