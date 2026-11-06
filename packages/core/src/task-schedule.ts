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

/** The shortest gap between runs: the tick looks every minute, a task runs at most every five. */
export const MIN_GAP_MINUTES = 5;

/**
 * Whether the cron runs more often than every {@link MIN_GAP_MINUTES} minutes: two of its minutes too close within an
 * hour, or across the hour's turn when it runs in two hours in a row. Assumes a cron that parses.
 */
export const isTooFrequent = (cron: string) => {
  const { minute, hour } = CronExpressionParser.parse(cron).fields;
  const minutes = [...minute.values].map(Number).toSorted((a, b) => a - b);
  const hours = new Set(hour.values.map(Number));
  const close = minutes.some(
    (m, i) => i > 0 && m - (minutes[i - 1] ?? m) < MIN_GAP_MINUTES
  );
  const nextHour = [...hours].some((h) => hours.has((h + 1) % 24));
  const first = minutes[0] ?? 0;
  const last = minutes.at(-1) ?? 0;
  return close || (nextHour && 60 - last + first < MIN_GAP_MINUTES);
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

// ── The schedule in words ──────────────────────────────────────────────────────────────────────────────────────────

const DAYS = {
  en: [
    "Sundays",
    "Mondays",
    "Tuesdays",
    "Wednesdays",
    "Thursdays",
    "Fridays",
    "Saturdays",
  ],
  ru: [
    "воскресеньям",
    "понедельникам",
    "вторникам",
    "средам",
    "четвергам",
    "пятницам",
    "субботам",
  ],
};

const join = (items: string[], locale: "ru" | "en") => {
  const and = locale === "ru" ? " и " : " and ";
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")}${and}${items.at(-1)}`;
};

/** «9:00», «9:00 и 15:00» from a cron's minute and hour fields; null when they are not plain numbers. */
const timesOf = (minute: string, hour: string, locale: "ru" | "en") => {
  if (!/^\d{1,2}$/u.test(minute) || !/^\d{1,2}(?:,\d{1,2})*$/u.test(hour)) {
    return null;
  }
  return join(
    hour.split(",").map((h) => `${Number(h)}:${minute.padStart(2, "0")}`),
    locale
  );
};

/** The week from Monday, as people count it. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Day-of-week field → the day numbers 0–6 from Monday; null for anything but a list or a range of plain numbers. */
const daysOf = (field: string) => {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const range = /^(?<from>\d)-(?<to>\d)$/u.exec(part)?.groups;
    if (range) {
      for (let d = Number(range.from); d <= Number(range.to); d += 1) {
        out.add(d % 7);
      }
    } else if (/^\d$/u.test(part)) {
      out.add(Number(part) % 7);
    } else {
      return null;
    }
  }
  return WEEK.filter((d) => out.has(d));
};

/** «По будням в 9:00», «По понедельникам и средам в 8:30» — or null for a day field that is not plain. */
const weeklyWords = (dow: string, at: string, locale: "ru" | "en") => {
  const days = daysOf(dow);
  if (!days) {
    return null;
  }
  const ru = locale === "ru";
  const key = days.join(",");
  if (key === "1,2,3,4,5") {
    return ru ? `По будням в ${at}` : `On weekdays at ${at}`;
  }
  if (key === "6,0") {
    return ru ? `По выходным в ${at}` : `On weekends at ${at}`;
  }
  const names = join(
    days.map((d) => DAYS[locale][d] ?? ""),
    locale
  );
  return ru ? `По ${names} в ${at}` : `On ${names} at ${at}`;
};

/** «5 минут», «2 часа», «21 минуту» — a count with its noun in Russian. */
const ruCount = (n: number, [one, few, many]: [string, string, string]) => {
  const form = new Intl.PluralRules("ru").select(n);
  const noun = { few, one }[form as "few" | "one"] ?? many;
  return `${n} ${noun}`;
};

const MINUTES: [string, string, string] = ["минуту", "минуты", "минут"];
const HOURS: [string, string, string] = ["час", "часа", "часов"];

/** The N of a step field («every N»); undefined for anything else. */
const step = (field: string) => /^\*\/(?<n>\d{1,2})$/u.exec(field)?.groups?.n;

/** «Каждые 5 минут», «Каждый час», «Каждые 2 часа» — a run every so often, all day every day; null for anything else. */
const intervalWords = (fields: string[], locale: "ru" | "en") => {
  const [minute = "", hour = "", dom = "", month = "", dow = ""] = fields;
  if (dom !== "*" || month !== "*" || dow !== "*") {
    return null;
  }
  const ru = locale === "ru";
  const every = (n: number, unit: "minute" | "hour") => {
    if (n === 1) {
      if (unit === "minute") {
        return ru ? "Каждую минуту" : "Every minute";
      }
      return ru ? "Каждый час" : "Every hour";
    }
    if (!ru) {
      return `Every ${n} ${unit}s`;
    }
    const words = ruCount(n, unit === "minute" ? MINUTES : HOURS);
    return `${new Intl.PluralRules("ru").select(n) === "one" ? "Каждую" : "Каждые"} ${words}`;
  };
  if (hour === "*" && (minute === "*" || step(minute))) {
    return every(Number(step(minute) ?? 1), "minute");
  }
  if (minute === "0" && (hour === "*" || step(hour))) {
    return every(Number(step(hour) ?? 1), "hour");
  }
  return null;
};

/**
 * A cron as people say it: «По будням в 9:00», «По понедельникам в 10:00», «Каждый день в 18:00», «Каждый месяц
 * 1-го числа в 9:00». A cron outside these shapes is shown as it is — never a wrong sentence.
 */
export const scheduleWords = (cron: string, locale: "ru" | "en") => {
  const fields = cron.trim().split(/\s+/u);
  if (fields.length === 5) {
    const interval = intervalWords(fields, locale);
    if (interval) {
      return interval;
    }
  }
  const [minute = "", hour = "", dom = "", month = "", dow = ""] = fields;
  const at = timesOf(minute, hour, locale);
  if (!at || month !== "*" || fields.length !== 5) {
    return cron;
  }
  const ru = locale === "ru";
  if (dom === "*" && dow === "*") {
    return ru ? `Каждый день в ${at}` : `Every day at ${at}`;
  }
  if (dom === "*") {
    return weeklyWords(dow, at, locale) ?? cron;
  }
  if (dow === "*" && /^\d{1,2}$/u.test(dom)) {
    return ru
      ? `Каждый месяц ${Number(dom)}-го числа в ${at}`
      : `Monthly on day ${Number(dom)} at ${at}`;
  }
  return cron;
};
