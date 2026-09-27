"use client";

import type { ChartConfig } from "@metobe/ui/components/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@metobe/ui/components/chart";
import { Skeleton } from "@metobe/ui/components/skeleton";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { WidgetFrame } from "@/components/chat/widget-frame";
import type { ChartPart } from "@/lib/answer-work";
import { chartView, pieSlices } from "@/lib/chart-data";
import type { ChartSeries, ChartView } from "@/lib/chart-data";

// A chart the model builds in its answer (ReUI charts: shadcn chart + recharts): its frame and axes first, then the
// points landing as the model writes them — the chart grows. No animation of its own: recharts redraws its shapes on
// every point, and a chart from the history just stands.

/** The theme's five chart colors, in turn. */
const color = (i: number) => `var(--chart-${(i % 5) + 1})`;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

/** A date out of an axis value; a date-only one is a calendar day, read in UTC. */
const asDate = (value: unknown) => {
  const text = String(value);
  const date = new Date(text);
  return Number.isNaN(date.getTime())
    ? null
    : { date, utc: DATE_ONLY.test(text) };
};

/** How the chart speaks its numbers and dates, in the user's language. */
const useChartFormat = (view: ChartView) => {
  const format = useFormatter();
  // Ticks across years say the month and the year; within one year, the day and the month.
  const years = new Set(
    view.points.flatMap((p) => {
      const at = view.x.type === "date" ? asDate(p.x) : null;
      return at ? [at.date.getUTCFullYear()] : [];
    })
  );
  const date = (value: unknown, style: "tick" | "full") => {
    const at = asDate(value);
    if (!at) {
      return String(value);
    }
    const zone = at.utc ? { timeZone: "UTC" } : {};
    if (style === "full") {
      return format.dateTime(at.date, { dateStyle: "medium", ...zone });
    }
    return format.dateTime(
      at.date,
      years.size > 1
        ? { month: "short", year: "2-digit", ...zone }
        : { day: "numeric", month: "short", ...zone }
    );
  };
  return {
    value: (n: number, s?: ChartSeries) =>
      `${format.number(n, { maximumFractionDigits: 2 })}${s?.unit ? ` ${s.unit}` : ""}`,
    x: (value: unknown, style: "tick" | "full") => {
      if (view.x.type === "date") {
        return date(value, style);
      }
      if (view.x.type === "number" && typeof value === "number") {
        return format.number(value, { maximumFractionDigits: 2 });
      }
      const text = String(value ?? "");
      return style === "tick" && text.length > 14
        ? `${text.slice(0, 13)}…`
        : text;
    },
    y: (n: number) =>
      format.number(n, { maximumFractionDigits: 1, notation: "compact" }),
  };
};

type Format = ReturnType<typeof useChartFormat>;

/** A tooltip's row, as ReUI draws it: the series' swatch and name, the value on the right. */
const TooltipRow = ({
  swatch,
  label,
  value,
}: {
  swatch: string;
  label: string;
  value: string;
}) => (
  <div className="flex w-full items-center justify-between gap-3">
    <div className="flex items-center gap-1.5">
      <span
        className="size-2.5 shrink-0 rounded-xs"
        style={{ background: swatch }}
      />
      <span className="text-muted-foreground">{label}</span>
    </div>
    <span className="text-foreground font-semibold tabular-nums">{value}</span>
  </div>
);

/**
 * The y axis as wide as its longest label — «800 тыс.», «1,6 млн» — so nothing is cut off at the left; the labels
 * are the axis' round steps, so the largest value (or, for stacked series, the largest sum) speaks for them.
 */
const yWidth = (view: ChartView, fmt: Format) => {
  const values = view.points.map((p) => {
    const numbers = view.series
      .map((s) => p[s.key])
      .filter((v): v is number => typeof v === "number");
    return view.stacked
      ? numbers.reduce((sum, v) => sum + v, 0)
      : Math.max(0, ...numbers);
  });
  const lowest = Math.min(
    0,
    ...view.points.flatMap((p) =>
      view.series
        .map((s) => p[s.key])
        .filter((v): v is number => typeof v === "number")
    )
  );
  const longest = Math.max(
    fmt.y(Math.max(0, ...values)).length,
    fmt.y(lowest).length
  );
  // About 7px a character at the axis' 12px, and a little air.
  return Math.max(32, longest * 7 + 12);
};

