import "server-only";
import { sandboxLimitsSchema } from "@metobe/contracts/sandbox";
import type { SandboxLimits } from "@metobe/contracts/sandbox";
import { systemSettings } from "@metobe/db/schema/system";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "./db";

// The sandbox's settings (D47, P35), in system_settings.policies.sandbox: whether the model may run code at all, and
// the admin's limits. No limits saved — the service's own, from its `.env`. The app hands saved limits to the service
// on each save and with each new box, so a restarted service has them back with the first one.

export interface SandboxSettings {
  enabled: boolean;
  /** Null — never changed here: the service's own. */
  limits: SandboxLimits | null;
}

/** Each value on its own: one a hand edit broke does not take the other along. */
export const sandboxSettingsOf = (
  policies: Record<string, unknown>
): SandboxSettings => {
  const raw = z.record(z.string(), z.unknown()).safeParse(policies.sandbox);
  const part = raw.success ? raw.data : {};
  const enabled = z.boolean().safeParse(part.enabled);
  const limits = sandboxLimitsSchema.safeParse(part.limits);
  return {
    enabled: enabled.success ? enabled.data : true,
    limits: limits.success ? limits.data : null,
  };
};

const readPolicies = async () => {
  const { db } = getDb();
  const [row] = await db
    .select({ policies: systemSettings.policies })
    .from(systemSettings)
    .where(eq(systemSettings.id, 1));
  return row?.policies ?? {};
};

// Read before each answer and each new box: a short cache keeps that one query, a change shows within seconds.
const CACHE_MS = 5000;
let cached: { at: number; value: SandboxSettings } | null = null;

export const getSandboxSettings = async (fresh = false) => {
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) {
    return cached.value;
  }
  const value = sandboxSettingsOf(await readPolicies());
  cached = { at: Date.now(), value };
  return value;
};

/** Changes the policies' sandbox part; the rest of them stays as it is. */
export const setSandboxSettings = async (
  patch: (current: SandboxSettings) => SandboxSettings
) => {
  const { db } = getDb();
  const all = await readPolicies();
  const value = patch(sandboxSettingsOf(all));
  const next = { ...all, sandbox: value };
  await db
    .insert(systemSettings)
    .values({ id: 1, policies: next })
    .onConflictDoUpdate({
      set: { policies: next, updatedAt: new Date() },
      target: systemSettings.id,
    });
  cached = { at: Date.now(), value };
  return value;
};
