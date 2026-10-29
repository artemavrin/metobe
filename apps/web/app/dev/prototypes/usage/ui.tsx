"use client";

import { EChartsAreaChart } from "@metobe/ui/components/evilcharts/charts/echarts-area-chart";
import { EChartsBarChart } from "@metobe/ui/components/evilcharts/charts/echarts-bar-chart";
import type { ChartConfig } from "@metobe/ui/components/evilcharts/ui/echarts-chart";
import { Button } from "@metobe/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@metobe/ui/components/tabs";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowDownRight, ArrowUpRight, ChartColumn, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";

import { labelOf, MONTHS, running, stackOf } from "./agg";
import type { Filter, Group, Metric, Month, Ranked, Totals } from "./agg";
import type { Currency, Row } from "./data";
import { useProto } from "./state";

// The pieces every variant is built from: numbers in words, the month, the switches, the filter chips, a sparkline,
// the stacked days and the area of a total. Colors: `--chart-1…8` by rank, «Прочее» neutral.

// ── Numbers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const SYMBOL: Record<Currency, string> = { RUB: "₽", USD: "$" };

export const money = (v: number, c: Currency) => {
  // A cent's fraction (a cheap model's request): two significant digits, not «0,00».
  if (v > 0 && v < 0.01) return new Intl.NumberFormat("ru-RU", { currency: c, maximumSignificantDigits: 2, style: "currency" }).format(v);
  return new Intl.NumberFormat("ru-RU", { currency: c, maximumFractionDigits: v >= 1000 ? 0 : 2, minimumFractionDigits: v >= 1000 ? 0 : 2, style: "currency" }).format(v);
};

export const compact = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, notation: "compact" }).format(v);
export const whole = (v: number) => new Intl.NumberFormat("ru-RU").format(Math.round(v));

export const valueText = (metric: Metric, v: number, c: Currency) => (metric === "cost" ? money(v, c) : metric === "tokens" ? compact(v) : whole(v));

/** «Деньги» as one line: every currency, side by side, never added. */
export const costLine = (t: Totals, order: Currency[]) =>
  t.cost.size === 0 ? "—" : order.filter((c) => t.cost.has(c)).map((c) => money(t.cost.get(c) ?? 0, c)).join(" · ");

export const METRICS: Record<Metric, string> = { cost: "Деньги", requests: "Запросы", tokens: "Токены" };
export const GROUPS: Record<Group, string> = { model: "Модели", person: "Люди", purpose: "Назначение" };

const DAY = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short" });
/** A bucket's name: «3 окт», or «09:00» for an hour of a single day. */
export const dayLabel = (d: string) => (d.includes("T") ? `${d.slice(11)}:00` : DAY.format(new Date(`${d}T00:00:00Z`)).replace(".", ""));
/** A bucket in the tooltip: «3 окт, пт», or «09:00–10:00». */
export const tipLabel = (d: string) =>
  d.includes("T") ? `${d.slice(11)}:00–${String(Number(d.slice(11)) + 1).padStart(2, "0")}:00` : `${dayLabel(d)}, ${weekdayOf(d)}`;
