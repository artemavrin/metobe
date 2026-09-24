import "server-only";
import { defaultLocale, isLocale } from "@metobe/i18n/config";
import type { Locale } from "@metobe/i18n/config";
import { getTranslator } from "@metobe/i18n/translator";
import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";

import { buildAuthOptions } from "./auth-options";
import { getDb } from "./db";
import { buildLoginLink } from "./login-link";
import { sendMail } from "./mail";
import { findUserByEmail } from "./users";

/** The sign-in email in the recipient's language: their profile's choice, else the language they asked in. */
export const sendSignInCode = async (
  email: string,
  code: string,
  fallback: Locale = defaultLocale
) => {
  const recipient = await findUserByEmail(email);
  const t = await getTranslator(
    isLocale(recipient?.locale) ? recipient.locale : fallback
  );
  const link = buildLoginLink(email, code);
  await sendMail({
    html: `<p>${t("email.signIn.intro")}</p><p><a href="${link}">${t("email.signIn.button")}</a></p><p>${t("email.signIn.code", { code: `<b>${code}</b>` })}</p><p>${t("email.signIn.ttl")}</p>`,
    subject: t("email.signIn.subject", { code }),
    text: `${t("email.signIn.intro")} ${link}\n\n${t("email.signIn.code", { code })}\n\n${t("email.signIn.ttl")}`,
    to: email,
  });
};

export const createAuth = (plugins: BetterAuthPlugin[] = []) =>
  betterAuth(
    buildAuthOptions({
      db: getDb().db,
      plugins,
      sendSignInCode: (email, code) => sendSignInCode(email, code),
    })
  );

export type Auth = ReturnType<typeof createAuth>;
