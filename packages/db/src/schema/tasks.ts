import type {
  TaskOutcome,
  TaskReportWhen,
  TaskRunStatus,
  TaskSnapshot,
  TaskTrigger,
} from "@metobe/contracts/tasks";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { chats } from "./chat";

// ARCH §5.5, §16 — periodic tasks (D38). The schedule lives here, not in Redis: `next_run_at` is the truth, the
// minute tick claims what is due and BullMQ only executes. A version is written on every change; a run knows the
// version it ran with. A run's work is an ordinary chat (`chats.kind = 'task_run'`).

export const tasks = pgTable(
  "tasks",
  {
    /** Catalog items whose tools the task may use; null — every one the owner can use (D22). */
    catalogIds: jsonb("catalog_ids").$type<string[] | null>(),
    /** The task's chat: where it was set up and is changed in words (P11, P15). */
    chatId: uuid("chat_id").references(() => chats.id, {
      onDelete: "set null",
    }),
    color: text("color").notNull(),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cron: text("cron").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    id: uuid("id").primaryKey().defaultRandom(),
    instructions: text("instructions").notNull(),
    maxSteps: integer("max_steps").notNull().default(20),
    modelId: uuid("model_id").notNull(),
    name: text("name").notNull(),
    /** When the next run is due; null — not scheduled (a disabled task keeps it, to resume from). */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    /** Letters about the task (P14): only what waits for the person; «nothing new» never goes out. */
    notifyEmail: boolean("notify_email").notNull().default(false),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Why the task stopped by itself: five failures in a row. Null — it did not. */
    pausedReason: text("paused_reason"),
    reportWhen: text("report_when")
      .$type<TaskReportWhen>()
      .notNull()
      .default("changes"),
    timeoutS: integer("timeout_s").notNull().default(600),
    timezone: text("timezone").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("tasks_owner").on(table.ownerId, table.createdAt),
    index("tasks_due")
      .on(table.nextRunAt)
      .where(sql`${table.enabled}`),
    check(
      "tasks_report_when",
      sql`${table.reportWhen} in ('changes', 'always')`
    ),
  ]
);

export const taskVersions = pgTable(
  "task_versions",
  {
    /** «добавлен shop-three.ru, итог — при изменении цены больше 5 %». */
    changeSummary: text("change_summary"),
    changedBy: text("changed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    /** The person's words the version grew from. */
    request: text("request"),
    snapshot: jsonb("snapshot").$type<TaskSnapshot>().notNull(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("task_versions_task_version").on(table.taskId, table.version),
  ]
);

export const taskRuns = pgTable(
  "task_runs",
  {
    /** The run's journal: an ordinary chat of kind `task_run`. */
    chatId: uuid("chat_id").references(() => chats.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    error: text("error"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    id: uuid("id").primaryKey().defaultRandom(),
    outcome: text("outcome").$type<TaskOutcome>(),
    /** A question or an action closed by the person. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** When the run was due: the schedule's time, or when «Прогнать сейчас» was pressed. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    /** The person saw the result: the task's dot goes out. */
    seenAt: timestamp("seen_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: text("status").$type<TaskRunStatus>().notNull().default("queued"),
    summary: text("summary"),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    taskVersion: integer("task_version").notNull(),
    trigger: text("trigger").$type<TaskTrigger>().notNull(),
  },
  (table) => [
    index("task_runs_task_time").on(table.taskId, table.createdAt.desc()),
    // One run per task and due time: a tick that comes twice does not run a task twice.
    uniqueIndex("task_runs_task_due").on(
      table.taskId,
      table.scheduledFor,
      table.trigger
    ),
    check(
      "task_runs_status",
      sql`${table.status} in ('queued', 'running', 'waiting_approval', 'done', 'failed', 'cancelled')`
    ),
    check(
      "task_runs_outcome",
      sql`${table.outcome} is null or ${table.outcome} in ('news', 'quiet', 'question', 'action')`
    ),
    check(
      "task_runs_trigger",
      sql`${table.trigger} in ('schedule', 'manual', 'test')`
    ),
  ]
);
