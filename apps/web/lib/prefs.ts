import "server-only";
import { COOKIE, COOKIE_OPTIONS } from "@metobe/i18n/config";
import { resolvePrefs } from "@metobe/i18n/prefs";
import { cookies, headers } from "next/headers";
import { cache } from "react";

/** Regional preferences of this request (cookie → Accept-Language → defaults), read once per request. */
export const getPrefs = cache(async () => {
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  return resolvePrefs(
    (name) => store.get(name)?.value,
    requestHeaders.get("accept-language")
  );
});

interface ProfilePrefs {
  locale?: string | null;
  timeZone?: string | null;
  weekStart?: number | null;
  dateFormat?: string | null;
}

/**
 * Copies a profile's choices into cookies (on sign-in and after saving). A value left «automatic» is removed,
 * except the language: a choice made on the sign-in page stays until the profile has its own.
 */
export const writePrefsCookies = async (p: ProfilePrefs) => {
  const store = await cookies();
  const put = (name: string, value: string | number | null | undefined) =>
    value === null || value === undefined
      ? store.delete(name)
      : store.set(name, String(value), COOKIE_OPTIONS);
  if (p.locale) {
    store.set(COOKIE.locale, p.locale, COOKIE_OPTIONS);
  }
  put(COOKIE.weekStart, p.weekStart);
  put(COOKIE.dateFormat, p.dateFormat);
  if (p.timeZone) {
    store.set(COOKIE.timeZone, p.timeZone, COOKIE_OPTIONS);
    store.set(COOKIE.timeZoneManual, "1", COOKIE_OPTIONS);
  } else {
    store.delete(COOKIE.timeZoneManual);
  }
};
