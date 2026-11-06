import { isTimeZone } from "@metobe/i18n/prefs";
import { tool } from "ai";
import type { Tool } from "ai";
import { z } from "zod";

/** The tool's name. */
export const TIME_TOOL = "current_time";

/**
 * What the model is told once, at the top of the prompt: it cannot know the date. The same for every request, so the
 * cache keeps hitting (a date in the prompt would change it).
 */
export const TIME_NOTE = `You cannot know the current date or time by yourself. Whenever an answer depends on it — «today», «tomorrow», «this week», an age, a deadline, «the latest», reading a date in data — call ${TIME_TOOL} first and go by what it says, in the user's time zone unless they ask about another place.`;

const timeInput = z.object({
  timeZone: z
    .string()
    .optional()
    .describe(
      "An IANA zone such as Asia/Tokyo, only for the time somewhere else; leave it out for the user's own."
    ),
});
export type TimeInput = z.infer<typeof timeInput>;

export interface TimeOutput {
  /** «Wednesday, 30 September 2026, 01:52:10 (Europe/Moscow, GMT+3)». */
  local: string;
  timeZone: string;
  /** The same moment in UTC, ISO 8601. */
  utc: string;
}

/** «Wednesday, 30 September 2026, 01:52:10 (Europe/Moscow, GMT+3)». */
export const localTime = (at: Date, timeZone: string) => {
  const parts = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(at);
  const day = parts({
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  });
  const time = parts({
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  });
  const offset = parts({ timeZoneName: "shortOffset" }).split(" ").at(-1);
  return `${day}, ${time} (${timeZone}, ${offset})`;
};

/** The present moment, in the user's zone or in the one the model names; a name that is no zone falls back to theirs. */
export const timeTool = (userZone: string): Tool<TimeInput, TimeOutput> =>
  tool({
    description:
      "The current date and time, exact to the second. The model has no clock: call this for anything that depends on now.",
    execute: ({ timeZone }) => {
      const zone = isTimeZone(timeZone) ? timeZone : userZone;
      const at = new Date();
      return {
        local: localTime(at, zone),
        timeZone: zone,
        utc: at.toISOString(),
      };
    },
    inputSchema: timeInput,
  });
