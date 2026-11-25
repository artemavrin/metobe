"use server";

import { modelSlots } from "@metobe/contracts/models";
import { setSlotModel } from "@metobe/core/model-slots";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatform } from "@/lib/context";

const slotSchema = z.object({
  modelId: z.uuid().nullable(),
  slot: z.enum(modelSlots),
});

/** Gives a service job to a model, or takes it away (null). Admins only. */
export const saveSlot = async (slot: string, modelId: string | null) => {
  await requirePlatform();
  const parsed = slotSchema.safeParse({ modelId, slot });
  if (!parsed.success) {
    throw new Error("forbidden");
  }
  // A model of the wrong kind for the job (a decision model for titles, say) is refused.
  if (!(await setSlotModel(parsed.data.slot, parsed.data.modelId))) {
    throw new Error("wrong model for the job");
  }
  revalidatePath("/settings/service");
};
