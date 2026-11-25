"use server";

import {
  domainSchema,
  personalApprovals,
  personalModes,
} from "@metobe/contracts/access";
import { mailTools } from "@metobe/contracts/email";
import { addAllowedDomain, removeAllowedDomain } from "@metobe/core/access";
import type { AddDomainResult } from "@metobe/core/access";
import { setPersonalApproval, setPersonalMode } from "@metobe/core/personal";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// Who may sign in by themselves (D17) and what people may connect by themselves (ARCH §17.1): the organization's
// owner and admins, for their own organization.

const requireOrgManager = async () => {
  const { orgId, orgManager } = await getSettingsViewer();
  if (!(orgManager && orgId)) {
    throw new Error("forbidden");
  }
  return orgId;
};

const refresh = () => revalidatePath("/settings/access");

/** Lists a domain; what is wrong with it, when it cannot be listed. */
export const addDomain = async (input: string): Promise<AddDomainResult> => {
  const orgId = await requireOrgManager();
  const result = await addAllowedDomain(orgId, input);
  if (result.ok) {
    refresh();
  }
  return result;
};

export const removeDomain = async (domain: string) => {
  const orgId = await requireOrgManager();
  const parsed = domainSchema.safeParse(domain);
  if (parsed.success) {
    await removeAllowedDomain(orgId, parsed.data);
    refresh();
  }
};

/** Off, internet addresses only, or any, for people's own connections. */
export const changePersonalMode = async (mode: string) => {
  const orgId = await requireOrgManager();
  const parsed = z.enum(personalModes).safeParse(mode);
  if (parsed.success) {
    await setPersonalMode(orgId, parsed.data);
    // Their own boxes and the chat's tools follow it.
    revalidatePath("/settings", "layout");
  }
};

/** «Ask first?» by default for a tool of people's own mail. */
export const changePersonalApproval = async (tool: string, value: string) => {
  const orgId = await requireOrgManager();
  const parsed = z
    .object({ tool: z.enum(mailTools), value: z.enum(personalApprovals) })
    .safeParse({ tool, value });
  if (parsed.success) {
    await setPersonalApproval(orgId, parsed.data.tool, parsed.data.value);
    revalidatePath("/settings", "layout");
  }
};
