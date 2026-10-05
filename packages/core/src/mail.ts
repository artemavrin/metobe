import "server-only";
import { mailPresetIds, mailServerSchema } from "@metobe/contracts/email";
import type { MailServer, ServiceMailInput } from "@metobe/contracts/email";
import { z } from "zod";

import { mailProxyFor } from "./net";
import { mergePolicies, readPolicies } from "./policies";
import { removeSecrets, setSecret, withSecret } from "./secrets";
import { parseSmtpEnv, problemOf, smtpTransport } from "./smtp";
import type { Credentials, MailProblem } from "./smtp";

// The service's own mail (D15): one box the sign-in codes and invitations go from — the service's, not anyone's own,
// so signing in never hangs on one person's password. Set in /settings/mail and checked before it is kept: the
// password in `secrets`, the rest in system_settings.policies.mail (null there — the admin turned it off). The admin
// names the server, so one inside the network is fine (ARCH §18.4); it is reached through a proxy when routed so.

const OWNER = { id: "mail", type: "system" } as const;
const DEFAULT_NAME = "Metobe";

/** What the last check or letter found. */
export type MailCheck = { checkedAt: string } & (
  | { ok: true }
  | { ok: false; problem: MailProblem; detail: string }
);

const checkSchema = z.union([
  z.object({ checkedAt: z.string(), ok: z.literal(true) }),
  z.object({
    checkedAt: z.string(),
    detail: z.string(),
    ok: z.literal(false),
    problem: z.enum(["auth", "unreachable", "tls", "private"]),
  }),
]);

const mailSchema = z.object({
  // Checked when the form sent it; read as it is, so an install's `no-reply@localhost` still sends.
  address: z.string().min(1),
  name: z.string(),
  preset: z.enum(mailPresetIds),
  smtp: mailServerSchema,
  /** null — the server lets the service in without a login. */
  username: z.string().nullable(),
});
export type ServiceMail = z.infer<typeof mailSchema> & {
  check: MailCheck | null;
};

export type MailResult =
  | { ok: true }
  | { ok: false; problem: MailProblem; detail: string };

const failure = (error: unknown) => ({
  detail: (error as Error).message ?? String(error),
  ok: false as const,
  problem: problemOf(error),
});

/** Replaces the mail part of the policies; null — the admin turned the mail off. */
const writeMail = (mail: ServiceMail | null) => mergePolicies({ mail });

/** The service's mail as kept; null — there is none. */
export const getServiceMail = async (): Promise<ServiceMail | null> => {
  const { mail } = await readPolicies();
  const parsed = mailSchema.safeParse(mail);
  if (!parsed.success) {
    return null;
  }
  // A check a hand edit broke is as if there were none; the mail still sends.
  const check = checkSchema.safeParse((mail as { check?: unknown }).check);
  return { ...parsed.data, check: check.success ? check.data : null };
};

/** Whether the service can send letters: sign-in by a code, changing the email. */
export const isMailConfigured = async () => (await getServiceMail()) !== null;

const transportOf = async (smtp: MailServer, auth: Credentials | null) => {
  const proxy = await mailProxyFor(smtp.host);
  return smtpTransport(smtp, auth, {
    host: smtp.host,
    ...(proxy ? { proxy } : {}),
    servername: smtp.host,
  });
};

const verify = async (smtp: MailServer, auth: Credentials | null) => {
  const transport = await transportOf(smtp, auth);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
};

const authOf = async (mail: ServiceMail) => {
  if (!mail.username) {
    return null;
  }
  const password = await withSecret(OWNER, "password", (v) => v);
  if (password === null) {
    throw new Error(
      "the password of the service's mail is missing — set the mail again in the settings"
    );
  }
  return { password, username: mail.username };
};

const now = () => new Date().toISOString();

/** Checks that the server takes the login, then keeps it all; nothing is kept that the server did not take. */
export const saveServiceMail = async (
  input: ServiceMailInput
): Promise<MailResult> => {
  const auth = input.password
    ? { password: input.password, username: input.username || input.address }
    : null;
  try {
    await verify(input.smtp, auth);
  } catch (error) {
    return failure(error);
  }
  await (auth
    ? setSecret(OWNER, "password", auth.password)
    : removeSecrets(OWNER));
  await writeMail({
    address: input.address.toLowerCase(),
    check: { checkedAt: now(), ok: true },
    name: input.name || DEFAULT_NAME,
    preset: input.preset,
    smtp: input.smtp,
    username: auth?.username ?? null,
  });
  return { ok: true };
};

/** Checks the kept mail again and keeps what it found. */
export const checkServiceMail = async () => {
  const mail = await getServiceMail();
  if (!mail) {
    return null;
  }
  let check: MailCheck;
  try {
    await verify(mail.smtp, await authOf(mail));
    check = { checkedAt: now(), ok: true };
  } catch (error) {
    check = { checkedAt: now(), ...failure(error) };
  }
  await writeMail({ ...mail, check });
  return check;
};

/** Who the letters are from, by name; empty — Metobe. */
export const setSenderName = async (name: string) => {
  const mail = await getServiceMail();
  if (mail) {
    await writeMail({ ...mail, name: name.trim() || DEFAULT_NAME });
  }
};

/** No service mail any more: sign-in by a code stops, and the install's SMTP_URL does not bring it back. */
export const turnOffServiceMail = async () => {
  await writeMail(null);
  await removeSecrets(OWNER);
};

interface Letter {
  html: string;
  subject: string;
  text: string;
  to: string;
}

/**
 * Sends a letter from the service's mail. A failure is kept for the settings to show, and thrown; a letter that went
 * after one clears it.
 */
export const sendMail = async (letter: Letter) => {
  const mail = await getServiceMail();
  if (!mail) {
    throw new Error("the service's mail is not set up");
  }
  const transport = await transportOf(mail.smtp, await authOf(mail));
  try {
    await transport.sendMail({
      ...letter,
      from: { address: mail.address, name: mail.name },
    });
  } catch (error) {
    await writeMail({
      ...mail,
      check: { checkedAt: now(), ...failure(error) },
    });
    throw error;
  } finally {
    transport.close();
  }
  if (!mail.check?.ok) {
    await writeMail({ ...mail, check: { checkedAt: now(), ok: true } });
  }
};

/** A letter that shows the mail works end to end; what went wrong, as the form says it. */
export const sendTestLetter = async (letter: Letter): Promise<MailResult> => {
  try {
    await sendMail(letter);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
};

/**
 * First start: an install-time SMTP_URL / SMTP_FROM becomes the service's mail, as it was — the admin checks it in
 * the settings. Does nothing once the mail was ever set, or turned off.
 */
export const importEnvMail = async (env: NodeJS.ProcessEnv = process.env) => {
  if (!env.SMTP_URL || "mail" in (await readPolicies())) {
    return null;
  }
  const { password, username, ...mail } = parseSmtpEnv(
    env.SMTP_URL,
    env.SMTP_FROM
  );
  if (password) {
    await setSecret(OWNER, "password", password);
  }
  await writeMail({
    ...mail,
    check: null,
    username: password ? username : null,
  });
  return { address: mail.address, host: mail.smtp.host };
};
