import { z } from "zod";

// A periodic task (ARCH §16, D38): an instruction run on a schedule with the owner's connections. Not an agent —
// nothing runs between runs. A run is an ordinary chat (`kind = 'task_run'`), the journal of its work; it ends with
// the `report` tool, whose outcome decides whether the person is told.

/** What a run came to: a result, nothing new, a question for the person, an action the person must take. */
export const taskOutcomes = ["news", "quiet", "question", "action"] as const;
export type TaskOutcome = (typeof taskOutcomes)[number];

/** The outcomes that wait for the person: they light the task in the sidebar and may go by mail. */
export const WAITING_OUTCOMES: readonly TaskOutcome[] = [
  "news",
  "question",
  "action",
];

export const taskRunStatuses = [
  "queued",
  "running",
  "waiting_approval",
  "done",
  "failed",
  "cancelled",
] as const;
export type TaskRunStatus = (typeof taskRunStatuses)[number];

/** What started a run: the schedule, «Прогнать сейчас», a test run of a new version (no mail, no failure count). */
export const taskTriggers = ["schedule", "manual", "test"] as const;
export type TaskTrigger = (typeof taskTriggers)[number];

/** When a result is shown: only when something changed, or after every run. */
export const taskReportWhen = ["changes", "always"] as const;
export type TaskReportWhen = (typeof taskReportWhen)[number];

/** The `report` tool every run ends with. */
export const taskReportSchema = z.object({
  outcome: z
    .enum(taskOutcomes)
    .describe(
      "news — there is a result worth reading; quiet — nothing new since the last run (said only when the task reports changes); question — you need the person's answer to go on; action — the person must do something (sign in, connect a service, fix access)."
    ),
  summary: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "The result in one line, in the person's language, plainly: what happened, with the figures — «Цены изменились у 2 товаров из 16», «Нет доступа к почте: срок входа истёк». No greeting, no «я»."
    ),
});
export type TaskReport = z.infer<typeof taskReportSchema>;

/** What a version of a task holds: what it does and how. */
export const taskSnapshotSchema = z.object({
  catalogIds: z.array(z.string()).nullable(),
  cron: z.string(),
  instructions: z.string(),
  modelId: z.string(),
  reportWhen: z.enum(taskReportWhen),
  timezone: z.string(),
});
export type TaskSnapshot = z.infer<typeof taskSnapshotSchema>;
