// Calendar in an organization's time zone (ARCH §20.10). Pure: Intl only, no libraries.
// A «day» for billing is a calendar day in the zone; the length of a day in hours (DST: 23 or 25) never matters.

export interface LocalParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

const formatter = (timeZone: string) => {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    });
    formatters.set(timeZone, f);
  }
  return f;
};

/** Wall-clock time of an instant in the zone. Throws on an unknown zone. */
export const localParts = (at: Date, timeZone: string): LocalParts => {
  const v: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(at)) {
    if (p.type !== "literal") {
      v[p.type] = Number(p.value);
    }
  }
  return {
    day: v.day ?? 0,
    hour: v.hour ?? 0,
    minute: v.minute ?? 0,
    month: v.month ?? 0,
    year: v.year ?? 0,
  };
};

/** Comparable number for a wall-clock time: YYYYMMDDHHmm. */
const wallKey = (p: LocalParts) =>
  (((p.year * 100 + p.month) * 100 + p.day) * 100 + p.hour) * 100 + p.minute;

const DAY_MS = 86_400_000;

/**
 * The first instant at which the zone's wall clock shows `hour:minute` of the date or later.
 * - normal day: exactly that wall time;
 * - DST gap (00:00 does not exist, the clock jumps to 01:00): the first instant after the gap;
 * - DST overlap (wall time happens twice): the first of the two.
 * Binary search over instants plus a look-back for overlaps, so it needs no knowledge of zone rules. The window ±1.5 days around UTC midnight
 * covers every offset from −12 to +14.
 */
export const zonedInstant = (
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): Date => {
  const target = wallKey({ day, hour, minute, month, year });
  const base = Date.UTC(year, month - 1, day, hour, minute);
  let lo = base - 1.5 * DAY_MS;
  let hi = base + 1.5 * DAY_MS;
  // invariant: wall(lo) < target <= wall(hi)
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (wallKey(localParts(new Date(mid), timeZone)) >= target) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  // Zone offsets are whole minutes, so the wall clock changes on a minute boundary; `hi` is at most a second past it.
  let first = hi - (hi % 60_000);
  // In an overlap the wall clock is not monotonic and the search may land on the second pass: look back by the
  // usual DST shifts (30, 60, 120 minutes) for an earlier moment that starts the same wall time.
  for (const back of [30, 60, 120]) {
    const c = first - back * 60_000;
    if (
      wallKey(localParts(new Date(c), timeZone)) >= target &&
      wallKey(localParts(new Date(c - 60_000), timeZone)) < target
    ) {
      first = c;
    }
  }
  return new Date(first);
};

/** 'YYYY-MM' of a month. */
export const periodKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

export const periodOf = (at: Date, timeZone: string) => {
  const p = localParts(at, timeZone);
  return periodKey(p.year, p.month);
};

export const parsePeriod = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return { month: m ?? 0, year: y ?? 0 };
};

export const nextPeriod = (period: string) => {
  const { year, month } = parsePeriod(period);
  return month === 12 ? periodKey(year + 1, 1) : periodKey(year, month + 1);
};

export const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** First instant of the month in the zone. */
export const monthStart = (period: string, timeZone: string) => {
  const { year, month } = parsePeriod(period);
  return zonedInstant(timeZone, year, month, 1);
};

/** The calendar date `days` days after the local date of `at`, as year/month/day. */
export const addLocalDays = (at: Date, timeZone: string, days: number) => {
  const p = localParts(at, timeZone);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return {
    day: d.getUTCDate(),
    month: d.getUTCMonth() + 1,
    year: d.getUTCFullYear(),
  };
};

/** Start of the local day that is `days` days after the one of `at`. */
export const startOfLocalDayPlus = (
  at: Date,
  timeZone: string,
  days: number
) => {
  const d = addLocalDays(at, timeZone, days);
  return zonedInstant(timeZone, d.year, d.month, d.day);
};
