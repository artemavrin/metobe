"use client";

import type { Currency } from "@metobe/contracts/models";
import type { UsageBucket } from "@metobe/core/usage";
import { useFormatter, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import { GONE, matches } from "@/lib/usage-agg";
import type { Filter, Group, Metric } from "@/lib/usage-agg";
import { periodQuery } from "@/lib/usage-period";
import type { Period, PeriodParams } from "@/lib/usage-period";

// What every piece of «Расходы» reads: the period and its buckets from the server, what the viewer picked on the page
// (the metric, the currency, the grouping, what it is narrowed to), and the names behind the ids.

export type UsageScope = "me" | "team";

export interface UsageLabels {
  models: Record<string, { title: string; source: string }>;
  people: Record<string, { name: string; email: string }>;
}

export interface UsageData {
  scope: UsageScope;
  period: Period;
  today: string;
  /** The first day with a run: the calendar offers nothing before it. */
  first: string | null;
  /** ISO: 1 Monday, 6 Saturday, 7 Sunday. */
  weekStart: number;
  rows: UsageBucket[];
  prevRows: UsageBucket[];
  labels: UsageLabels;
  /** Accounts that can use the service — the «из N» of the people. */
  teamSize: number;
  /** Currencies the period has, the one with more requests first. */
  present: Currency[];
}

interface Ctx extends UsageData {
  /** The period's rows and the period before's, narrowed by the filter. */
  shown: UsageBucket[];
  shownPrev: UsageBucket[];
  metric: Metric;
  setMetric: (m: Metric) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  group: Group;
  setGroup: (g: Group) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  /** Another period: a new URL, the server's new buckets; the page dims until they come. */
  go: (p: PeriodParams) => void;
  pending: boolean;
}

const UsageCtx = createContext<Ctx | null>(null);

export const UsageProvider = ({
  data,
  children,
}: {
  data: UsageData;
  children: React.ReactNode;
}) => {
  const [metric, setMetric] = useState<Metric>("cost");
  const [chosen, setChosen] = useState<Currency | null>(null);
  const [group, setGroup] = useState<Group>("model");
  const [filter, setFilter] = useState<Filter>({});
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const go = useCallback(
    (p: PeriodParams) =>
      startTransition(() =>
        router.push(`${pathname}${periodQuery(p)}`, { scroll: false })
      ),
    [router, pathname]
  );
  const value = useMemo(
    () => ({
      ...data,
      // A currency the new period has none of falls back to its main one.
      currency:
        chosen && data.present.includes(chosen)
          ? chosen
          : (data.present[0] ?? "USD"),
      filter,
      go,
      group,
      metric,
      pending,
      setCurrency: setChosen,
      setFilter,
      setGroup,
      setMetric,
      shown: data.rows.filter((b) => matches(b, filter)),
      shownPrev: data.prevRows.filter((b) => matches(b, filter)),
    }),
    [data, chosen, filter, go, group, metric, pending]
  );
  return <UsageCtx value={value}>{children}</UsageCtx>;
};

export const useUsage = () => {
  const ctx = use(UsageCtx);
  if (!ctx) {
    throw new Error("useUsage outside UsageProvider");
  }
  return ctx;
};

/** A phone: the tiles lose their sparklines, the rankings become tabs, the chart its legend. */
export const useNarrow = () => {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return narrow;
};

const utc = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`);

/** Numbers, money and days in the viewer's language. Days are local keys, so they are read as UTC. */
export const useUsageFormat = () => {
  const format = useFormatter();
  const money = (v: number, c: Currency) =>
    // A cent's fraction (a cheap model's request): two significant digits, not «0,00».
    v > 0 && v < 0.01
      ? format.number(v, {
          currency: c,
          maximumSignificantDigits: 2,
          style: "currency",
        })
      : format.number(v, {
          currency: c,
          maximumFractionDigits: v >= 1000 ? 0 : 2,
          minimumFractionDigits: v >= 1000 ? 0 : 2,
          style: "currency",
        });
  const compact = (v: number) =>
    format.number(v, { maximumFractionDigits: 1, notation: "compact" });
  const whole = (v: number) => format.number(Math.round(v));
  const share = (v: number) =>
    format.number(v, { maximumFractionDigits: 1, style: "percent" });
  const value = (metric: Metric, v: number, c: Currency) => {
    if (metric === "cost") {
      return money(v, c);
    }
    return metric === "tokens" ? compact(v) : whole(v);
  };
  const day = (d: string, long = false) =>
    format.dateTime(utc(d), {
      day: "numeric",
      month: long ? "long" : "short",
      timeZone: "UTC",
    });
  const range = (from: string, to: string, long = false) =>
    from === to
      ? day(from, long)
      : format.dateTimeRange(utc(from), utc(to), {
          day: "numeric",
          month: long ? "long" : "short",
          timeZone: "UTC",
        });
  const month = (d: string) =>
    format
      .dateTime(utc(d), { month: "long", timeZone: "UTC", year: "numeric" })
      .replace(" г.", "");
  /** A bucket on the axis: «3 окт», or «09:00» for an hour of a single day. */
  const bucket = (b: string) =>
    b.includes("T") ? `${b.slice(11)}:00` : day(b);
  /** A bucket in the tooltip: «3 окт, пт», or «09:00–10:00». */
  const tip = (b: string) =>
    b.includes("T")
      ? `${b.slice(11)}:00–${String(Number(b.slice(11)) + 1).padStart(2, "0")}:00`
      : format.dateTime(utc(b), {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
          weekday: "short",
        });
  return {
    bucket,
    compact,
    day,
    money,
    month,
    range,
    share,
    tip,
    value,
    whole,
  };
};

/** An entry's name and the line under it: a model and its source, a person and their email, a purpose. */
export const useLabel = () => {
  const { labels } = useUsage();
  const t = useTranslations("usage");
  const label = (group: Group, key: string) => {
    if (group === "model") {
      return labels.models[key]?.title ?? t("removedModel");
    }
    if (group === "person") {
      return labels.people[key]?.name ?? t("removedPerson");
    }
    return t(`purposes.${key as "chat" | "title" | "describe"}`);
  };
  const note = (group: Group, key: string) => {
    if (group === "model") {
      return labels.models[key]?.source ?? "";
    }
    if (group === "person") {
      return key === GONE
        ? t("removedNote")
        : (labels.people[key]?.email ?? "");
    }
    return "";
  };
  return { label, note };
};
