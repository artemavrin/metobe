"use server";

import { setModelsEnabled } from "@metobe/core/sources";
import { getSource } from "@metobe/core/sources-read";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

const idSchema = z.uuid();

/** The models step: exactly the chosen models of the source go to chat, the rest stay off. */
export const chooseModels = async (sourceId: string, modelIds: string[]) => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    throw new Error("forbidden");
  }
  const id = idSchema.parse(sourceId);
  const on = new Set(z.array(idSchema).min(1).max(5000).parse(modelIds));
  const detail = await getSource(id);
  if (!detail) {
    throw new Error("not-found");
  }
  const off = detail.models.filter((m) => !on.has(m.id)).map((m) => m.id);
  await setModelsEnabled(id, [...on], true);
  if (off.length > 0) {
    await setModelsEnabled(id, off, false);
  }
  revalidatePath("/", "layout");
};
