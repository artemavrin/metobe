import "server-only";
import { updateAutomationSchema } from "@metobe/contracts/updates";
import type { UpdateAutomation } from "@metobe/contracts/updates";

import { mergePolicies, readPolicies } from "./policies";

const DEFAULTS: UpdateAutomation = {
  autoPatches: false,
  nightlyAt: null,
  timeZone: "UTC",
};

/** Install automation is opt-in and stored alongside the other install policies. */
export const getUpdateAutomation = async (): Promise<UpdateAutomation> => {
  const { updateAutomation } = await readPolicies();
  const parsed = updateAutomationSchema.safeParse(updateAutomation);
  return parsed.success ? parsed.data : DEFAULTS;
};

export const saveUpdateAutomation = (value: UpdateAutomation) =>
  mergePolicies({ updateAutomation: updateAutomationSchema.parse(value) });

/** The local date and time for a configured IANA time zone, independent of the updater container's zone. */
export const localUpdateClock = (now: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
};
