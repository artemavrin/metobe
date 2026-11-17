"use server";

import { sandboxMask } from "@metobe/core/ai";
import {
  PRIVACY_ACTIONS,
  PRIVACY_PLACES,
  PRIVACY_RETENTION,
  PRIVACY_TYPES,
  setPrivacySettings,
} from "@metobe/core/privacy-settings";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// Data protection (PII-GUARD-PLAN З6): admins only. Each action changes one value; the rest stays.

const requireAdmin = async () => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    throw new Error("forbidden");
  }
};

const refresh = () => revalidatePath("/settings/privacy");

export const toggleOn = async (on: boolean) => {
  await requireAdmin();
  await setPrivacySettings((s) => ({ ...s, on: z.boolean().parse(on) }));
  refresh();
};

export const togglePlace = async (place: string, on: boolean) => {
  await requireAdmin();
  const id = z.enum(PRIVACY_PLACES).parse(place);
  await setPrivacySettings((s) => ({
    ...s,
    places: { ...s.places, [id]: z.boolean().parse(on) },
  }));
  refresh();
};

export const setTypeAction = async (type: string, action: string) => {
  await requireAdmin();
  const id = z.enum(PRIVACY_TYPES).parse(type);
  const value = z.enum(PRIVACY_ACTIONS).parse(action);
  await setPrivacySettings((s) => ({
    ...s,
    types: { ...s.types, [id]: value },
  }));
  refresh();
};

export const toggleLocal = async (on: boolean) => {
  await requireAdmin();
  await setPrivacySettings((s) => ({ ...s, local: z.boolean().parse(on) }));
  refresh();
};

export const setKeepFor = async (keepFor: string) => {
  await requireAdmin();
  const value = z.enum(PRIVACY_RETENTION).parse(keepFor);
  await setPrivacySettings((s) => ({ ...s, keepFor: value }));
  refresh();
};

const addressSchema = z
  .url({ protocol: /^https?$/u })
  .or(z.literal("").transform(() => null));

/** The service's address — empty goes back to the install's — checked again when the page reloads. */
export const saveAddress = async (url: string) => {
  await requireAdmin();
  const parsed = addressSchema.safeParse(url.trim());
  if (!parsed.success) {
    return { ok: false as const };
  }
  await setPrivacySettings((s) => ({ ...s, url: parsed.data }));
  refresh();
  return { ok: true as const };
};

/** Checks the service again: the page asks it when it renders. */
export const recheck = async () => {
  await requireAdmin();
  refresh();
};

/** The sandbox: a text masked under the current rules; nothing is kept. */
export const sandbox = async (text: string) => {
  await requireAdmin();
  return sandboxMask(z.string().max(20_000).parse(text));
};
