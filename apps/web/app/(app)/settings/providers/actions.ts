"use server";

import { updateProvider } from "@metobe/core/providers";
import { setModelsEnabled } from "@metobe/core/sources";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logoSchema } from "@/lib/logo";
import { getSettingsViewer } from "@/lib/settings-access";

// Providers (M2 step 6c): admins only; every change refreshes the settings layout (sidebar names and logos).

const requireAdmin = async () => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    throw new Error("forbidden");
  }
};

const idSchema = z.uuid();
const refresh = () => revalidatePath("/settings", "layout");

export const rename = async (id: string, title: string) => {
  await requireAdmin();
  await updateProvider(idSchema.parse(id), {
    title: z.string().trim().min(1).max(100).parse(title),
  });
  refresh();
};

/** A built-in logo key, an uploaded image, or `null` for the automatic one. */
export const setLogo = async (id: string, logo: string | null) => {
  await requireAdmin();
  await updateProvider(idSchema.parse(id), {
    logo: logo === null ? null : logoSchema.parse(logo),
  });
  refresh();
};

/** A model turned on or off in the source it comes through. */
export const toggleModel = async (
  sourceId: string,
  modelId: string,
  enabled: boolean
) => {
  await requireAdmin();
  await setModelsEnabled(
    idSchema.parse(sourceId),
    [idSchema.parse(modelId)],
    Boolean(enabled)
  );
  refresh();
};
