"use client";

import type { Currency } from "@metobe/contracts/models";
import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { rank, series, totalsOf } from "@/lib/usage-agg";
import type { Group, Metric, Totals } from "@/lib/usage-agg";
import { shiftDay } from "@/lib/usage-period";

import {
  UsageProvider,
  useNarrow,
  useUsage,
  useUsageFormat,
} from "./usage-context";
import type { UsageData } from "./usage-context";
import {
  Delta,
  EmptyUsage,
  FilterChips,
  GroupSwitch,
  RankRow,
  Segmented,
  Spark,
  StackedChart,
  UnpricedNote,
  useDrill,
} from "./usage-parts";
import { PeriodBar } from "./usage-period-bar";

// «Расходы» — «Обзор» of the prototype (/dev/prototypes/usage?v=2), after OpenRouter's Activity: four numbers on top,
// each with its buckets and its change against the same stretch before; a tile is also the switch of what the chart
// shows. Below — the buckets stacked by models (people, purpose), then two rankings side by side. A click on a ranking's
// row narrows the whole page to it. Breakpoints are the page's width (container queries), not the window's.

const Tile = ({
  label,
  value,
  sub,
  now,
  prev,
  spark,
  active,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  now: number;
  prev: number;
  spark: number[];
  active?: boolean;
  onClick?: () => void;
}) => {
  const Tag = onClick ? "button" : "div";
  // A phone: no sparkline — the four would repeat the chart below, and the tiles would take the whole first screen.
  const narrow = useNarrow();
  return (
    <Tag
      aria-pressed={onClick ? active : undefined}
      className={cn(
        "bg-card flex min-w-0 flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-[box-shadow,border-color] @xl:gap-1 @xl:p-4",
        onClick && "hover:border-foreground/20 cursor-pointer",
        active &&
          "border-foreground/30 ring-foreground/10 ring-2 @max-xl:ring-1"
      )}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        {label}
        <Delta now={now} prev={prev} />
      </span>
      <span className="truncate text-lg font-semibold tracking-tight tabular-nums @xl:text-xl">
        {value}
      </span>
      {!narrow && <Spark bars className="h-7 w-full" values={spark} />}
      {sub && (
        <span className="text-muted-foreground truncate text-xs">{sub}</span>
      )}
    </Tag>
  );
};

const Ranking = ({
  group,
  title,
  tabs,
}: {
  group: Group;
  title?: string;
  tabs?: React.ReactNode;
}) => {
  const { shown, shownPrev, period, metric, currency, filter } = useUsage();
  const t = useTranslations("usage");
  const narrow = useNarrow();
  const drill = useDrill();
  const [all, setAll] = useState(false);
  const list = rank(shown, shownPrev, period.buckets, group, metric, currency);
  const visible = all ? list : list.slice(0, 6);
  return (
    <section className="@container flex min-w-0 flex-col gap-1 rounded-xl border p-2">
      {tabs ?? (
        <h2 className="px-2 pt-1 pb-1 text-sm font-semibold">{title}</h2>
      )}
      {visible.map((e, i) => (
        <RankRow
          active={filter[group] === e.key}
          dense={narrow}
          e={e}
          group={group}
          i={i}
          key={e.key}
          onClick={() => drill(group, e.key)}
          spark={!narrow}
        />
      ))}
      {list.length > 6 && (
        <Button
          className="self-start"
          onClick={() => setAll(!all)}
          size="sm"
          variant="ghost"
        >
          {all ? t("less") : t("more", { count: list.length - 6 })}
        </Button>
      )}
    </section>
  );
};

/** Two rankings side by side; on a phone — one card, the two as its tabs: two long lists one under the other bury the second. */
const Rankings = () => {
  const { scope } = useUsage();
  const t = useTranslations("usage.groups");
  const narrow = useNarrow();
  const second: Group = scope === "team" ? "person" : "purpose";
  const [tab, setTab] = useState<Group>("model");
  if (narrow) {
    return (
      <Ranking
        group={tab}
        key={tab}
        tabs={
          <div className="px-1 pt-1 pb-1">
            <Segmented
              items={[
                ["model", t("model")],
                [second, t(second)],
              ]}
              onChange={setTab}
              size="sm"
              value={tab}
            />
          </div>
        }
      />
    );
  }
  return (
    <div className="grid gap-3 @2xl:grid-cols-2">
      <Ranking group="model" title={t("model")} />
      <Ranking group={second} title={t(second)} />
    </div>
  );
};

const tokens = (x: Totals) => x.input + x.output + x.cacheRead;

/** «Изменения — к 1–29 сентября»: what the percentages compare with. */
const useAgainst = () => {
  const { period, today } = useUsage();
  const t = useTranslations("usage.against");
  const f = useUsageFormat();
  if (period.prevUntilHour !== null) {
    return t("yesterdayUntil", {
      time: `${String(period.prevUntilHour + 1).padStart(2, "0")}:00`,
    });
  }
  if (period.span === "day" && period.prev.from === shiftDay(today, -1)) {
    return t("yesterday");
  }
  if (period.span === "week" && period.end === period.to) {
    return t("lastWeek");
  }
  return t("other", {
    period: f.range(period.prev.from, period.prev.to, true),
  });
};

