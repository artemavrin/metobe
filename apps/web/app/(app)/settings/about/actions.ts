"use server";

import { updateAutomationSchema } from "@metobe/contracts/updates";
import type { UpdateAutomation } from "@metobe/contracts/updates";
import { saveUpdateAutomation } from "@metobe/core/update-automation";
import { getRollbackCandidate } from "@metobe/core/update-history";
import { requestRollback, requestUpdate } from "@metobe/core/updater-bus";
import { checkForUpdates } from "@metobe/core/updates";
import { APP_VERSION } from "@metobe/core/version";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

const adminId = async () => {
  const { admin, user } = await getSettingsViewer();
  if (!admin || !user) {
    throw new Error("forbidden");
  }
  return user.id;
};

// «Проверить сейчас» (D35): asks GitHub at once instead of waiting for the six-hourly check. Admins only.
export const checkUpdatesNow = async () => {
  await adminId();
  await checkForUpdates();
  // The dots of the settings menu and the account menu read the same check.
  revalidatePath("/", "layout");
};

/** «Обновить до X»: an ask to the updater, which checks X itself; false — a run is going or there is no updater. */
export const startUpdate = async (version: string) =>
  requestUpdate(
    z
      .string()
      .regex(/^\d+\.\d+\.\d+$/u)
      .parse(version),
    await adminId()
  );

export const saveUpdateSchedule = async (value: UpdateAutomation) => {
  await adminId();
  const settings = updateAutomationSchema.parse(value);
  await saveUpdateAutomation(settings);
  revalidatePath("/settings/about");
};

export const startRollback = async (id: string) => {
  const userId = await adminId();
  const runId = z.string().uuid().parse(id);
  if (!(await getRollbackCandidate(runId, APP_VERSION))) {
    return false;
  }
  return requestRollback(runId, userId);
};
