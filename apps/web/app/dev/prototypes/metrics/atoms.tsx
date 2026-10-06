"use client";

import { Badge } from "@metobe/ui/components/reui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { Delta, Metric } from "./data";
import { compact, exactOf, percent, signed } from "./format";

// The parts every layout is built of. A metric is one of a few forms — a number; a number against the month before;
// a number with its history; progress to a goal; a share of a whole; a spread; a ranking; a summary — and each form
// is the same few atoms wherever it stands: Figure, Delta, Spark, Meter, Spread, Bars, Facts.
//
// Motion (only when the widget is built live, never when opened from history): the blocks come in one after another
// (260 ms ease-out, 45 ms apart), a line is drawn left to right and a bar fills from its start (transform only). The
// numbers themselves never count up: a figure the user reads and quotes does not move. Reduced motion: a fade.

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
  .m-root[data-live] .m-late { animation: none; }
  .m-root[data-live] .m-draw, .m-root[data-live] .m-fill { animation: none; }
}
@keyframes m-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.m-skel { animation: m-pulse 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .m-skel { animation: none; } }
`;

/** The stagger index of a block: `style={at(2)}`. */
export const at = (i: number) => ({ "--i": i }) as CSSProperties;

/** A quiet hover card: the sidebar's surface, no arrow, nothing but the fact (Metobe's tooltip convention). */
export const Tip = ({ tip, children, className, style }: { tip: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) => (
  <Tooltip>
    <TooltipTrigger render={<span className={className} style={style} />}>{children}</TooltipTrigger>
    <TooltipContent
      arrow={false}
      className="bg-sidebar text-foreground ring-foreground/10 max-w-64 rounded-lg px-2.5 py-1.5 leading-snug shadow-md ring-1"
      sideOffset={8}
    >
      {tip}
    </TooltipContent>
  </Tooltip>
);

/** A number: the short form big, its unit beside it, the exact figure on hover. */
export const Figure = ({
  value,
  unit,
  size = "lg",
  className,
}: {
  value: number;
  unit?: string;
  size?: "md" | "lg" | "xl";
  className?: string;
}) => {
  const { value: shown, scale } = unit === "%" ? { scale: "", value: percent(value).replace(/\s%$/u, "") } : compact(value);
  const exact = `${exactOf(value)}${unit ? ` ${unit}` : ""}`;
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 font-medium tracking-tight tabular-nums",
        size === "md" && "text-xl",
        size === "lg" && "text-2xl",
        size === "xl" && "text-4xl sm:text-5xl",
        className
      )}
      title={exact}
    >
      <span>
        {shown}
        {scale}
      </span>
      {unit && <span className="text-muted-foreground text-[0.55em] font-normal">{unit}</span>}
    </span>
  );
};

/** A change against the month before: colored by whether the change is good, not by its sign. */
export const DeltaBadge = ({ delta, showVersus = false }: { delta: Delta; showVersus?: boolean }) => {
  const flat = Math.abs(delta.value) < 0.05;
  const better = (delta.value > 0) === (delta.good === "up");
  const Icon = flat ? Minus : delta.value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Tip tip={`${delta.versus[0]?.toUpperCase()}${delta.versus.slice(1)}: ${delta.detail}`}>
      <Badge size="sm" variant={flat ? "secondary" : better ? "success-light" : "destructive-light"}>
        <Icon />
        <span className="tabular-nums">
          {signed(delta.value)}
          {delta.unit === "%" ? " %" : ` ${delta.unit}`}
        </span>
        {showVersus && <span className="font-normal opacity-70">{delta.versus}</span>}
      </Badge>
    </Tip>
  );
};

const path = (points: [number, number][]) => points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");

/**
 * The history of a number as a soft area: the line on top, a gradient under it, the last point marked. The pointer
 * reads it — a guide and the month's value above — so the tile needs no axis.
 */
export const Spark = ({
  series,
  unit,
  height = 40,
  className,
}: {
  series: { label: string; value: number }[];
  unit?: string;
  height?: number;
  className?: string;
}) => {
  const id = useId();
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
  const pts: [number, number][] = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * w, height - pad - ((v - base) / span) * (height - pad * 2)]);
  const shownIndex = hover ?? series.length - 1;
  const onMove = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setHover(Math.round(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * (series.length - 1)));
  };
  const point = pts[shownIndex] as [number, number];
  return (
    <div
      className={cn("relative", className)}
      onPointerLeave={() => setHover(null)}
      onPointerMove={onMove}
      ref={box}
      style={{ height }}
    >
      <div className="m-draw absolute inset-0">
        <svg aria-hidden className="size-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 ${w} ${height}`}>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path(pts)}L${w} ${height}L0 ${height}Z`} fill={`url(#${id})`} />
          <path d={path(pts)} fill="none" stroke="var(--chart-1)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      {/* The marked point is HTML, not SVG: the SVG is stretched to the box and would squash a circle. */}
      <span
        aria-hidden
        className="m-late bg-background pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--chart-1)]"
        style={{ left: `${(point[0] / w) * 100}%`, top: point[1] }}
      />
      {hover !== null && (
        <>
          <span aria-hidden className="bg-foreground/15 pointer-events-none absolute inset-y-0 w-px" style={{ left: `${(point[0] / w) * 100}%` }} />
          <span
            className="bg-sidebar text-foreground ring-foreground/10 pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap tabular-nums shadow-sm ring-1"
            style={{ left: `clamp(2.5rem, ${(point[0] / w) * 100}%, calc(100% - 2.5rem))` }}
          >
            <span className="text-muted-foreground">{series[shownIndex]?.label} · </span>
            {compact(series[shownIndex]?.value ?? 0).value}
            {compact(series[shownIndex]?.value ?? 0).scale}
            {unit ? ` ${unit}` : ""}
          </span>
        </>
      )}
    </div>
  );
};