const Tiles = ({ now, prev }: { now: Totals; prev: Totals }) => {
  const {
    shown,
    period,
    metric,
    setMetric,
    setCurrency,
    present,
    scope,
    teamSize,
  } = useUsage();
  const t = useTranslations("usage");
  const f = useUsageFormat();
  const against = useAgainst();
  const [main = "USD", second] = present;
  const buckets = (m: Metric) => series(shown, period.buckets, m, main);
  const average = (x: Totals) =>
    (x.cost.get(main) ?? 0) / Math.max(x.requests - x.unpriced, 1);
  return (
    <div className="grid grid-cols-2 gap-2 @xl:gap-3 @3xl:grid-cols-4">
      <Tile
        active={metric === "cost"}
        label={t("money")}
        now={now.cost.get(main) ?? 0}
        onClick={() => {
          setMetric("cost");
          setCurrency(main);
        }}
        prev={prev.cost.get(main) ?? 0}
        spark={buckets("cost")}
        sub={
          second
            ? t("andMoney", {
                amount: f.money(now.cost.get(second) ?? 0, second),
              })
            : undefined
        }
        value={f.money(now.cost.get(main) ?? 0, main)}
      />
      <Tile
        active={metric === "requests"}
        label={t("requests")}
        now={now.requests}
        onClick={() => setMetric("requests")}
        prev={prev.requests}
        spark={buckets("requests")}
        sub={t("errors", {
          share: f.share(now.errors / Math.max(now.requests, 1)),
        })}
        value={f.whole(now.requests)}
      />
      <Tile
        active={metric === "tokens"}
        label={t("tokens")}
        now={tokens(now)}
        onClick={() => setMetric("tokens")}
        prev={tokens(prev)}
        spark={buckets("tokens")}
        sub={t("cached", {
          share: f.share(
            now.cacheRead / Math.max(now.input + now.cacheRead, 1)
          ),
        })}
        value={f.compact(tokens(now))}
      />
      {scope === "team" ? (
        <Tile
          label={t("people")}
          now={now.people.size}
          prev={prev.people.size}
          spark={buckets("requests")}
          sub={t("perPerson", {
            count: f.whole(now.requests / Math.max(now.people.size, 1)),
          })}
          value={t("peopleOf", { count: now.people.size, total: teamSize })}
        />
      ) : (
        <Tile
          label={t("average")}
          now={average(now)}
          prev={average(prev)}
          spark={buckets("cost")}
          sub={t("priced")}
          value={f.money(average(now), main)}
        />
      )}
      {/* The comparison's stretch under the tiles, where the percentages are. */}
      <span className="text-muted-foreground col-span-2 -mt-0.5 text-xs @3xl:col-span-4">
        {t("changes", { against })}
      </span>
    </div>
  );
};

const Overview = () => {
  const {
    rows,
    shown,
    shownPrev,
    period,
    metric,
    currency,
    setCurrency,
    present,
    pending,
  } = useUsage();
  const t = useTranslations("usage");
  const narrow = useNarrow();
  const now = totalsOf(shown);
  const prev = totalsOf(shownPrev);
  return (
    <div className="@container flex flex-col gap-6 md:gap-8">
      <PeriodBar />
      <FilterChips />
      {rows.length === 0 ? (
        <EmptyUsage />
      ) : (
        <div
          aria-busy={pending}
          className={cn(
            "flex flex-col gap-6 transition-opacity duration-150 md:gap-8",
            pending && "opacity-60"
          )}
        >
          <Tiles now={now} prev={prev} />
          <section className="-mx-1 flex min-w-0 flex-col gap-3 @xl:mx-0 @xl:rounded-xl @xl:border @xl:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 @max-xl:px-1">
              {/* A phone: the grouping is the card's title — one row less. */}
              {narrow ? (
                <GroupSwitch size="sm" />
              ) : (
                <h2 className="text-sm font-semibold">
                  {period.hourly ? t("byHour") : t("byDay")}
                </h2>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {metric === "cost" && present.length > 1 && (
                  <Segmented
                    items={present.map(
                      (c) => [c, c === "USD" ? "$" : "₽"] as [Currency, string]
                    )}
                    onChange={setCurrency}
                    size="sm"
                    value={currency}
                  />
                )}
                {!narrow && <GroupSwitch size="sm" />}
              </div>
            </div>
            <StackedChart height={narrow ? "h-52" : "h-64"} />
          </section>
          <Rankings />
          <UnpricedNote totals={now} />
        </div>
      )}
    </div>
  );
};

export const UsageDashboard = ({ data }: { data: UsageData }) => (
  <UsageProvider data={data}>
    <Overview />
  </UsageProvider>
);
