"use client";

import { Button } from "@metobe/ui/components/button";
import { EChartsBarChart } from "@metobe/ui/components/evilcharts/charts/echarts-bar-chart";
import type { ChartConfig } from "@metobe/ui/components/evilcharts/ui/echarts-chart";
import { Tabs, TabsList, TabsTrigger } from "@metobe/ui/components/tabs";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowDownRight, ArrowUpRight, ChartColumn, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId } from "react";

import { OTHER, stackOf } from "@/lib/usage-agg";
import type { Filter, Group, Ranked, Totals } from "@/lib/usage-agg";

import { useLabel, useNarrow, useUsage, useUsageFormat } from "./usage-context";

// The pieces «Расходы» is built from: the change against the period before, a sparkline, a switch, what the page is
// narrowed to, the stacked chart and a ranking's row. Colors: `--chart-1…8` by rank, «Прочее» neutral.

const NEUTRAL = "var(--muted-foreground)";
export const colorAt = (i: number) => `var(--chart-${(i % 8) + 1})`;
const paint = (c: string) => ({ dark: [c], light: [c] });

/** The change against the period before; none when there was nothing to compare with. */
export const Delta = ({ now, prev }: { now: number; prev: number }) => {
  if (prev <= 0 || now <= 0) {
    return null;
  }
  const change = (now - prev) / prev;
  if (Math.abs(change) < 0.005) {
    return (
      <span className="text-muted-foreground text-xs tabular-nums">0%</span>
    );
  }
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  // Spending more is not bad by itself: the arrow says which way, no red or green.
  return (
    <span className="text-muted-foreground inline-flex items-center gap-0.5 text-xs tabular-nums">
      <Icon className="size-3" />
      {Math.abs(Math.round(change * 100))}%
    </span>
  );
};

