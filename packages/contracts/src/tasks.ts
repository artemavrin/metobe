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

/**
 * A task drafted in a chat (P11): the model fills what it understood, the card shows it, the person creates it. What
 * is not known yet stays empty — the model asks for it in words, one thing at a time.
 */
export const taskDraftSchema = z.object({
  cron: z
    .string()
    .nullable()
    .describe(
      "When it runs: a cron of five fields (minute hour day month weekday) in the person's time zone — «0 9 * * 1-5» is weekdays at 9:00. Null while the person has not said when."
    ),
  email: z
    .boolean()
    .describe(
      "Also by email: true only when the person asked for results by email."
    ),
  instructions: z
    .string()
    .min(1)
    .max(4000)
    .describe(
      "What every run does, self-contained, in the person's language: what to check, where, what counts as a change, what the result says. A run reads only this — not this chat. Plain words, no tool names."
    ),
  name: z
    .string()
    .min(1)
    .max(60)
    .describe(
      "A short name of what the task is about: «Цены конкурентов», «Письма без ответа». No verb, no quotes."
    ),
  reportWhen: z
    .enum(taskReportWhen)
    .describe(
      "changes — say a result only when something changed (the default); always — after every run."
    ),
  sources: z
    .array(z.string())
    .nullable()
    .describe(
      "Where it takes data from: services by their names as the tools are prefixed (or titles), «mail» for the person's mail, «web» for websites; null — everything the person has."
    ),
});
export type TaskDraft = z.infer<typeof taskDraftSchema>;

/** What the server makes of a draft: the schedule in words and the first runs, counted here, never by the model. */
export type TaskDraftOutput =
  | {
      ok: true;
      /** The schedule in words; null while there is no cron. */
      schedule: string | null;
      /** The next runs, ISO. */
      next: string[];
      timeZone: string;
      /** The sources found; null — every service. */
      sources: { id: string; title: string }[] | null;
    }
  | { ok: false; error: string };

/** The colours a task may take: the chart palette, so they read in both themes. */
export const TASK_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map(
  (n) => `var(--chart-${n})`
);

/** A colour of its own for a new task, from its name: the same name, the same colour. */
export const colorForTask = (name: string) =>
  TASK_COLORS[
    [...name].reduce(
      (h, c) => (h * 31 + (c.codePointAt(0) ?? 0)) % 1_000_003,
      7
    ) % TASK_COLORS.length
  ] ?? "var(--chart-1)";

/** The mail among a draft's sources: not a catalog server — the owner's own boxes, on in every run that has them. */
export const MAIL_SOURCE = "mail";
/** The web among a draft's sources: not a catalog server — search and pages, as the admin left them. */
export const WEB_SOURCE = "web";