/** Progress or a share: a thin track and a fill from its start; past 100% the fill is full and the figure says so. */
export const Meter = ({ value, label, className }: { value: number; label: string; className?: string }) => (
  <div
    aria-label={label}
    aria-valuemax={100}
    aria-valuemin={0}
    aria-valuenow={Math.round(value * 100)}
    className={cn("bg-muted h-1.5 w-full overflow-hidden rounded-full", className)}
    role="meter"
  >
    <div className="m-fill h-full rounded-full" style={{ background: "var(--chart-1)", width: `${Math.min(value, 1) * 100}%` }} />
  </div>
);

/** A spread: where the average and the median sit between the smallest and the greatest. */
export const Spread = ({ min, avg, median, max, unit }: { min: number; avg: number; median: number; max: number; unit?: string }) => {
  const at = (v: number) => `${((v - min) / (max - min || 1)) * 100}%`;
  const fmt = (v: number) => `${compact(v).value}${compact(v).scale}`;
  const u = unit ? `\u00A0${unit}` : "";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="bg-muted relative h-1.5 rounded-full">
        {/* Between the median and the average the fill says how skewed the amounts are. */}
        <div
          className="m-fill absolute inset-y-0 rounded-full"
          style={{ background: "color-mix(in oklab, var(--chart-1) 30%, transparent)", insetInlineEnd: `calc(100% - ${at(Math.max(avg, median))})`, insetInlineStart: at(Math.min(avg, median)) }}
        />
        <Tip className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: at(median) }} tip={`Медиана ${exactOf(median)}${u}`}>
          <span className="bg-background block size-2.5 rounded-full ring-2 ring-[var(--chart-1)]" />
        </Tip>
        <Tip className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: at(avg) }} tip={`Среднее ${exactOf(avg)}${u}`}>
          <span className="block size-2.5 rounded-full" style={{ background: "var(--chart-1)" }} />
        </Tip>
      </div>
      <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
        <span>{fmt(min)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
};

/** A ranking: each row's bar is its share of the whole, so the bars add up to the picture. */
export const Bars = ({ items, whole, unit }: { items: { name: string; value: number }[]; whole: number; unit?: string }) => {
  const top = items[0]?.value ?? 1;
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li className="m-in grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-sm" key={item.name} style={at(i + 1)}>
          <span className="truncate" title={item.name}>
            {item.name}
          </span>
          <span className="bg-muted h-1.5 overflow-hidden rounded-full">
            <span className="m-fill block h-full rounded-full" style={{ background: "var(--chart-1)", opacity: 1 - i * 0.14, width: `${(item.value / top) * 100}%` }} />
          </span>
          <Tip className="text-muted-foreground text-xs tabular-nums" tip={`${exactOf(item.value)}${unit ? ` ${unit}` : ""} · ${percent((item.value / whole) * 100)} от всей выручки`}>
            {compact(item.value).value}
            {compact(item.value).scale}
          </Tip>
        </li>
      ))}
    </ol>
  );
};

/** A summary: plain facts, label and value, nothing between. */
export const Facts = ({ rows, wide = false }: { rows: { label: string; value: string; exact?: string }[]; wide?: boolean }) => (
  <dl className={cn("grid gap-x-10 gap-y-1.5 text-sm", wide && "@md:grid-cols-2")}>
    {rows.map((r, i) => (
      <div className="m-in flex items-baseline justify-between gap-3" key={r.label} style={at(i + 1)}>
        <dt className="text-muted-foreground">{r.label}</dt>
        <dd className="font-medium tabular-nums" title={r.exact}>
          {r.value}
        </dd>
      </div>
    ))}
  </dl>
);

/** What the metric's form says under its number, in one line: the goal, the share, the spread. */
export const caption = (m: Metric): string | null => {
  switch (m.form) {
    case "goal":
      return `из ${compact(m.target).value}${compact(m.target).scale}${m.unit ? ` ${m.unit}` : ""} · ${m.targetNote}`;
    case "share":
      return m.partLabel;
    default:
      return null;
  }
};

/** A placeholder of a block while the server builds the widget: pale shapes where the figures will be. */
export const Bone = ({ className }: { className?: string }) => <span aria-hidden className={cn("m-skel bg-muted block rounded-md", className)} />;
