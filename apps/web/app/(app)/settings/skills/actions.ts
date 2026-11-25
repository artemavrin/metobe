"use server";

import { isOrgManager } from "@metobe/contracts/members";
import { deleteSkill, setSkillEnabled } from "@metobe/core/skills";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActiveContext } from "@/lib/context";

// Skills (ARCH §8.3) turned on and off, deleted: the organization's by an admin, a personal one by its owner — the
// core decides who may change which.

const actor = async () => {
  const ctx = await getActiveContext();
  if (!ctx) {
    throw new Error("forbidden");
  }
  return { admin: isOrgManager(ctx.orgRole), userId: ctx.userId };
};

const refresh = () => {
  revalidatePath("/settings/skills");
  revalidatePath("/settings/my-skills");
};

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
