import "server-only";
import {
  domainOf,
  domainSchema,
  isPublicMailDomain,
} from "@metobe/contracts/access";
import { z } from "zod";

import { isMailConfigured } from "./mail";
import { mergePolicies, readPolicies } from "./policies";
import { findUserByEmail } from "./users";

// Who may sign in by themselves (D17), in system_settings.policies.access: the email domains whose people get in by
// the code from the mail, with an account made at the first sign-in. Nothing opens without the service's mail —
// there would be no code to send — and a person already in the install needs no domain.

const domainsSchema = z.array(domainSchema);

/** The listed domains, by name. */
export const getAllowedDomains = async (): Promise<string[]> => {
  const { access } = await readPolicies();
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
  input: string
): Promise<AddDomainResult> => {
  const parsed = domainSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid" };
  }
  if (isPublicMailDomain(parsed.data)) {
    return { ok: false, reason: "public" };
  }
  const domains = await getAllowedDomains();
  if (domains.includes(parsed.data)) {
    return { ok: false, reason: "listed" };
  }
  await mergePolicies({ access: { domains: [...domains, parsed.data] } });
  return { ok: true };
};

/** Takes a domain off the list; whoever signed in with it stays in, and a new one of its people no longer gets in. */
export const removeAllowedDomain = async (domain: string) => {
  const domains = await getAllowedDomains();
  await mergePolicies({
    access: { domains: domains.filter((d) => d !== domain) },
  });
};

/** Whether someone with this address may make an account by signing in: its domain is listed, and the mail works. */
export const canSignUp = async (email: string) => {
  const domain = domainOf(email);
  if (!domain) {
    return false;
  }
  const [domains, mail] = await Promise.all([
    getAllowedDomains(),
    isMailConfigured(),
  ]);
  return mail && domains.includes(domain);
};

/** Whether a sign-in code may go to this address: it is someone's in the install, or someone who may make an account. */
export const mayReceiveSignInCode = async (email: string) =>
  Boolean(await findUserByEmail(email)) || (await canSignUp(email));
