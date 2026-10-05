import "server-only";
import { chatLimitFor, chatLimitsOf, dayIn } from "@metobe/contracts/limits";
import type { ChatLimits } from "@metobe/contracts/limits";
import { isRole } from "@metobe/contracts/members";

import { mergePolicies, readPolicies } from "./policies";
import { allow } from "./rate-limit";

// How many messages a person may send to the chat, by role (ARCH §10), in system_settings.policies.rateLimits.
// Counted in Redis with the sign-in codes' counter: a minute's window, and the person's calendar day — so «try again
// tomorrow» is true where they are.

const MINUTE = 60;
// A day key lives a little longer than any day, wherever the person is; the date in it starts the next one anew.
const DAY_KEY_SECONDS = 26 * 60 * 60;

export const getChatLimits = async (): Promise<ChatLimits> => {
  const { rateLimits } = await readPolicies();
  return chatLimitsOf(rateLimits);
};

export const setChatLimits = (limits: ChatLimits) =>
  mergePolicies({ rateLimits: limits });

/**
 * Counts one more message from this person; why it may not go, or null. A message stopped by the minute is not
 * counted against the day.
 */
export const checkChatLimit = async (user: {
  id: string;
  role: unknown;
  timeZone?: string | null;
}): Promise<"too-fast" | "daily-limit" | null> => {
  const limit = chatLimitFor(
    isRole(user.role) ? user.role : "user",
    await getChatLimits()
  );
  if (
    limit.perMinute !== null &&
    !(await allow(`chat:minute:${user.id}`, limit.perMinute, MINUTE))
  ) {
    return "too-fast";
  }
  const day = dayIn(user.timeZone, new Date());
  if (
    limit.perDay !== null &&
    !(await allow(`chat:day:${user.id}:${day}`, limit.perDay, DAY_KEY_SECONDS))
  ) {
    return "daily-limit";
  }
  return null;
};
