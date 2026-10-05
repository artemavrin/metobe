import "server-only";
import { chatLimitFor, chatLimitsOf } from "@metobe/contracts/limits";
import type { ChatLimits } from "@metobe/contracts/limits";
import { isRole } from "@metobe/contracts/members";

import { mergePolicies, readPolicies } from "./policies";
import { retryIn } from "./rate-limit";

// How many messages a person may send to the chat, by role (ARCH §10), in system_settings.policies.rateLimits.
// Counted in Redis with the sign-in codes' counter: a minute's window and a day's, each started by its first message.
// Not the calendar day: the person sets their own time zone, and moving it would start a new day at will.

const MINUTE = 60;
const DAY = 24 * 60 * 60;

export const getChatLimits = async (): Promise<ChatLimits> => {
  const { rateLimits } = await readPolicies();
  return chatLimitsOf(rateLimits);
};

export const setChatLimits = (limits: ChatLimits) =>
  mergePolicies({ rateLimits: limits });

/** The moment `seconds` from now. */
const at = (seconds: number) => new Date(Date.now() + seconds * 1000);

export interface ChatLimited {
  code: "too-fast" | "daily-limit";
  /** When the next message may go. */
  retryAt: Date;
}

/**
 * Counts one more message from this person; why it may not go and when it may, or null. A message stopped by the
 * minute is not counted against the day.
 */
export const checkChatLimit = async (user: {
  id: string;
  role: unknown;
}): Promise<ChatLimited | null> => {
  const limit = chatLimitFor(
    isRole(user.role) ? user.role : "user",
    await getChatLimits()
  );
  if (limit.perMinute !== null) {
    const wait = await retryIn(
      `chat:minute:${user.id}`,
      limit.perMinute,
      MINUTE
    );
    if (wait !== null) {
      return { code: "too-fast", retryAt: at(wait) };
    }
  }
  if (limit.perDay !== null) {
    const wait = await retryIn(`chat:day:${user.id}`, limit.perDay, DAY);
    if (wait !== null) {
      return { code: "daily-limit", retryAt: at(wait) };
    }
  }
  return null;
};
