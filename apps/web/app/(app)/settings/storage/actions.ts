"use server";

import { probeStorage } from "@metobe/core/storage";
import type { StorageProbe } from "@metobe/core/storage";

import { requirePlatform } from "@/lib/context";

// The files' storage: admins only.

/** A real round trip to the storage; null when it is off. */
export const probe = async (): Promise<StorageProbe | null> => {
  await requirePlatform();
  return await probeStorage();
};
