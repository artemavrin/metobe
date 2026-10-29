"use server";

import { checkForUpdates } from "@metobe/core/updates";
import { revalidatePath } from "next/cache";

import { getSettingsViewer } from "@/lib/settings-access";

// «Проверить сейчас» (D35): asks GitHub at once instead of waiting for the six-hourly check. Admins only.
export const checkUpdatesNow = async () => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    throw new Error("forbidden");
  }
  await checkForUpdates();
  // The dots of the settings menu and the account menu read the same check.
  revalidatePath("/", "layout");
};
