"use client";

import type { MetricResult } from "@metobe/contracts/metrics";
import { Badge } from "@metobe/ui/components/reui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";

// The parts the strip of key figures is built of (the prototype's «Полоса», /dev/prototypes/metrics): a figure, its
// change, its history, a bar to a goal or a share, a spread, a ranking, a summary. Each speaks in the user's language.
//
// Motion plays only when the widget is built live, never when it is opened from the history: the blocks come in one
// after another (260 ms ease-out, 45 ms apart), a line is drawn left to right, a bar fills from its start — transform
// and clip only. The figures never count up: a figure the user reads and quotes does not move. Reduced motion: a fade.

export const METRICS_CSS = `
.m-root { --m-ease: cubic-bezier(0.23, 1, 0.32, 1); }
@keyframes m-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes m-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes m-draw { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes m-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.m-root[data-live] .m-in { animation: m-in 260ms var(--m-ease) both; animation-delay: calc(var(--i, 0) * 45ms); }
.m-root[data-live] .m-draw { animation: m-draw 560ms var(--m-ease) both; animation-delay: calc(var(--i, 0) * 45ms + 140ms); }
.m-root[data-live] .m-fill { animation: m-fill 640ms var(--m-ease) both; animation-delay: calc(var(--i, 0) * 45ms + 160ms); }
.m-root[data-live] .m-late { animation: m-fade 200ms ease both; animation-delay: calc(var(--i, 0) * 45ms + 620ms); }
.m-fill { transform-origin: left center; }
@media (prefers-reduced-motion: reduce) {
  .m-root[data-live] .m-in { animation: m-fade 200ms ease both; animation-delay: 0ms; }
  .m-root[data-live] .m-late, .m-root[data-live] .m-draw, .m-root[data-live] .m-fill { animation: none; }
}
@keyframes m-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.m-skel { animation: m-pulse 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .m-skel { animation: none; } }
`;

/** The stagger index of a block: `style={at(2)}`. */
export const at = (i: number) => ({ "--i": i }) as CSSProperties;

const NBSP = " ";

const withUnit = (text: string, unit?: string) =>
  unit ? `${text}${NBSP}${unit}` : text;

const signOf = (n: number) => {
  if (n > 0) {
    return "+";
  }
  return n < 0 ? "−" : "";
};

/** The figures as people read them: big ones short («1,69 млрд»), small ones whole. */
export const useMetricFormat = () => {
  const format = useFormatter();
  const exact = (n: number) => format.number(n, { maximumFractionDigits: 2 });
  const short = (n: number) =>
    Math.abs(n) >= 1e4
      ? format.number(n, { maximumSignificantDigits: 3, notation: "compact" })
      : format.number(n, { maximumFractionDigits: Math.abs(n) < 100 ? 1 : 0 });
  const percent = (n: number, digits = 1) =>
    `${format.number(n, { maximumFractionDigits: digits })}${NBSP}%`;
  const signed = (n: number, digits = 1) =>
    `${signOf(n)}${format.number(Math.abs(n), { maximumFractionDigits: digits })}`;
  return { exact, percent, short, signed, withUnit };
};

/** The labels of a history's points: months say the month (and the year across years), days the day and month. */
export const useBucketLabels = () => {
  const format = useFormatter();
  return (xs: string[], bucket: string | undefined) => {
    const years = new Set(xs.map((x) => x.slice(0, 4)));
    return xs.map((x) => {
      const date = new Date(`${x}T00:00:00Z`);
      const zone = { timeZone: "UTC" } as const;
      if (bucket === "year") {
        return format.dateTime(date, { ...zone, year: "numeric" });
      }
      if (bucket === "month") {
        return format.dateTime(
          date,
          years.size > 1
            ? { ...zone, month: "short", year: "2-digit" }
            : { ...zone, month: "short" }
        );
      }
      return format.dateTime(date, { ...zone, day: "numeric", month: "short" });
    });
  };
};

