"use client";

import { formatNumericDate } from "@metobe/i18n/dates";
import type { DateFormat, WeekStart } from "@metobe/i18n/prefs";
import { useLocale, useTimeZone } from "next-intl";
import { createContext, useContext, useEffect } from "react";
import type { ReactNode } from "react";

import { reportTimeZone } from "@/lib/prefs-actions";

interface Region {
  weekStart: WeekStart;
  dateFormat: DateFormat;
}
const RegionContext = createContext<Region>({
  dateFormat: "auto",
  weekStart: 7,
});

/** First day of the week and date format for client components; language and zone come from next-intl. */
export const RegionProvider = ({
  value,
  children,
}: {
  value: Region;
  children: ReactNode;
}) => <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;

export const useRegion = () => {
  const region = useContext(RegionContext);
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "UTC";
  return {
    ...region,
    formatNumericDate: (date: Date | number) =>
      formatNumericDate(date, {
        dateFormat: region.dateFormat,
        locale,
        timeZone,
      }),
  };
};

/**
 * While the user keeps the automatic time zone, the browser tells the server its zone once (a cookie), and the page
 * re-renders on the server in that zone. A zone picked by hand is never overwritten.
 */
export const TimeZoneSync = ({
  manual,
  current,
}: {
  manual: boolean;
  current: string;
}) => {
  useEffect(() => {
    if (manual) {
      return;
    }
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || zone === current) {
      return;
    }
    // A server action sets the cookie, and setting a cookie re-renders the page in the new zone.
    void reportTimeZone(zone);
  }, [manual, current]);
  return null;
};
