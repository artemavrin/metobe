import { localMidnight } from "@metobe/core/memory-extract";

// The «Память» page's days (P16, D39): a deadline is midnight of its day in the person's zone, so «завтра» and
// «просрочено на 2 дн.» are counted between calendar days there, not between instants.

/** A moment's calendar day in a zone: `2026-11-09`. */
export const dayKey = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(at);

const DAY_MS = 24 * 60 * 60 * 1000;
const utcOf = (key: string) => Date.parse(`${key}T00:00:00Z`);
const keyOf = (utc: number) => new Date(utc).toISOString().slice(0, 10);

/** Days from today to a day: 0 today, 1 tomorrow, −2 two days ago. */
export const daysUntil = (at: Date, now: Date, timeZone: string) =>
  Math.round(
    (utcOf(dayKey(at, timeZone)) - utcOf(dayKey(now, timeZone))) / DAY_MS
  );

const midnight = (key: string, timeZone: string) =>
  localMidnight(key, timeZone) as Date;

/** A day's midnight in a zone — a deadline's moment. */
export const localMidnightOf = midnight;

/**
 * «Перенести срок»: tomorrow, the day after, next Monday (a week on, when today is Monday) and a week on — each the
 * day's midnight in the zone.
 */
export const moveTargets = (now: Date, timeZone: string) => {
  const today = utcOf(dayKey(now, timeZone));
  const weekday = new Date(today).getUTCDay();
  const toMonday = (8 - weekday) % 7 || 7;
  const after = (days: number) =>
    midnight(keyOf(today + days * DAY_MS), timeZone);
  return {
    dayAfter: after(2),
    monday: after(toMonday),
    tomorrow: after(1),
    week: after(7),
  };
};