/** A quiet hover card: the sidebar's surface, no arrow, nothing but the fact (Metobe's tooltip convention). */
export const Tip = ({
  tip,
  children,
  className,
  style,
}: {
  tip: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) => (
  <Tooltip>
    <TooltipTrigger render={<span className={className} style={style} />}>
      {children}
    </TooltipTrigger>
    <TooltipContent
      arrow={false}
      className="bg-sidebar text-foreground ring-foreground/10 max-w-64 rounded-lg px-2.5 py-1.5 leading-snug shadow-md ring-1"
      sideOffset={8}
    >
      {tip}
    </TooltipContent>
  </Tooltip>
);

/** A figure: the short form big, its unit beside it, the exact one on hover. */
export const Figure = ({
  value,
  unit,
  size = "lg",
}: {
  value: number;
  unit?: string;
  size?: "lg" | "xl";
}) => {
  const f = useMetricFormat();
  // A percent is the figure's own unit: no gap, the unit small.
  const shown = unit === "%" ? f.exact(value) : f.short(value);
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 font-medium tracking-tight tabular-nums",
        size === "lg" && "text-2xl",
        size === "xl" && "text-4xl sm:text-5xl"
      )}
      title={f.withUnit(f.exact(value), unit)}
    >
      <span>{shown}</span>
      {unit && (
        <span className="text-muted-foreground text-[0.55em] font-normal">
          {unit}
        </span>
      )}
    </span>
  );
};

type Delta = NonNullable<MetricResult["delta"]>;

/** The change against the period before: colored by whether it is good, not by its sign. */
export const DeltaBadge = ({
  delta,
  bucket,
  unit,
}: {
  delta: Delta;
  bucket?: string;
  unit?: string;
}) => {
  const t = useTranslations("chat.metrics");
  const f = useMetricFormat();
  const labels = useBucketLabels();
  if (delta.change === null) {
    return null;
  }
  const [from, to] = labels([delta.from, delta.to], bucket);
  const flat = Math.abs(delta.change) < 0.05;
  const better = delta.change > 0 === (delta.good === "up");
  let Icon = Minus;
  let variant: "secondary" | "success-light" | "destructive-light" =
    "secondary";
  if (!flat) {
    Icon = delta.change > 0 ? ArrowUpRight : ArrowDownRight;
    variant = better ? "success-light" : "destructive-light";
  }
  return (
    <Tip
      tip={t("changeTip", {
        current: f.withUnit(f.short(delta.current), unit),
        from: from ?? "",
        previous: f.withUnit(f.short(delta.previous), unit),
        to: to ?? "",
      })}
    >
      <Badge size="sm" variant={variant}>
        <Icon />
        <span className="tabular-nums">
          {f.signed(delta.change)}
          {NBSP}%
        </span>
      </Badge>
    </Tip>
  );
};

const path = (points: [number, number][]) =>
  points
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join("");

/**
 * The history of a figure as a soft area: the line on top, a gradient under it, the last point marked. The pointer
 * reads it — a guide and the period's value above — so the figure needs no axis.
 */
export const Spark = ({
  series,
  bucket,
  unit,
  height = 40,
  className,
}: {
  series: { x: string; value: number }[];
  bucket?: string;
  unit?: string;
  height?: number;
  className?: string;
}) => {
  const id = useId();
  const f = useMetricFormat();
  const labels = useBucketLabels()(
    series.map((s) => s.x),
    bucket
  );
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const w = 200;
  const pad = 3;
  const values = series.map((s) => s.value);
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  // A series that barely moves stays flat: the scale is at least a tenth of its level, so noise is not drawn as a swing.
  const mid = (hi + lo) / 2;
  const span = Math.max(hi - lo, Math.abs(mid) * 0.1) || 1;
  const base = lo - (span - (hi - lo)) / 2;
  const pts: [number, number][] = values.map((v, i) => [
    (i / Math.max(values.length - 1, 1)) * w,
    height - pad - ((v - base) / span) * (height - pad * 2),
  ]);
  const shown = hover ?? series.length - 1;
  const point = pts[shown] as [number, number];
  const onMove = (e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (r) {
      setHover(
        Math.round(
          Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) *
            (series.length - 1)
        )
      );
    }
  };
  const left = `${(point[0] / w) * 100}%`;
  return (
    <div
      className={cn("relative", className)}
      onPointerLeave={() => setHover(null)}
      onPointerMove={onMove}
      ref={box}
      style={{ height }}
    >
      <div className="m-draw absolute inset-0">
        <svg
          aria-hidden
          className="size-full overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${w} ${height}`}
        >
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`${path(pts)}L${w} ${height}L0 ${height}Z`}
            fill={`url(#${id})`}
          />
          <path
            d={path(pts)}
            fill="none"
            stroke="var(--chart-1)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      {/* The marked point is HTML, not SVG: the SVG is stretched to the box and would squash a circle. */}
      <span
        aria-hidden
        className="m-late bg-background pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--chart-1)]"
        style={{ left, top: point[1] }}
      />
      {hover !== null && (
        <>
          <span
            aria-hidden
            className="bg-foreground/15 pointer-events-none absolute inset-y-0 w-px"
            style={{ left }}
          />
          <span
            className="bg-sidebar text-foreground ring-foreground/10 pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap tabular-nums shadow-sm ring-1"
            style={{
              left: `clamp(2.5rem, ${(point[0] / w) * 100}%, calc(100% - 2.5rem))`,
            }}
          >
            <span className="text-muted-foreground">{labels[shown]} · </span>
            {f.withUnit(f.short(series[shown]?.value ?? 0), unit)}
          </span>
        </>
      )}
    </div>
  );
};

