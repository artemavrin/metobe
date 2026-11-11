import type { MemoryRepeat } from "@metobe/contracts/memory";

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
