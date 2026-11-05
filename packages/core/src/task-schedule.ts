import { CronExpressionParser } from "cron-parser";

// When a periodic task runs (ARCH §16.2, D23). The schedule is a cron in the task's time zone; the dates are counted
// here, never by the model. Pure: no database, so the catch-up rule is tested on its own.

/** The first run of `cron` in `timezone` strictly after `after`. Throws on an invalid cron or zone. */
export const nextRun = (cron: string, timezone: string, after: Date): Date =>
  CronExpressionParser.parse(cron, { currentDate: after, tz: timezone })
    .next()
    .toDate();

/** The next `count` runs after `after` — what the task card shows («первый — пн, 9 ноя, 10:00»). */
export const nextRuns = (
  cron: string,
  timezone: string,
  after: Date,
  count: number
): Date[] => {
  const it = CronExpressionParser.parse(cron, {
    currentDate: after,
    tz: timezone,
  });
  return Array.from({ length: count }, () => it.next().toDate());
};

/** Whether the cron and the zone can be scheduled at all. */
export const isValidSchedule = (cron: string, timezone: string) => {
  try {
    nextRun(cron, timezone, new Date());
    return true;
  } catch {
    return false;
  }
};

/**
 * What the minute tick does with a task that is due: run it once for the time it was due, and count the next run
 * from now — after a night down, one catching-up run, not twelve (ARCH §16.2).
 */
export const planDue = (
  task: { cron: string; timezone: string; nextRunAt: Date },
  now: Date
) => ({
  next: nextRun(task.cron, task.timezone, now),
  scheduledFor: task.nextRunAt,
});

/** The queue job's id: one per task and due time, so a tick that comes twice does not run it twice. No «:» — BullMQ refuses it in a custom id. */
export const runJobId = (taskId: string, scheduledFor: Date, trigger: string) =>
  `${taskId}-${trigger}-${scheduledFor.getTime()}`;
