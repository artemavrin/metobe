import "server-only";
import {
  DEFAULT_PERSONAL_MODE,
  personalApprovals,
  personalModes,
} from "@metobe/contracts/access";
import type { PersonalApproval, PersonalMode } from "@metobe/contracts/access";
import { mailTools } from "@metobe/contracts/email";
import type { MailDefaults, MailTool } from "@metobe/contracts/email";
import { z } from "zod";

import { mergeOrgSettings, readOrgSettings } from "./org-settings";
import { getMembership, installOrganizationId } from "./organizations";

// What people may connect by themselves (ARCH §17.1), in the organization's settings: `personalConnections` — off,
// internet addresses only, or any — and `personalApprovalDefaults` — «ask first?» by tool, for their own
// connections. Today those are their mailboxes.

const modeSchema = z.enum(personalModes);
const defaultsSchema = z.partialRecord(
  z.enum(mailTools),
  z.enum(personalApprovals)
);

export interface PersonalPolicy {
  mode: PersonalMode;
  approvals: MailDefaults;
}

const policyOf = (settings: Record<string, unknown>): PersonalPolicy => {
  const mode = modeSchema.safeParse(settings.personalConnections);
  const approvals = defaultsSchema.safeParse(settings.personalApprovalDefaults);
  return {
    approvals: approvals.success ? approvals.data : {},
    mode: mode.success ? mode.data : DEFAULT_PERSONAL_MODE,
  };
};

/** The organization's choice; a value a hand edit broke reads as the default. */
export const getPersonalPolicy = async (orgId: string) =>
  policyOf(await readOrgSettings(orgId));

/** The choice of the organization this person is in; the default for an account that is gone. */
export const getPersonalPolicyOf = async (userId: string) => {
  const membership = await getMembership(userId);
  return membership
    ? getPersonalPolicy(membership.organization.id)
    : policyOf({});
};

/**
 * The choice of the install's organization, for a connection made without knowing whose it is: until one carries its
 * organization (O4) there is only the one.
 */
export const getInstallPersonalPolicy = async () => {
  const orgId = await installOrganizationId();
  return orgId ? getPersonalPolicy(orgId) : policyOf({});
};

export const setPersonalMode = (orgId: string, mode: PersonalMode) =>
  mergeOrgSettings(orgId, { personalConnections: mode });

export const setPersonalApproval = async (
  orgId: string,
  tool: MailTool,
  value: PersonalApproval
) => {
  const { approvals } = await getPersonalPolicy(orgId);
  await mergeOrgSettings(orgId, {
    personalApprovalDefaults: { ...approvals, [tool]: value },
  });
};