/** A series as bars, or as a line with an area under it. */
export const Spark = ({
  values,
  color = "var(--chart-1)",
  className,
  bars,
}: {
  values: number[];
  color?: string;
  className?: string;
  bars?: boolean;
}) => {
  const id = useId();
  const max = Math.max(...values, 0) || 1;
  if (bars) {
    const bw = 100 / values.length;
    return (
      <svg
        aria-hidden
        className={cn("h-6 w-20", className)}
        preserveAspectRatio="none"
        viewBox="0 0 100 24"
      >
        {values.map((v, i) => {
          const h = Math.max((v / max) * 22, v > 0 ? 1 : 0.5);
          return (
            // oxlint-disable-next-line react/no-array-index-key -- a bucket's place is its identity
            <rect
              fill={color}
              height={h}
              key={i}
              opacity={v > 0 ? 0.85 : 0.2}
              rx="0.6"
              width={bw * 0.7}
              x={i * bw + bw * 0.15}
              y={24 - h}
            />
          );
        })}
      </svg>
    );
  }
  const w = 100;
  const h = 24;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values
    .map(
      (v, i) =>
        `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`
    )
    .join(" ");
  return (
    <svg
      aria-hidden
      className={cn("h-6 w-20 overflow-visible", className)}
      preserveAspectRatio="none"
      viewBox={`0 0 ${w} ${h}`}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${id})`} points={`0,${h} ${pts} ${w},${h}`} />
      <polyline
        fill="none"
        points={pts}
        stroke={color}
        strokeLinejoin="round"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export const Segmented = <T extends string>({
  value,
  onChange,
  items,
  size = "default",
}: {
  value: T;
  onChange: (v: T) => void;
  items: [T, string][];
  size?: "default" | "sm";
}) => (
  <Tabs onValueChange={(v) => onChange(v as T)} value={value}>
    <TabsList className={size === "sm" ? "h-7" : undefined}>
      {items.map(([v, label]) => (
        <TabsTrigger
          className={size === "sm" ? "px-2 text-xs" : undefined}
          key={v}
          value={v}
        >
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

/** The groupings this view has: a person sees only their own, so «Люди» is the team's. */
export const useGroups = (): Group[] => {
  const { scope } = useUsage();
  return scope === "team"
    ? ["model", "person", "purpose"]
    : ["model", "purpose"];
};

export const GroupSwitch = ({ size }: { size?: "default" | "sm" }) => {
  const { group, setGroup } = useUsage();
  const t = useTranslations("usage.groups");
  const groups = useGroups();
  return (
    <Segmented
      items={groups.map((g) => [g, t(g)] as [Group, string])}
      onChange={setGroup}
      size={size}
      value={group}
    />
  );
};

const without = (f: Filter, g: Group): Filter =>
  Object.fromEntries(Object.entries(f).filter(([k]) => k !== g));

/** What the page is narrowed to — a person, a model, a purpose — each with its ×. */
export const FilterChips = () => {
  const { filter, setFilter } = useUsage();
  const t = useTranslations("usage");
  const { label } = useLabel();
  const chips = (Object.entries(filter) as [Group, string][]).filter(
    ([, v]) => v !== undefined
  );
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map(([g, key]) => (
        <button
          className="bg-muted hover:bg-muted/70 inline-flex h-7 items-center gap-1.5 rounded-full pr-2 pl-3 text-sm transition-colors"
          key={g}
          onClick={() => setFilter(without(filter, g))}
          type="button"
        >
          <span className="text-muted-foreground text-xs">
            {t(`group.${g}`)}:
          </span>
          {label(g, key)}
          <X className="text-muted-foreground size-3.5" />
        </button>
      ))}
      {chips.length > 1 && (
        <Button onClick={() => setFilter({})} size="sm" variant="ghost">
          {t("reset")}
        </Button>
      )}
    </div>
  );
};

/** Narrows the page to one entry; the same entry again lifts it. */
export const useDrill = () => {
  const { filter, setFilter } = useUsage();
  return (group: Group, key: string) =>
    setFilter(
      filter[group] === key
        ? without(filter, group)
        : { ...filter, [group]: key }
    );
};

export const EmptyUsage = () => {
  const t = useTranslations("usage");
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
      <ChartColumn className="text-muted-foreground size-6" />
      <p className="font-medium">{t("empty")}</p>
      <p className="text-muted-foreground max-w-xs text-sm">{t("emptyHint")}</p>
      <Link className="text-sm underline-offset-2 hover:underline" href="/">
        {t("toChat")}
      </Link>
    </div>
  );
};

/** Requests to models without a price: counted, but their cost is unknown — not zero. */
export const UnpricedNote = ({ totals }: { totals: Totals }) => {
  const t = useTranslations("usage");
  const f = useUsageFormat();
  return totals.unpriced > 0 ? (
    <p className="text-muted-foreground text-xs">
      {t("unpriced", {
        count: totals.unpriced,
        share: f.share(totals.unpriced / totals.requests),
      })}
    </p>
  ) : null;
};

/** The buckets stacked by the top five of the grouping (three on a phone), the rest as «Прочее». */
export const StackedChart = ({ height }: { height: string }) => {
  const { shown, period, group, metric, currency } = useUsage();
  const narrow = useNarrow();
  const t = useTranslations("usage");
  const f = useUsageFormat();
  const { label } = useLabel();
  const { data, keys, rest } = stackOf(
    shown,
    period.buckets,
    group,
    metric,
    currency,
    narrow ? 3 : 5
  );
  const config: ChartConfig = Object.fromEntries([
    ...keys.map((k, i) => [
      k,
      { colors: paint(colorAt(i)), label: label(group, k) },
    ]),
    ...(rest ? [[OTHER, { colors: paint(NEUTRAL), label: t("other") }]] : []),
  ]);
  const series = [...keys, ...(rest ? [OTHER] : [])];
  const axis = (v: number) =>
    metric === "cost"
      ? f.money(v, currency).replace(/[,.]00(?!\d)/u, "")
      : f.compact(v);
  return (
    <div className={cn("min-w-0", height)}>
      <EChartsBarChart
        barRadius={0}
        className="h-full"
        config={config}
        data={data}
        key={`${group}-${metric}-${currency}-${series.join(",")}`}
        stackType="stacked"
        xDataKey="at"
      >
        {series.map((k) => (
          <EChartsBarChart.Bar dataKey={k} isClickable key={k} />
        ))}
        <EChartsBarChart.Grid />
        <EChartsBarChart.XAxis
          dataKey="at"
          tickFormatter={(v) => f.bucket(String(v))}
        />
        <EChartsBarChart.YAxis tickFormatter={(v) => axis(Number(v))} />
        <EChartsBarChart.Tooltip
          labelFormatter={(v) => f.tip(String(v))}
          valueFormatter={(v) => f.value(metric, Number(v), currency)}
        />
        {/* A phone has no room for the legend: the rankings below carry the same colors. */}
        {!narrow && <EChartsBarChart.Legend isClickable />}
      </EChartsBarChart>
    </div>
  );
};

/** One entry of a ranking: name, its share as a bar, its days as a sparkline, the value and its change. */
export const RankRow = ({
  e,
  group,
  i,
  active,
  onClick,
  spark = true,
  dense,
}: {
  e: Ranked;
  group: Group;
  i: number;
  active: boolean;
  onClick: () => void;
  spark?: boolean;
  dense?: boolean;
}) => {
  const { metric, currency } = useUsage();
  const f = useUsageFormat();
  const { label, note } = useLabel();
  const color = i < 8 ? colorAt(i) : NEUTRAL;
  return (
    <button
      aria-pressed={active}
      className={cn(
        "hover:bg-muted/60 flex w-full items-center gap-3 rounded-lg px-2 text-left transition-colors",
        dense ? "py-1.5" : "py-2",
        active && "bg-muted"
      )}
      onClick={onClick}
      title={note(group, e.key) || undefined}
      type="button"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">
            {label(group, e.key)}
          </span>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {Math.round(e.share * 100)}%
          </span>
        </span>
        <span className="bg-muted relative h-1.5 overflow-hidden rounded-full">
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: color,
              width: `${Math.max(e.share * 100, 1)}%`,
            }}
          />
        </span>
      </span>
      {spark && (
        <Spark
          className="shrink-0 @max-sm:hidden"
          color={color}
          values={e.spark}
        />
      )}
      <span
        className={cn(
          "flex shrink-0 flex-col items-end",
          dense ? "w-20" : "w-24"
        )}
      >
        <span className="text-sm font-medium tabular-nums">
          {f.value(metric, e.value, currency)}
        </span>
        <Delta now={e.value} prev={e.prev} />
      </span>
    </button>
  );
};
