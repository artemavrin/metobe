"use server";

import { domainSchema } from "@metobe/contracts/access";
import { addAllowedDomain, removeAllowedDomain } from "@metobe/core/access";
import type { AddDomainResult } from "@metobe/core/access";
import { revalidatePath } from "next/cache";

import { getSettingsViewer } from "@/lib/settings-access";

// Who may sign in by themselves (D17): admins only.

const requireAdmin = async () => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    throw new Error("forbidden");
  }
};

const refresh = () => revalidatePath("/settings/access");

/** Lists a domain; what is wrong with it, when it cannot be listed. */
export const addDomain = async (input: string): Promise<AddDomainResult> => {
  await requireAdmin();
  const result = await addAllowedDomain(input);
  if (result.ok) {
    refresh();
  }
  return result;
};

export const removeDomain = async (domain: string) => {
  await requireAdmin();
  const parsed = domainSchema.safeParse(domain);
  if (parsed.success) {
    await removeAllowedDomain(parsed.data);
    refresh();
  }
};
