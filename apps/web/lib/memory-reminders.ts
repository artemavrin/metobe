import type { MemoryDue } from "@metobe/contracts/memory";

import { daysUntil } from "./memory-dates";

// «Напоминания» on the «Память» page (P29 «Раздел»): every open commitment that has a time to remind at, in groups by
// what is with it now — came and not marked (on top: these want «Готово»), today, tomorrow, this week, later — and the
// ones that come again apart, each once with its next time.

export type ReminderRow = MemoryDue["rows"][number] & { remindAt: string };

export type ReminderGroup =
  | "sent"
  | "today"
  | "tomorrow"
  | "week"
  | "later"
  | "repeat";

export const REMINDER_GROUPS: ReminderGroup[] = [
  "sent",
  "today",
  "tomorrow",
  "week",
  "later",
  "repeat",
];

/** One that comes again whose time came and was not marked («Готово» marks it; it goes on to its next time anyway). */
export const cameAgain = (row: ReminderRow) =>
  row.repeat !== null && row.reminded;

const groupOf = (
  row: ReminderRow,
  now: Date,
  timeZone: string
): ReminderGroup => {
  if (row.repeat) {
    return "repeat";
  }
  if (row.reminded) {
    return "sent";
  }
  const days = daysUntil(new Date(row.remindAt), now, timeZone);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "tomorrow";
  }
  return days <= 7 ? "week" : "later";
};

/** The groups that have something, in order; inside each, by the time it goes off. */
export const reminderGroups = (due: MemoryDue, now: Date, timeZone: string) => {
  const rows = due.rows
    .filter((r): r is ReminderRow => r.remindAt !== null)
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts the array `filter` made; toSorted is past the ES2022 target
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt));
  return REMINDER_GROUPS.flatMap((group) => {
    const of = rows.filter((r) => groupOf(r, now, timeZone) === group);
    return of.length > 0 ? [{ group, rows: of }] : [];
  });
};

/** How many reminders the list's row counts: the ones still to come and the ones that came and wait. */
export const reminderCount = (due: MemoryDue | null) =>
  due ? due.rows.filter((r) => r.remindAt !== null).length : 0;
