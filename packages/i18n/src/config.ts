// Languages and the cookies that carry a user's regional preferences between requests.
export const locales = ["en", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (locales as readonly string[]).includes(value);

/** Native names: a language is always offered in its own language. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
};

// Cookies are a per-request copy of the profile (the DB is the source of truth). A missing cookie means «automatic».
export const COOKIE = {
  dateFormat: "date_format",
  locale: "locale",
  /** Effective time zone; the browser writes it while the user keeps the automatic one. */
  timeZone: "tz",
  /** Present when the user picked a time zone by hand, so the browser must not overwrite `tz`. */
  timeZoneManual: "tz_manual",
  weekStart: "week_start",
} as const;

export const COOKIE_OPTIONS = {
  httpOnly: false,
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
  sameSite: "lax",
} as const;
