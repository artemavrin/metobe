import { createTranslator } from "use-intl/core";

import { defaultLocale, isLocale } from "./config";
import type { Locale } from "./config";
import { loadMessages } from "./messages";

/** Translations outside React and Next (emails, CLI, worker): `use-intl/core` works in plain Node. */
export const getTranslator = async (locale: Locale) =>
  createTranslator({ locale, messages: await loadMessages(locale) });

/** A language from a POSIX locale such as `ru_RU.UTF-8` — for the CLI inside the container. */
export const localeFromEnv = (lang: string | undefined): Locale => {
  const code = lang?.slice(0, 2);
  return isLocale(code) ? code : defaultLocale;
};
