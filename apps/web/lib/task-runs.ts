import type { TaskRunRow } from "@metobe/core/tasks";

/** Whether a past run's answer can be opened: it got to a result, and its chat is there. */
export const hasAnswer = (r: TaskRunRow) =>
  r.status === "done" &&
  r.outcome !== null &&
  r.outcome !== "quiet" &&
  r.chatId !== null;

/**
 * A time of day in a zone, built from numbers: «9:35» in Russian, «9:35 AM» in English. `Intl` with `hour: "numeric"`
 * gives «09:35» on the server and «9:35» in the browser (their ICU data differ for ru), and the page fails to hydrate.
 */
export const clock = (d: Date, timeZone: string, locale: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  if (locale.startsWith("en")) {
    return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
  }
  return `${hour}:${minute}`;
};
