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

import { mergePolicies, readPolicies } from "./policies";

// What people may connect by themselves (ARCH §17.1), in system_settings.policies: `personalConnections` — off,
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

/** The admin's choice; a value a hand edit broke reads as the default. */
export const getPersonalPolicy = async (): Promise<PersonalPolicy> => {
  const policies = await readPolicies();
  const mode = modeSchema.safeParse(policies.personalConnections);
  const approvals = defaultsSchema.safeParse(policies.personalApprovalDefaults);
  return {
    approvals: approvals.success ? approvals.data : {},
    mode: mode.success ? mode.data : DEFAULT_PERSONAL_MODE,
  };
};

export const setPersonalMode = (mode: PersonalMode) =>
  mergePolicies({ personalConnections: mode });

export const setPersonalApproval = async (
  tool: MailTool,
  value: PersonalApproval
) => {
  const { approvals } = await getPersonalPolicy();
  await mergePolicies({
    personalApprovalDefaults: { ...approvals, [tool]: value },
  });
};