/** Progress or a share: a thin track and a fill from its start; past 100% the fill is full and the figure says so. */
export const Meter = ({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) => (
  <div
    aria-label={label}
    aria-valuemax={100}
    aria-valuemin={0}
    aria-valuenow={Math.round(value * 100)}
    className={cn(
      "bg-muted h-1.5 w-full overflow-hidden rounded-full",
      className
    )}
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a styled bar: the native meter cannot be drawn like this
    role="meter"
  >
    <div
      className="m-fill h-full rounded-full"
      style={{
        background: "var(--chart-1)",
        width: `${Math.min(Math.max(value, 0), 1) * 100}%`,
      }}
    />
  </div>
);

/** A spread: where the average and the median sit between the smallest and the greatest. */
export const Spread = ({
  range,
  unit,
}: {
  range: NonNullable<MetricResult["range"]>;
  unit?: string;
}) => {
  const t = useTranslations("chat.metrics");
  const f = useMetricFormat();
  const { min, avg, median, max } = range;
  const pos = (v: number) => `${((v - min) / (max - min || 1)) * 100}%`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="bg-muted relative h-1.5 rounded-full">
        {/* Between the median and the average the fill says how skewed the amounts are. */}
        <div
          className="m-fill absolute inset-y-0 rounded-full"
          style={{
            background: "color-mix(in oklab, var(--chart-1) 30%, transparent)",
            insetInlineEnd: `calc(100% - ${pos(Math.max(avg, median))})`,
            insetInlineStart: pos(Math.min(avg, median)),
          }}
        />
        <Tip
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: pos(median) }}
          tip={`${t("aggregate.median")} ${f.withUnit(f.exact(median), unit)}`}
        >
          <span className="bg-background block size-2.5 rounded-full ring-2 ring-[var(--chart-1)]" />
        </Tip>
        <Tip
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: pos(avg) }}
          tip={`${t("aggregate.avg")} ${f.withUnit(f.exact(avg), unit)}`}
        >
          <span
            className="block size-2.5 rounded-full"
            style={{ background: "var(--chart-1)" }}
          />
        </Tip>
      </div>
      <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
        <span>{f.short(min)}</span>
        <span>{f.short(max)}</span>
      </div>
    </div>
  );
};

/** A ranking: each row's bar is its share of the biggest, so the bars add up to the picture. */
export const Bars = ({
  items,
  whole,
  unit,
}: {
  items: { name: string; value: number }[];
  whole?: number;
  unit?: string;
}) => {
  const f = useMetricFormat();
  const top = Math.max(items[0]?.value ?? 1, 1e-9);
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li
          className="m-in grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-sm"
          key={item.name}
          style={at(i + 1)}
        >
          <span className="truncate" title={item.name}>
            {item.name}
          </span>
          <span className="bg-muted h-1.5 overflow-hidden rounded-full">
            <span
              className="m-fill block h-full rounded-full"
              style={{
                background: "var(--chart-1)",
                opacity: 1 - i * 0.14,
                width: `${(Math.max(item.value, 0) / top) * 100}%`,
              }}
            />
          </span>
          <Tip
            className="text-muted-foreground text-xs tabular-nums"
            tip={`${f.withUnit(f.exact(item.value), unit)}${whole ? ` · ${f.percent((item.value / whole) * 100)}` : ""}`}
          >
            {f.short(item.value)}
          </Tip>
        </li>
      ))}
    </ol>
  );
};

/** A summary: plain facts, label and value, nothing between. */
export const Facts = ({
  facts,
  unit,
}: {
  facts: NonNullable<MetricResult["facts"]>;
  unit?: string;
}) => {
  const t = useTranslations("chat.metrics");
  const f = useMetricFormat();
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-sm">
      {facts.map((fact, i) => (
        <div
          className="m-in flex items-baseline justify-between gap-3"
          key={fact.fact}
          style={at(i + 1)}
        >
          <dt className="text-muted-foreground">{t(`facts.${fact.fact}`)}</dt>
          <dd className="font-medium tabular-nums" title={f.exact(fact.value)}>
            {fact.fact === "rows"
              ? f.exact(fact.value)
              : f.withUnit(f.short(fact.value), unit)}
          </dd>
        </div>
      ))}
    </dl>
  );
};
