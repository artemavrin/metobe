import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

import { defaultLocale, locales } from "./config";
import type { Locale } from "./config";

/** The best supported language for an Accept-Language header (the recipe from the Next.js i18n guide). */
export const localeFromAcceptLanguage = (
  header: string | null | undefined
): Locale => {
  if (!header) {
    return defaultLocale;
  }
  const languages = new Negotiator({
    headers: { "accept-language": header },
  }).languages();
  try {
    return match(languages, locales, defaultLocale) as Locale;
  } catch {
    // `match` throws on malformed tags such as "*".
    return defaultLocale;
  }
};
