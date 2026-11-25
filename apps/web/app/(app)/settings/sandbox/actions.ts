"use server";

import {
  SANDBOX_DEFAULT_LIMITS,
  sandboxLimitsSchema,
} from "@metobe/contracts/sandbox";
import type { SandboxLimits } from "@metobe/contracts/sandbox";
import {
  dropSandboxBox,
  pushSandboxLimits,
  sandboxStatus,
} from "@metobe/core/sandbox";
import {
  getSandboxSettings,
  setSandboxSettings,
} from "@metobe/core/sandbox-settings";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatform } from "@/lib/context";

// The sandbox (D47, P35): admins only. Each action changes one value; the rest stays.

const refresh = () => revalidatePath("/settings/sandbox");

/** Every box now: dropped when the admin turns the sandbox off. A box the service cannot drop expires anyway. */
const dropAll = async () => {
  const status = await sandboxStatus();
  await Promise.all(
    (status?.boxes ?? []).map((b) => dropSandboxBox(b.key).catch(() => null))
  );
};

export const setSandboxOn = async (on: boolean) => {
  await requirePlatform();
  const value = z.boolean().parse(on);
  await setSandboxSettings((s) => ({ ...s, enabled: value }));
  if (!value) {
    await dropAll();
  }
  refresh();
};

const limitKeys = [
  "total",
  "perUser",
  "idleSeconds",
  "memoryMb",
  "runSeconds",
  "fileMb",
  "network",
] as const;

/**
 * One limit, saved whole with the others: the saved ones, else the service's own (its defaults while it is down).
 * Handed to the service at once; a service that is down gets them with its next box. `false` — it does not fit.
 */
export const setSandboxLimit = async (
  key: (typeof limitKeys)[number],
  value: number | boolean
): Promise<boolean> => {
  await requirePlatform();
  const field = z.enum(limitKeys).parse(key);
  const [settings, status] = await Promise.all([
    getSandboxSettings(true),
    sandboxStatus(),
  ]);
  const base = settings.limits ?? status?.limits ?? SANDBOX_DEFAULT_LIMITS;
  const parsed = sandboxLimitsSchema.safeParse({ ...base, [field]: value });
  if (!parsed.success) {
    return false;
  }
  const limits: SandboxLimits = parsed.data;
  await setSandboxSettings((s) => ({ ...s, limits }));
  await pushSandboxLimits(limits).catch((error: unknown) => {
    console.error("sandbox: the service did not take the limits", error);
  });
  refresh();
  return true;
};

/** Drops one box (its chat's or task's key). `false` — the service did not answer. */
export const dropBox = async (key: string): Promise<boolean> => {
  await requirePlatform();
  const ok = await dropSandboxBox(z.string().min(1).max(200).parse(key))
    .then(() => true)
    .catch(() => false);
  refresh();
  return ok;
};