/** Bars, a line or an area over the x axis; several series stacked when they add up. */
const Cartesian = ({ view, fmt }: { view: ChartView; fmt: Format }) => {
  const uid = useId().replaceAll(":", "");
  const config: ChartConfig = Object.fromEntries(
    view.series.map((s, i) => [s.key, { color: color(i), label: s.label }])
  );
  const stack = view.stacked ? "all" : undefined;
  const parts: ReactNode[] = [
    <CartesianGrid key="grid" strokeDasharray="3 3" vertical={false} />,
    <XAxis
      axisLine={false}
      dataKey="x"
      key="x"
      minTickGap={16}
      tickFormatter={(v) => fmt.x(v, "tick")}
      tickLine={false}
      tickMargin={8}
    />,
    <YAxis
      axisLine={false}
      key="y"
      tickFormatter={fmt.y}
      tickLine={false}
      width={yWidth(view, fmt)}
    />,
    <ChartTooltip
      content={
        <ChartTooltipContent
          className="min-w-44 gap-2"
          // oxlint-disable-next-line react/no-unstable-nested-components -- the tooltip's render prop, not a component
          formatter={(value, name) => {
            const s = view.series.find((x) => x.key === name);
            return (
              <TooltipRow
                label={s?.label ?? String(name)}
                swatch={`var(--color-${String(name)})`}
                value={fmt.value(Number(value), s)}
              />
            );
          }}
          indicator="dot"
          labelFormatter={(_, payload) =>
            fmt.x(payload?.[0]?.payload?.x, "full")
          }
        />
      }
      cursor={
        view.kind === "bar" ? { fill: "var(--muted)", opacity: 0.5 } : false
      }
      key="tooltip"
    />,
    view.series.length > 1 && (
      <ChartLegend content={<ChartLegendContent />} key="legend" />
    ),
  ];
  const chart = {
    accessibilityLayer: true,
    data: view.points,
    margin: { left: 0, right: 8, top: 8 },
  };
  let body: ReactNode;
  if (view.kind === "line") {
    body = (
      <LineChart {...chart}>
        {parts}
        {view.series.map((s) => (
          <Line
            activeDot={{ r: 4 }}
            connectNulls
            dataKey={s.key}
            dot={view.points.length <= 24 ? { r: 2.5 } : false}
            isAnimationActive={false}
            key={s.key}
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            type="monotone"
          />
        ))}
      </LineChart>
    );
  } else if (view.kind === "area") {
    body = (
      <AreaChart {...chart}>
        <defs>
          {view.series.map((s) => (
            <linearGradient
              id={`${uid}-${s.key}`}
              key={s.key}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor={`var(--color-${s.key})`}
                stopOpacity={0.4}
              />
              <stop
                offset="95%"
                stopColor={`var(--color-${s.key})`}
                stopOpacity={0.05}
              />
            </linearGradient>
          ))}
        </defs>
        {parts}
        {view.series.map((s) => (
          <Area
            connectNulls
            dataKey={s.key}
            fill={`url(#${uid}-${s.key})`}
            isAnimationActive={false}
            key={s.key}
            stackId={stack}
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            type="monotone"
          />
        ))}
      </AreaChart>
    );
  } else {
    body = (
      <BarChart {...chart}>
        {parts}
        {view.series.map((s) => (
          <Bar
            dataKey={s.key}
            fill={`var(--color-${s.key})`}
            isAnimationActive={false}
            key={s.key}
            radius={stack ? 0 : [4, 4, 0, 0]}
            stackId={stack}
          />
        ))}
      </BarChart>
    );
  }
  return (
    <ChartContainer className="aspect-auto h-64 w-full sm:h-72" config={config}>
      {body}
    </ChartContainer>
  );
};

