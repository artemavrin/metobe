import "server-only";
import { defaultLocale, isLocale } from "@metobe/i18n/config";
import type { Locale } from "@metobe/i18n/config";
import { resolvePrefs } from "@metobe/i18n/prefs";
import { getTranslator } from "@metobe/i18n/translator";
import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";

import { buildAuthOptions } from "./auth-options";
import { getDb } from "./db";
import { buildLoginLink } from "./login-link";
import { sendMail } from "./mail";
import { findUserByEmail } from "./users";

/** The sign-in letter in the recipient's language: their profile's choice, else the language they asked in. */
export const sendSignInCode = async (
  email: string,
  code: string,
  fallback: Locale = defaultLocale
) => {
  const recipient = await findUserByEmail(email);
  const locale = isLocale(recipient?.locale) ? recipient.locale : fallback;
  // Loaded when a letter goes: the CLI imports this module too, and never sends one.
  const [t, { codeLetter }] = await Promise.all([
    getTranslator(locale),
    import("@metobe/emails/code-letter"),
  ]);
  const { html, text } = await codeLetter({
    code,
    heading: t("email.signIn.heading"),
    ignore: t("email.signIn.ignore"),
    link: { href: buildLoginLink(email, code), label: t("email.signIn.link") },
    locale,
    preview: t("email.signIn.use"),
    use: t("email.signIn.use"),
  });
  await sendMail({
    html,
    subject: t("email.signIn.subject", { code }),
    text,
    to: email,
  });
};

/** The language a request speaks: its locale cookie, else its Accept-Language, else the default. */
const localeOf = (request?: Headers | null): Locale => {
  if (!request) {
    return defaultLocale;
  }
  const cookies = request.get("cookie") ?? "";
  return resolvePrefs(
    (name) => new RegExp(`(?:^|;\\s*)${name}=([^;]*)`, "u").exec(cookies)?.[1],
    request.get("accept-language")
  ).locale;
};

/** The code for changing the email, in the recipient's language: from the current address, then from the new one. */
export const sendAccountCode = async (
  email: string,
  code: string,
  step: "current" | "new",
  request?: Headers | null
) => {
  const recipient = await findUserByEmail(email);
  const t = await getTranslator(
    isLocale(recipient?.locale) ? recipient.locale : localeOf(request)
  );
  const key = step === "current" ? "email.changeCurrent" : "email.changeNew";
  await sendMail({
    html: `<p>${t(`${key}.intro`)}</p><p style="font-size:24px;letter-spacing:4px"><b>${code}</b></p><p>${t("email.changeTtl")}</p><p>${t("email.changeIgnore")}</p>`,
    subject: t(`${key}.subject`, { code }),
    text: `${t(`${key}.intro`)}\n\n${code}\n\n${t("email.changeTtl")}\n${t("email.changeIgnore")}`,
    to: email,
  });
};

export const createAuth = (plugins: BetterAuthPlugin[] = []) =>
  betterAuth(
    buildAuthOptions({
      db: getDb().db,
      plugins,
      sendAccountCode,
      sendSignInCode: (email, code) => sendSignInCode(email, code),
    })
  );

export type Auth = ReturnType<typeof createAuth>;
