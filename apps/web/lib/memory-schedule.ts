import type {
  MemoryDue,
  MemoryScheduleDate,
  MemoryScheduleRhythm,
} from "@metobe/contracts/memory";

import { dayKey } from "./memory-dates";

// «Расписание» on the «Память» page (D45, P30 «Расписание»): everything that comes by itself, in one list by when —
// reminders (the person's own, and those about a promise, in `due.rows`), days that come again and rhythms. On top
// what wants the person: reminders sent and not marked, rhythms overdue; then today, tomorrow, this week, later.

export type ReminderRow = MemoryDue["rows"][number] & { remindAt: string };

export type ScheduleItem =
  | { kind: "reminder"; day: string; row: ReminderRow }
  | { kind: "date"; day: string; date: MemoryScheduleDate }
  | { kind: "rhythm"; day: string; rhythm: MemoryScheduleRhythm };

export type ScheduleGroup =
  | "sent"
  | "overdue"
  | "today"
  | "tomorrow"
  | "week"
  | "later";

export const SCHEDULE_GROUPS: ScheduleGroup[] = [
  "sent",
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
];

const DAY_MS = 86_400_000;
const daysFrom = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  );

/** Every item of «Расписание»: reminders, days that come again, rhythms not taken away until the next contact. */
export const scheduleItems = (
  due: MemoryDue,
  timeZone: string
): ScheduleItem[] => [
  ...due.rows
    .filter((r): r is ReminderRow => r.remindAt !== null)
    .map((row) => ({
      day: dayKey(new Date(row.remindAt), timeZone),
      kind: "reminder" as const,
      row,
    })),
  ...due.dates.map((date) => ({ date, day: date.day, kind: "date" as const })),
  ...due.rhythms
    .filter((r) => !r.away)
    .map((rhythm) => ({ day: rhythm.day, kind: "rhythm" as const, rhythm })),
];

const groupOf = (item: ScheduleItem, today: string): ScheduleGroup => {
  if (item.kind === "reminder" && item.row.reminded) {
    return "sent";
  }
  const days = daysFrom(today, item.day);
  if (item.kind === "rhythm" && days < 0) {
    return "overdue";
  }
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "tomorrow";
  }
  return days <= 7 ? "week" : "later";
};

/** A reminder's moment orders it inside its day; a date and a rhythm come before the day's reminders. */
const sortKey = (item: ScheduleItem) =>
  `${item.day} ${item.kind === "reminder" ? item.row.remindAt : ""}`;

/** The groups that have something, in order; inside each, by when. */
export const scheduleGroups = (due: MemoryDue, timeZone: string) => {
  const items = scheduleItems(due, timeZone)
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts the array `scheduleItems` made; toSorted is past the ES2022 target
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return SCHEDULE_GROUPS.flatMap((group) => {
    const of = items.filter((i) => groupOf(i, due.today) === group);
    return of.length > 0 ? [{ group, items: of }] : [];
  });
};

/** Days past due for an overdue rhythm, `4`; 0 when it is not. */
export const overdueDays = (rhythm: MemoryScheduleRhythm, today: string) =>
  Math.max(0, daysFrom(rhythm.day, today));

/** How many the list's row counts: everything in «Расписание». */
export const scheduleCount = (due: MemoryDue | null, timeZone: string) =>
  due ? scheduleItems(due, timeZone).length : 0;