export const weekdayOf = (d: string) => WEEKDAY.format(new Date(`${d}T00:00:00Z`));
const MONTH = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC", year: "numeric" });
const MONTH_IN = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" });
export const monthLabel = (m: string) => MONTH.format(new Date(`${m}-01T00:00:00Z`)).replace(" г.", "");
/** «к 1–29 сентября». */
export const prevLabel = (p: { from: string; to: string }) => `к ${Number(p.from.slice(8))}–${Number(p.to.slice(8))} ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${p.to}T00:00:00Z`)).split(" ")[1]}`;
export const monthName = (m: string) => MONTH_IN.format(new Date(`${m}-01T00:00:00Z`));

/** The change against the period before; none when there was nothing to compare with. */
export const Delta = ({ now, prev, className }: { now: number; prev: number; className?: string }) => {
  if (prev <= 0 || now <= 0) return null;
  const change = (now - prev) / prev;
  if (Math.abs(change) < 0.005) return <span className={cn("text-muted-foreground text-xs tabular-nums", className)}>0%</span>;
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  // Spending more is not bad by itself: the arrow says which way, no red or green.
  return (
    <span className={cn("text-muted-foreground inline-flex items-center gap-0.5 text-xs tabular-nums", className)}>
      <Icon className="size-3" />
      {Math.abs(Math.round(change * 100))}%
    </span>
  );
};

// ── Colors ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export const OTHER = "var(--muted-foreground)";
export const colorAt = (i: number) => `var(--chart-${(i % 8) + 1})`;
const paint = (c: string) => ({ dark: [c], light: [c] });

// ── Frame ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The settings page's width, or a phone: the same page in a narrow frame. */
export const Frame = ({ children }: { children: React.ReactNode }) => {
  const { screen } = useProto();
  if (screen === "phone") {
    return (
      <div className="bg-muted/40 flex min-h-dvh justify-center py-8">
        <div className="bg-background @container h-[812px] w-[390px] overflow-y-auto rounded-[2.5rem] border shadow-xl [scrollbar-width:none]">
          <div className="flex flex-col gap-6 px-4 pt-6 pb-28">{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="@container mx-auto w-full max-w-4xl">
      <div className="flex flex-col gap-6 px-4 pt-4 pb-32 md:gap-8 md:px-10 md:pt-8">{children}</div>
    </div>
  );
};

export const useNarrow = () => {
  const { screen } = useProto();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return screen === "phone" || narrow;
};

export const Header = () => {
  const { scope } = useProto();
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight">{scope === "team" ? "Расходы команды" : "Расходы"}</h1>
      <p className="text-muted-foreground">
        {scope === "team" ? "Сколько и на что тратит команда: модели, люди, дни." : "Что вы потратили: модели, дни, на что ушло."}
      </p>
    </header>
  );
};

export const MonthStepper = () => {
  const { month, setMonth, period } = useProto();
  const i = MONTHS.indexOf(month);
  return (
    <div className="flex items-center gap-1">
      <Button aria-label="Предыдущий месяц" disabled={i === 0} onClick={() => setMonth(MONTHS[i - 1] as Month)} size="icon-sm" variant="ghost">
        <ChevronLeft />
      </Button>
      <span className="min-w-32 text-center text-sm font-medium first-letter:uppercase">
        {monthLabel(month)}
        {period.partial && <span className="text-muted-foreground font-normal"> · по {Number(period.to.slice(8))}-е</span>}
      </span>
      <Button aria-label="Следующий месяц" disabled={i === MONTHS.length - 1} onClick={() => setMonth(MONTHS[i + 1] as Month)} size="icon-sm" variant="ghost">
        <ChevronRight />
      </Button>
    </div>
  );
};

export const Segmented = <T extends string>({ value, onChange, items, size = "default" }: { value: T; onChange: (v: T) => void; items: [T, string][]; size?: "default" | "sm" }) => (
  <Tabs onValueChange={(v) => onChange(v as T)} value={value}>
    <TabsList className={size === "sm" ? "h-7" : undefined}>
      {items.map(([v, label]) => (
        <TabsTrigger className={size === "sm" ? "px-2 text-xs" : undefined} key={v} value={v}>
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

/** «Деньги / Запросы / Токены», and the currency beside «Деньги» when the month has two: they are never added. */
export const MetricSwitch = ({ size }: { size?: "default" | "sm" }) => {
  const { metric, setMetric, currency, setCurrency, present } = useProto();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented items={Object.entries(METRICS) as [Metric, string][]} onChange={setMetric} size={size} value={metric} />
      {metric === "cost" && present.length > 1 && (
        <Segmented items={present.map((c) => [c, SYMBOL[c]] as [Currency, string])} onChange={setCurrency} size={size} value={currency} />
      )}
    </div>
  );
};

export const GroupSwitch = ({ size }: { size?: "default" | "sm" }) => {
  const { group, setGroup, scope } = useProto();
  const items = (Object.entries(GROUPS) as [Group, string][]).filter(([g]) => scope === "team" || g !== "person");
  return <Segmented items={items} onChange={setGroup} size={size} value={group} />;
};

/** What the page is narrowed to — a person, a model, a purpose — each with its ×. */
export const FilterChips = () => {
  const { filter, setFilter } = useProto();
  const chips: [keyof typeof filter, Group, string][] = [];
  if (filter.person !== undefined) chips.push(["person", "person", filter.person ?? "—"]);
  if (filter.model !== undefined) chips.push(["model", "model", filter.model]);
  if (filter.purpose !== undefined) chips.push(["purpose", "purpose", filter.purpose]);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map(([k, g, key]) => (
        <button
          className="bg-muted hover:bg-muted/70 inline-flex h-7 items-center gap-1.5 rounded-full pr-2 pl-3 text-sm transition-colors"
          key={k}
          onClick={() => {
            const next = { ...filter };
            delete next[k];
            setFilter(next);
          }}
          type="button"
        >
          <span className="text-muted-foreground text-xs">{GROUPS[g].slice(0, -1)}:</span>
          {labelOf(g, key)}
          <X className="text-muted-foreground size-3.5" />
        </button>
      ))}
      {chips.length > 1 && (
        <Button onClick={() => setFilter({})} size="sm" variant="ghost">
          Сбросить
        </Button>
      )}
    </div>
  );
};

export const isActive = (f: Filter, group: Group, key: string) =>
  group === "person" ? f.person !== undefined && (f.person ?? "—") === key : f[group] === key;

/** Narrows the page to one entry; the same entry again lifts it. */
export const useDrill = () => {
  const { filter, setFilter } = useProto();
  return (group: Group, key: string) => {
    const k = group === "person" ? "person" : group;
    const value = group === "person" ? (key === "—" ? null : key) : key;
    if (filter[k] === value) {
      const next = { ...filter };
      delete next[k];
      setFilter(next);
    } else setFilter({ ...filter, [k]: value });
  };
};

export const Empty = () => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
    <ChartColumn className="text-muted-foreground size-6" />
    <p className="font-medium">В этом месяце расходов нет</p>
    <p className="text-muted-foreground max-w-xs text-sm">Каждый ответ модели записывается сюда: запросы, токены и цена.</p>
  </div>
);

/** Requests to models without a price: counted, but their cost is unknown — not zero. */
export const UnpricedNote = ({ t }: { t: Totals }) =>
  t.unpriced > 0 ? (
    <p className="text-muted-foreground text-xs">
      {whole(t.unpriced)} запр. ({Math.round((t.unpriced / t.requests) * 100)}%) — модели без цены, их нет в деньгах.
    </p>
  ) : null;

// ── Charts ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A row's days in a line: an area under it, the last day's dot. */
export const Spark = ({ values, color = "var(--chart-1)", className, bars }: { values: number[]; color?: string; className?: string; bars?: boolean }) => {
  const max = Math.max(...values, 0) || 1;
  if (bars) {
    const bw = 100 / values.length;
    return (
      <svg aria-hidden className={cn("h-6 w-20", className)} preserveAspectRatio="none" viewBox="0 0 100 24">
        {values.map((v, i) => (
          <rect fill={color} height={Math.max((v / max) * 22, v > 0 ? 1 : 0.5)} key={i} opacity={v > 0 ? 0.85 : 0.2} rx="0.6" width={bw * 0.7} x={i * bw + bw * 0.15} y={24 - Math.max((v / max) * 22, v > 0 ? 1 : 0.5)} />
        ))}
      </svg>
    );
  }
  const w = 100;
  const h = 24;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`);
  const id = `s${Math.round(values.reduce((s, v) => s + v, 0) * 1000) % 1e9}`;
  return (
    <svg aria-hidden className={cn("h-6 w-20 overflow-visible", className)} preserveAspectRatio="none" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${id})`} points={`0,${h} ${pts.join(" ")} ${w},${h}`} />
      <polyline fill="none" points={pts.join(" ")} stroke={color} strokeLinejoin="round" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/** The month's days stacked by the top five of the grouping, the rest as «Прочее». */
export const StackedDays = ({ rows, height = "h-64" }: { rows: Row[]; height?: string }) => {
  const { period, group, metric, currency } = useProto();
  const narrow = useNarrow();
  const { data, keys, rest } = stackOf(rows, period.days, group, metric, currency, narrow ? 3 : 5);
  const config: ChartConfig = Object.fromEntries([
    ...keys.map((k, i) => [k, { colors: paint(colorAt(i)), label: labelOf(group, k) }]),
    ...(rest ? [["other", { colors: paint(OTHER), label: "Прочее" }]] : []),
  ]);
  const series = [...keys, ...(rest ? ["other"] : [])];
  return (
    <div className={cn("min-w-0", height)}>
      <EChartsBarChart barRadius={0} className="h-full" config={config} data={data} key={`${group}-${metric}-${currency}-${series.join()}`} stackType="stacked" xDataKey="day">
        {series.map((k) => (
          <EChartsBarChart.Bar dataKey={k} isClickable key={k} />
        ))}
        <EChartsBarChart.Grid />
        <EChartsBarChart.XAxis dataKey="day" tickFormatter={(v) => dayLabel(v)} />
        <EChartsBarChart.YAxis tickFormatter={(v) => (metric === "cost" ? money(Number(v), currency).replace(",00", "") : compact(Number(v)))} />
        <EChartsBarChart.Tooltip labelFormatter={tipLabel} valueFormatter={(v) => valueText(metric, v, currency)} />
        {/* A phone has no room for the legend: the rankings below carry the same colors. */}
        {!narrow && <EChartsBarChart.Legend isClickable />}
      </EChartsBarChart>
    </div>
  );
};

/** One total by day, or running — then the same days of the month before behind it, dashed: «где мы к этому дню». */
export const TotalArea = ({ now, prev, height = "h-48", cumulative }: { now: number[]; prev?: number[]; height?: string; cumulative?: boolean }) => {
  const { period, metric, currency } = useProto();
  const a = cumulative ? running(now) : now;
  const b = prev && cumulative ? running(prev) : prev;
  const data = period.days.map((day, i) => ({ day, now: a[i] ?? 0, ...(b ? { prev: b[i] ?? 0 } : {}) }));
  const config: ChartConfig = {
    now: { colors: paint("var(--chart-1)"), label: monthName(period.from.slice(0, 7)).replace(/^./u, (c) => c.toUpperCase()) },
    prev: { colors: paint(OTHER), label: monthName(period.prev.month).replace(/^./u, (c) => c.toUpperCase()) },
  };
  return (
    <div className={cn("min-w-0", height)}>
      <EChartsAreaChart className="h-full" config={config} curveType="monotoneX" data={data} key={`${metric}-${currency}-${cumulative}-${Boolean(b)}`} xDataKey="day">
        {b && <EChartsAreaChart.Area dataKey="prev" strokeVariant="dashed" strokeWidth={1.5} variant="none" />}
        <EChartsAreaChart.Area dataKey="now" strokeVariant="solid" strokeWidth={2} variant="gradient" />
        <EChartsAreaChart.Grid />
        <EChartsAreaChart.XAxis dataKey="day" tickFormatter={(v) => dayLabel(v)} />
        <EChartsAreaChart.YAxis tickFormatter={(v) => (metric === "cost" ? money(Number(v), currency).replace(",00", "") : compact(Number(v)))} />
        <EChartsAreaChart.Tooltip labelFormatter={tipLabel} valueFormatter={(v) => valueText(metric, v, currency)} />
      </EChartsAreaChart>
    </div>
  );
};

// ── Ranking ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One entry of a ranking: name, its share as a bar, its days as a sparkline, the value and its change. */
export const RankRow = ({ e, group, i, active, onClick, spark = true, dense }: { e: Ranked; group: Group; i: number; active: boolean; onClick: () => void; spark?: boolean; dense?: boolean }) => {
  const { metric, currency } = useProto();
  const color = i < 8 ? colorAt(i) : OTHER;
  return (
    <button
      aria-pressed={active}
      className={cn("hover:bg-muted/60 flex w-full items-center gap-3 rounded-lg px-2 text-left transition-colors", dense ? "py-1.5" : "py-2", active && "bg-muted")}
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{labelOf(group, e.key)}</span>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{Math.round(e.share * 100)}%</span>
        </span>
        <span className="bg-muted relative h-1.5 overflow-hidden rounded-full">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ background: color, width: `${Math.max(e.share * 100, 1)}%` }} />
        </span>
      </span>
      {spark && <Spark className="shrink-0 @max-sm:hidden" color={color} values={e.spark} />}
      <span className={cn("flex shrink-0 flex-col items-end", dense ? "w-20" : "w-24")}>
        <span className="text-sm font-medium tabular-nums">{valueText(metric, e.value, currency)}</span>
        <Delta now={e.value} prev={e.prev} />
      </span>
    </button>
  );
};
