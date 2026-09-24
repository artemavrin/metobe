"use server";

import { updateUserPrefs } from "@metobe/core/users";
import { COOKIE, COOKIE_OPTIONS, isLocale } from "@metobe/i18n/config";
import { isDateFormat, isTimeZone, isWeekStart } from "@metobe/i18n/prefs";
import { cookies, headers } from "next/headers";

import { getAuth } from "@/lib/auth";
import { writePrefsCookies } from "@/lib/prefs";

/** The language picker on public pages: a cookie, plus the profile when someone is signed in. */
export const setLocale = async (locale: string) => {
  if (!isLocale(locale)) {
    return;
  }
  const store = await cookies();
  store.set(COOKIE.locale, locale, COOKIE_OPTIONS);
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session) {
    const u = session.user as {
      locale?: string | null;
      timeZone?: string | null;
      weekStart?: number | null;
      dateFormat?: string | null;
    };
    await updateUserPrefs(session.user.id, {
      dateFormat: u.dateFormat ?? null,
      locale,
      timeZone: u.timeZone ?? null,
      weekStart: u.weekStart ?? null,
    });
  }
};

/** The browser reports its zone while the user keeps «automatic»; a zone picked by hand is never overwritten. */
export const reportTimeZone = async (zone: string) => {
  if (!isTimeZone(zone)) {
    return;
  }
  const store = await cookies();
  if (store.get(COOKIE.timeZoneManual)) {
    return;
  }
  store.set(COOKIE.timeZone, zone, COOKIE_OPTIONS);
};

export interface RegionState {
  saved?: boolean;
}

/** «Язык и регион»: validates, stores in the profile, mirrors into cookies. Setting a cookie re-renders the page. */
export const saveRegion = async (
  _: RegionState,
  form: FormData
): Promise<RegionState> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return {};
  }
  const locale = form.get("locale");
  const timeZone = form.get("timeZone");
  const weekStart = form.get("weekStart");
  const dateFormat = form.get("dateFormat");
  const prefs = {
    dateFormat:
      isDateFormat(dateFormat) && dateFormat !== "auto" ? dateFormat : null,
    locale: isLocale(locale) ? locale : null,
    timeZone: timeZone !== "auto" && isTimeZone(timeZone) ? timeZone : null,
    weekStart:
      weekStart !== "auto" && isWeekStart(weekStart) ? Number(weekStart) : null,
  };
  await updateUserPrefs(session.user.id, prefs);
  await writePrefsCookies(prefs);
  return { saved: true };
};
