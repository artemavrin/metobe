import "server-only";
import {
  activeUserCount,
  firstRunAt,
  usageBuckets,
  usageLabels,
} from "@metobe/core/usage";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { getPrefs } from "@/lib/prefs";
import { currenciesOf } from "@/lib/usage-agg";
import { nowIn, periodOf, readPeriod } from "@/lib/usage-period";

import type { UsageScope } from "./usage-context";
import { UsageDashboard } from "./usage-dashboard";

// «Расходы» on the server: the period from the URL in the viewer's zone and week, the buckets of it and of the stretch
// before, the names behind them. `me` — only the viewer's runs; `team` — everyone's, for an admin's section.

export type UsageSearch = Promise<{
  p?: string;
  d?: string;
  from?: string;
  to?: string;
}>;

export const UsageScreen = async ({
  scope,
  userId,
  searchParams,
}: {
  scope: UsageScope;
  /** Whose runs: the viewer's for `me`; none for `team`. */
  userId?: string;
  searchParams: UsageSearch;
}) => {
  const [prefs, q, t] = await Promise.all([
    getPrefs(),
    searchParams,
    getTranslations("usage"),
  ]);
  const { timeZone, weekStart } = prefs;
  const { today, hour } = nowIn(timeZone);
  const period = periodOf(readPeriod(q, today), today, weekStart, hour);
  const [rows, before, firstAt, teamSize] = await Promise.all([
    usageBuckets({
      from: period.from,
      hourly: period.hourly,
      timeZone,
      to: period.to,
      userId,
    }),
    usageBuckets({
      from: period.prev.from,
      hourly: period.hourly,
      timeZone,
      to: period.prev.to,
      userId,
    }),
    firstRunAt(userId),
    scope === "team" ? activeUserCount() : 0,
  ]);
  // Today so far against yesterday up to the same hour, not the whole of it.
  const prevRows =
    period.prevUntilHour === null
      ? before
      : before.filter(
          (b) => Number(b.at.slice(11)) <= (period.prevUntilHour ?? 23)
        );
  const labels = await usageLabels([...rows, ...prevRows]);
  return (
    <SettingsPageFrame>
      <SettingsHeader
        description={t(scope === "team" ? "teamDescription" : "description")}
        title={t(scope === "team" ? "teamTitle" : "title")}
      />
      <UsageDashboard
        data={{
          first: firstAt ? nowIn(timeZone, firstAt).today : null,
          labels,
          period,
          present: currenciesOf(rows),
          prevRows,
          rows,
          scope,
          teamSize,
          today,
          weekStart,
        }}
      />
    </SettingsPageFrame>
  );
};
