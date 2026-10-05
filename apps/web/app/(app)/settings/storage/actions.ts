"use server";

import { probeStorage } from "@metobe/core/storage";
import type { StorageProbe } from "@metobe/core/storage";

import { getSettingsViewer } from "@/lib/settings-access";

// The files' storage: admins only.

/** A real round trip to the storage; null when it is off. */
export const probe = async (): Promise<StorageProbe | null> => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    throw new Error("forbidden");
  }
  return await probeStorage();
};
