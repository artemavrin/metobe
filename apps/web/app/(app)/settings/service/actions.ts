"use server";

import { modelSlots } from "@metobe/contracts/models";
import { setSlotModel } from "@metobe/core/model-slots";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

const slotSchema = z.object({
  modelId: z.uuid().nullable(),
  slot: z.enum(modelSlots),
});

/** Gives a service job to a model, or takes it away (null). Admins only. */
export const saveSlot = async (slot: string, modelId: string | null) => {
  const { admin } = await getSettingsViewer();
  const parsed = slotSchema.safeParse({ modelId, slot });
  if (!admin || !parsed.success) {
    throw new Error("forbidden");
  }
  await setSlotModel(parsed.data.slot, parsed.data.modelId);
  revalidatePath("/settings/service");
};
