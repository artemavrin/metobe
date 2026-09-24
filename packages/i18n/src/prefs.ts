import { COOKIE, isLocale } from "./config";
import type { Locale } from "./config";
import { localeFromAcceptLanguage } from "./negotiate";

export const dateFormats = ["auto", "dmy", "mdy", "ymd"] as const;
export type DateFormat = (typeof dateFormats)[number];
export const isDateFormat = (value: unknown): value is DateFormat =>
  typeof value === "string" &&
  (dateFormats as readonly string[]).includes(value);

/** ISO weekday: 1 Monday, 6 Saturday, 7 Sunday. */
export const weekStarts = [1, 6, 7] as const;
export type WeekStart = (typeof weekStarts)[number];
export const isWeekStart = (value: unknown): value is WeekStart =>
  (weekStarts as readonly number[]).includes(Number(value));

export const isTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || !value) {
    return false;
  }
  try {
    // Throws RangeError for an unknown zone.
    return Boolean(new Intl.DateTimeFormat("en", { timeZone: value }));
  } catch {
    return false;
  }
};

const WEEK_START_BY_LOCALE: Record<Locale, WeekStart> = { en: 7, ru: 1 };
/** The language's own first day of the week (CLDR); used while the user keeps «automatic». */
export const defaultWeekStart = (locale: Locale): WeekStart =>
  WEEK_START_BY_LOCALE[locale];

export interface Prefs {
  locale: Locale;
  timeZone: string;
  weekStart: WeekStart;
  dateFormat: DateFormat;
  /** What the user chose explicitly; null — automatic. Settings screens show these. */
  chosen: {
    weekStart: WeekStart | null;
    dateFormat: DateFormat | null;
    timeZone: string | null;
  };
}

/**
 * Regional preferences of the current request: cookie first, then the browser (Accept-Language), then defaults.
 * `cookie` is any getter, so this works with next/headers, a Request, or a test.
 */
export const resolvePrefs = (
  cookie: (name: string) => string | undefined,
  acceptLanguage: string | null | undefined
): Prefs => {
  const localeCookie = cookie(COOKIE.locale);
  const locale = isLocale(localeCookie)
    ? localeCookie
    : localeFromAcceptLanguage(acceptLanguage);
  const tz = cookie(COOKIE.timeZone);
  const week = cookie(COOKIE.weekStart);
  const date = cookie(COOKIE.dateFormat);
  const chosen = {
    dateFormat: isDateFormat(date) ? date : null,
    timeZone: cookie(COOKIE.timeZoneManual) && isTimeZone(tz) ? tz : null,
    weekStart: isWeekStart(week) ? (Number(week) as WeekStart) : null,
  };
  return {
    chosen,
    dateFormat: chosen.dateFormat ?? "auto",
    locale,
    timeZone: isTimeZone(tz) ? tz : "UTC",
    weekStart: chosen.weekStart ?? defaultWeekStart(locale),
  };
};
