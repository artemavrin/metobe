import { z } from "zod";

// Who may sign in by themselves (D17): the admin lists email domains, and anyone with an address on one gets in by
// the code from the mail — an account made at the first sign-in, with the role «user». The rules for a domain.

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const DOMAIN = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`, "u");

/** A domain as the admin types it — spaces, capitals and a leading @ forgiven; a name with a dot, nothing else. */
export const domainSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase().replace(/^@/u, ""))
  .pipe(z.string().max(253).regex(DOMAIN, "domain"));

/** Services where anyone can make an address: a list with one of them lets the whole world in. */
const PUBLIC_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yandex.ru",
  "yandex.com",
  "ya.ru",
  "mail.ru",
  "inbox.ru",
  "list.ru",
  "bk.ru",
  "rambler.ru",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
]);

export const isPublicMailDomain = (domain: string) => PUBLIC_MAIL.has(domain);

/** What follows the last @ of an address, in lower case; null when it is not an address. */
export const domainOf = (email: string) => {
  const at = email.lastIndexOf("@");
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return at > 0 && domain ? domain : null;
};

// What people may connect by themselves (ARCH §17.1, D-catalog): their own connections outside the admin's catalog —
// today their own mailboxes. `public_only` — only addresses on the internet, so nobody reaches the inner network
// through the server; `on` — internal addresses too; `off` — none.

export const personalModes = ["off", "public_only", "on"] as const;
export type PersonalMode = (typeof personalModes)[number];
export const DEFAULT_PERSONAL_MODE: PersonalMode = "public_only";

/** «Ask first?» an admin sets as the default for a tool of people's own connections; each person may change it. */
export const personalApprovals = ["ask", "auto"] as const;
export type PersonalApproval = (typeof personalApprovals)[number];
