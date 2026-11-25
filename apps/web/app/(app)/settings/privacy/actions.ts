"use server";

import { sandboxMask } from "@metobe/core/ai";
import { getEnv } from "@metobe/core/env";
import {
  readPrivacySettings,
  guardUrl,
  PRIVACY_ACTIONS,
  PRIVACY_PLACES,
  PRIVACY_RETENTION,
  PRIVACY_TYPES,
  setGuardService,
  setPrivacySettings,
  usesBundledGuard,
} from "@metobe/core/privacy-settings";
import { requestGuard, updaterAlive } from "@metobe/core/updater-bus";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// Data protection (PII-GUARD-PLAN З6): the rules are the organization's owner's and admins'; the service's address
// and its start are the platform's. Each action changes one value; the rest stays.

const requireOrgManager = async () => {
  const { admin, orgId, orgManager } = await getSettingsViewer();
  if (!(orgManager && orgId)) {
    throw new Error("forbidden");
  }
  return { orgId, platform: admin };
};

const requirePlatform = async () => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    throw new Error("forbidden");
  }
};

const refresh = () => revalidatePath("/settings/privacy");

/**
 * Masking on or off. With the install's own service meant, the updater starts or stops it — when the platform's own
 * admin switches; an organization's admin only changes its rules. A service of another server is its admin's. `setup`: started — the updater took it; busy — it is updating or starting already; manual —
 * no updater on this server, and nothing to mask with yet.
 */
export const toggleOn = async (
  on: boolean
): Promise<{ setup: "started" | "busy" | "manual" | null }> => {
  const { orgId, platform } = await requireOrgManager();
  const value = z.boolean().parse(on);
  const settings = await readPrivacySettings(orgId);
  await setPrivacySettings(orgId, (s) => ({ ...s, on: value }));
  let setup: "started" | "busy" | "manual" | null = null;
  if (platform && usesBundledGuard(settings)) {
    if (await updaterAlive()) {
      // On: unless it is up and the app has its token. Off: unless there is nothing running to stop.
      const needed = value
        ? !settings.bundled || !getEnv().PII_GUARD_TOKEN
        : guardUrl(settings) !== null;
      if (needed) {
        setup = (await requestGuard(value, !getEnv().PII_GUARD_TOKEN))
          ? "started"
          : "busy";
      }
    } else if (value && !guardUrl(settings)) {
      setup = "manual";
    }
  }
  refresh();
  return { setup };
};

export const togglePlace = async (place: string, on: boolean) => {
  const { orgId } = await requireOrgManager();
  const id = z.enum(PRIVACY_PLACES).parse(place);
  await setPrivacySettings(orgId, (s) => ({
    ...s,
    places: { ...s.places, [id]: z.boolean().parse(on) },
  }));
  refresh();
};

export const setTypeAction = async (type: string, action: string) => {
  const { orgId } = await requireOrgManager();
  const id = z.enum(PRIVACY_TYPES).parse(type);
  const value = z.enum(PRIVACY_ACTIONS).parse(action);
  await setPrivacySettings(orgId, (s) => ({
    ...s,
    types: { ...s.types, [id]: value },
  }));
  refresh();
};

export const toggleLocal = async (on: boolean) => {
  const { orgId } = await requireOrgManager();
  await setPrivacySettings(orgId, (s) => ({
    ...s,
    local: z.boolean().parse(on),
  }));
  refresh();
};

export const setKeepFor = async (keepFor: string) => {
  const { orgId } = await requireOrgManager();
  const value = z.enum(PRIVACY_RETENTION).parse(keepFor);
  await setPrivacySettings(orgId, (s) => ({ ...s, keepFor: value }));
  refresh();
};

const addressSchema = z
  .url({ protocol: /^https?$/u })
  .or(z.literal("").transform(() => null));

/** The service's address — empty goes back to the install's — checked again when the page reloads. */
export const saveAddress = async (url: string) => {
  await requirePlatform();
  const parsed = addressSchema.safeParse(url.trim());
  if (!parsed.success) {
    return { ok: false as const };
  }
  await setGuardService((s) => ({ ...s, url: parsed.data }));
  refresh();
  return { ok: true as const };
};

/** Checks the service again: the page asks it when it renders. */
export const recheck = async () => {
  await requireOrgManager();
  refresh();
};

/** The sandbox: a text masked under the current rules; nothing is kept. */
export const sandbox = async (text: string) => {
  const { orgId } = await requireOrgManager();
  return sandboxMask(orgId, z.string().max(20_000).parse(text));
};
