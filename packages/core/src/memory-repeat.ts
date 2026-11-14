import type { MemoryRepeat, ReminderRepeat } from "@metobe/contracts/memory";

import { localInstant } from "./memory-extract";

// When a `date` rule's day comes next (ARCH §19.8.7). Days are `2026-11-14` in the person's zone; the functions read
// no clock and no base: the caller says what today is.

const DAY_MS = 86_400_000;
const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const daysIn = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The first day on or after `today` the rule's day falls on: a year's — the same month and day (29 February is the 28th
 * in the years that have none); a month's — the same day of the month (the 31st is the last day of a short month); a
 * week's — the same weekday.
 */
export const nextRepeat = (
  anchor: string,
  repeat: MemoryRepeat,
  today: string
): string => {
  const [, month = 1, day = 1] = anchor.split("-").map(Number);
  const [year = 1970, todayMonth = 1] = today.split("-").map(Number);
  if (repeat === "week") {
    const want = new Date(utc(anchor)).getUTCDay();
    const have = new Date(utc(today)).getUTCDay();
    return keyOf(utc(today) + ((want - have + 7) % 7) * DAY_MS);
  }
  if (repeat === "month") {
    for (let step = 0; step < 2; step += 1) {
      const at = new Date(Date.UTC(year, todayMonth - 1 + step, 1));
      const y = at.getUTCFullYear();
      const m = at.getUTCMonth() + 1;
      const candidate = `${y}-${pad(m)}-${pad(Math.min(day, daysIn(y, m)))}`;
      if (candidate >= today) {
        return candidate;
      }
    }
  }
  for (let y = year; y <= year + 1; y += 1) {
    const candidate = `${y}-${pad(month)}-${pad(Math.min(day, daysIn(y, month)))}`;
    if (candidate >= today) {
      return candidate;
    }
  }
  return today;
};

/** How far ahead «Не упустить» shows a day: a birthday three days before, the rest today and tomorrow. */
export const REACH: Record<MemoryRepeat, number> = {
  month: 1,
  week: 1,
  year: 3,
};

const isWeekend = (day: string) =>
  [0, 6].includes(new Date(utc(day)).getUTCDay());

/**
 * The day a reminder that comes again comes next, after `after`: a day's — the next day; working days' — the next
 * Monday to Friday; a week's, a month's, a year's — the next day the anchor's weekday, day of the month or day of the
 * year falls on (as `nextRepeat` reads them). The anchor is the day it came last: a month's 31st that came on the 30th
 * comes on the 30th from then on.
 */
export const nextReminderDay = (
  anchor: string,
  repeat: ReminderRepeat,
  after: string
): string => {
  let day = keyOf(utc(after) + DAY_MS);
  if (repeat === "day") {
    return day;
  }
  if (repeat === "weekdays") {
    while (isWeekend(day)) {
      day = keyOf(utc(day) + DAY_MS);
    }
    return day;
  }
  return nextRepeat(anchor, repeat, day);
};

/** A day in a zone, `2026-11-14`, and its time of day, `10:00`. */
export const wallClock = (at: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};

/** Enough steps for a daily reminder a few years behind; a guard, not a limit anyone meets. */
const MAX_STEPS = 2000;

/**
 * The next time of a reminder that comes again: the first after the day `after` whose moment — the same time of day as
 * `remindAt` — is later than `now`. `dueAt` is that day's midnight in the zone, as a deadline is kept.
 */
export const nextReminder = ({
  after,
  now,
  remindAt,
  repeat,
  timeZone,
}: {
  remindAt: Date;
  repeat: ReminderRepeat;
  after: string;
  now: Date;
  timeZone: string;
}) => {
  const { day: anchor, time } = wallClock(remindAt, timeZone);
  let day = nextReminderDay(anchor, repeat, after);
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const at = localInstant(day, time, timeZone);
    if (at && at.getTime() > now.getTime()) {
      return {
        dueAt: localInstant(day, "00:00", timeZone) ?? at,
        remindAt: at,
      };
    }
    day = nextReminderDay(anchor, repeat, day);
  }
  return null;
};