/** Shares of one whole: a ring with the total inside, the slices listed beside it with their share. */
const Donut = ({ view, fmt }: { view: ChartView; fmt: Format }) => {
  const t = useTranslations("chat.chart");
  const format = useFormatter();
  const [series] = view.series;
  const slices = pieSlices(view, t("other")).map((s, i) => ({
    ...s,
    fill: `var(--color-p${i})`,
    key: `p${i}`,
  }));
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const config: ChartConfig = Object.fromEntries(
    slices.map((s, i) => [s.key, { color: color(i), label: s.name }])
  );
  return (
    <div className="flex flex-col items-center gap-4 p-4 sm:flex-row sm:gap-8">
      <ChartContainer className="aspect-square h-48 shrink-0" config={config}>
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="min-w-40"
                // oxlint-disable-next-line react/no-unstable-nested-components -- the tooltip's render prop, not a component
                formatter={(value, name) => (
                  <TooltipRow
                    label={String(config[String(name)]?.label ?? name)}
                    swatch={`var(--color-${String(name)})`}
                    value={fmt.value(Number(value), series)}
                  />
                )}
                hideLabel
                nameKey="key"
              />
            }
          />
          <Pie
            cornerRadius={6}
            data={slices}
            dataKey="value"
            innerRadius="60%"
            isAnimationActive={false}
            nameKey="key"
            outerRadius="92%"
            paddingAngle={3}
            stroke="var(--background)"
            strokeWidth={3}
          >
            {slices.map((s) => (
              <Cell fill={s.fill} key={s.key} />
            ))}
            <Label
              // oxlint-disable-next-line react/no-unstable-nested-components -- recharts' label render prop, not a component
              content={({ viewBox }) =>
                viewBox && "cx" in viewBox ? (
                  <text
                    dominantBaseline="middle"
                    textAnchor="middle"
                    x={viewBox.cx}
                    y={viewBox.cy}
                  >
                    <tspan
                      className="fill-foreground text-lg font-semibold tabular-nums"
                      x={viewBox.cx}
                      y={viewBox.cy}
                    >
                      {fmt.y(total)}
                    </tspan>
                  </text>
                ) : null
              }
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="flex w-full min-w-0 flex-col gap-2 text-sm">
        {slices.map((s) => (
          <li className="flex items-center gap-2" key={s.key}>
            <span
              className="size-2.5 shrink-0 rounded-xs"
              style={{ background: config[s.key]?.color }}
            />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="text-muted-foreground tabular-nums">
              {format.number(total ? s.value / total : 0, {
                maximumFractionDigits: 0,
                style: "percent",
              })}
            </span>
            <span className="w-24 text-right font-medium tabular-nums">
              {fmt.value(s.value, series)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Before the first points: the chart's shape, pale — bars for a chart with axes, a ring for a pie. */
const ChartSkeleton = ({ pie }: { pie: boolean }) =>
  pie ? (
    <div aria-hidden className="flex items-center gap-8 p-4">
      <Skeleton className="size-40 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2.5">
        <Skeleton className="h-3.5 w-4/5 rounded-sm" />
        <Skeleton className="h-3.5 w-3/5 rounded-sm" />
        <Skeleton className="h-3.5 w-2/3 rounded-sm" />
      </div>
    </div>
  ) : (
    <div
      aria-hidden
      className="flex h-64 items-end gap-2 px-4 pt-6 pb-4 sm:h-72"
    >
      {[42, 64, 50, 78, 58, 88, 70, 54].map((h) => (
        <Skeleton
          className="flex-1 rounded-t-md rounded-b-none"
          key={h}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );

export const AnswerChart = ({ part }: { part: ChartPart }) => {
  const t = useTranslations("chat.chart");
  const view = chartView(part);
  const fmt = useChartFormat(view);
  const pie = view.kind === "pie";
  const ready = view.series.length > 0 && view.points.length > 0;
  let meta: string | undefined;
  if (ready) {
    meta = pie
      ? t("total", {
          value: fmt.value(
            pieSlices(view, "").reduce((sum, s) => sum + s.value, 0),
            view.series[0]
          ),
        })
      : t("points", { count: view.points.length });
  }
  let body: ReactNode = null;
  if (ready) {
    body = pie ? (
      <Donut fmt={fmt} view={view} />
    ) : (
      <Cartesian fmt={fmt} view={view} />
    );
  } else if (view.streaming) {
    body = <ChartSkeleton pie={pie} />;
  } else {
    body = <p className="text-muted-foreground p-4 text-sm">{t("noData")}</p>;
  }
  return (
    <WidgetFrame
      building={t("building")}
      meta={meta}
      streaming={view.streaming}
      title={view.title}
    >
      <div className={pie ? "" : "pt-3 pr-2"}>{body}</div>
    </WidgetFrame>
  );
};
