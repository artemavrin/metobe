import { z } from "zod";

import type { Role } from "./members";

// How many messages a person may send to the chat (ARCH §10, rate limit by role): per minute, so no one floods the
// models, and per day, so no one burns the budget. Kept in system_settings.policies.rateLimits; the owner has none.

/** The roles the admin sets limits for; the owner is never limited. */
export const limitedRoles = ["user", "admin"] as const;
export type LimitedRole = (typeof limitedRoles)[number];

const countSchema = z.number().int().min(1).max(1_000_000).nullable();

/** One role's limits; null — no limit. */
export const chatLimitSchema = z.object({
  perDay: countSchema,
  perMinute: countSchema,
});
export type ChatLimit = z.infer<typeof chatLimitSchema>;

export type ChatLimits = Record<LimitedRole, ChatLimit>;

export const DEFAULT_CHAT_LIMITS: ChatLimits = {
  admin: { perDay: 1000, perMinute: 30 },
  user: { perDay: 300, perMinute: 10 },
};

/** The limits stored, each role read on its own: one a hand edit broke falls back to its default, not the others. */
export const chatLimitsOf = (stored?: unknown): ChatLimits => {
  const roles = z.record(z.string(), z.unknown()).safeParse(stored);
  const of = (role: LimitedRole) => {
    const parsed = chatLimitSchema.safeParse(roles.success && roles.data[role]);
    return parsed.success ? parsed.data : DEFAULT_CHAT_LIMITS[role];
  };
  return { admin: of("admin"), user: of("user") };
};

/** A role's limits; none for the owner. */
export const chatLimitFor = (role: Role, limits: ChatLimits): ChatLimit =>
  role === "superuser"
    ? { perDay: null, perMinute: null }
    : limits[role === "admin" ? "admin" : "user"];
