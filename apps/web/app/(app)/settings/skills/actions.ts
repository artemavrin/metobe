"use server";

import { deleteSkill, setSkillEnabled } from "@metobe/core/skills";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// The organization's skills (ARCH §8.3): turned on and off, deleted — admins only; the core checks it again.

const actor = async () => {
  const { admin, user } = await getSettingsViewer();
  if (!user || !admin) {
    throw new Error("forbidden");
  }
  return { admin, userId: user.id };
};

const refresh = () => revalidatePath("/settings/skills");

export const toggleSkill = async (id: string, enabled: boolean) => {
  const ok = await setSkillEnabled(await actor(), z.uuid().parse(id), enabled);
  refresh();
  return ok;
};

export const removeSkill = async (id: string) => {
  const ok = await deleteSkill(await actor(), z.uuid().parse(id));
  refresh();
  return ok;
};

export const refreshSkills = async () => {
  await actor();
  refresh();
};
