import "server-only";
import {
  domainOf,
  domainSchema,
  isPublicMailDomain,
} from "@metobe/contracts/access";
import { z } from "zod";

import { isMailConfigured } from "./mail";
import { mergeOrgSettings, readOrgSettings } from "./org-settings";
import { installOrganizationId } from "./organizations";
import { findUserByEmail } from "./users";

// Who may sign in by themselves (D17), in the organization's settings (`access`): the email domains whose people get in
// by the code from the mail, with an account made at the first sign-in. Nothing opens without the service's mail —
// there would be no code to send — and a person already in the install needs no domain. Until a domain names its own
// organization (O6) the one a sign-in joins is the install's.

const domainsSchema = z.array(domainSchema);

/** The listed domains, by name. */
export const getAllowedDomains = async (orgId: string): Promise<string[]> => {
  const { access } = await readOrgSettings(orgId);
  const { domains } = (access ?? {}) as { domains?: unknown };
  // A list a hand edit broke is as if there were none: nobody gets in on a guess.
  const parsed = domainsSchema.safeParse(domains);
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
  return [...new Set(parsed.success ? parsed.data : [])].sort();
};

export type AddDomainResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "public" | "listed" };

/** Lists a domain; refuses a name that is not one, a service anyone can have an address on, and one already there. */
export const addAllowedDomain = async (
  orgId: string,
  input: string
): Promise<AddDomainResult> => {
  const parsed = domainSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid" };
  }
  if (isPublicMailDomain(parsed.data)) {
    return { ok: false, reason: "public" };
  }
  const domains = await getAllowedDomains(orgId);
  if (domains.includes(parsed.data)) {
    return { ok: false, reason: "listed" };
  }
  await mergeOrgSettings(orgId, {
    access: { domains: [...domains, parsed.data] },
  });
  return { ok: true };
};

/** Takes a domain off the list; whoever signed in with it stays in, and a new one of its people no longer gets in. */
export const removeAllowedDomain = async (orgId: string, domain: string) => {
  const domains = await getAllowedDomains(orgId);
  await mergeOrgSettings(orgId, {
    access: { domains: domains.filter((d) => d !== domain) },
  });
};

/** Whether someone with this address may make an account by signing in: its domain is listed, and the mail works. */
export const canSignUp = async (email: string) => {
  const domain = domainOf(email);
  if (!domain) {
    return false;
  }
  const orgId = await installOrganizationId();
  if (!orgId) {
    return false;
  }
  const [domains, mail] = await Promise.all([
    getAllowedDomains(orgId),
    isMailConfigured(),
  ]);
  return mail && domains.includes(domain);
};

/**
 * Whether a sign-in code may go to this address: it is someone's in the install and their account is not turned off,
 * or it is someone who may make an account. A turned-off account is not made again by its domain.
 */
export const mayReceiveSignInCode = async (email: string) => {
  const found = await findUserByEmail(email);
  return found ? !found.disabledAt : canSignUp(email);
};
