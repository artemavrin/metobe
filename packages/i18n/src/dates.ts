import type { Locale } from "./config";
import type { DateFormat } from "./prefs";

// Intl has no «order» option, so a numeric date borrows the order of a locale that writes dates that way.
const NUMERIC_LOCALE: Record<
  Exclude<DateFormat, "auto">,
  (locale: Locale) => string
> = {
  dmy: (locale) => (locale === "ru" ? "ru-RU" : "en-GB"),
  mdy: () => "en-US",
  ymd: () => "sv-SE",
};

/** A numeric date (24.09.2026, 09/24/2026, 2026-09-24) in the user's chosen order and time zone. */
export const formatNumericDate = (
  date: Date | number,
  {
    locale,
    timeZone,
    dateFormat,
  }: { locale: Locale; timeZone: string; dateFormat: DateFormat }
) =>
  new Intl.DateTimeFormat(
    dateFormat === "auto" ? locale : NUMERIC_LOCALE[dateFormat](locale),
    {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    }
  ).format(date);
