"use client";

import type { MetricResult } from "@metobe/contracts/metrics";
import { cn } from "@metobe/ui/lib/utils";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { ReactNode } from "react";

import {
  Tip,
  at,
  useBucketLabels,
  useMetricFormat,
} from "@/components/chat/metric-parts";

// The forms of the strip that tell what happened, not what the number is (prototype /dev/prototypes/metrics-forms):
// who grew and who fell, the Pareto / ABC split, the outliers, a whole as parts. Each in the look picked there —
// a diverging row, rows with classes (a curve past fifteen groups), a strip plot with its list, one stacked bar.
// Colored only where the color means good or bad; the one accent is the theme's first chart color.

const GOOD = "var(--success)";
const BAD = "var(--destructive)";
const ACCENT = "var(--chart-1)";
const NBSP = " ";

/** A big figure and what it counts: «8 из 12 — значений дают 80 % итога». */
const Headline = ({
  big,
  small,
  note,
}: {
  big: ReactNode;
  small: string;
  note?: string;
}) => (
  <div className="m-in flex flex-col gap-1" style={at(0)}>
    <span className="text-3xl font-medium tracking-tight tabular-nums sm:text-4xl">
      {big}
    </span>
    <span className="text-sm">{small}</span>
    {note && <span className="text-muted-foreground text-xs">{note}</span>}
  </div>
);

/** A signed figure: the sign is part of the figure, never dropped. */
const useSigned = () => {
  const f = useMetricFormat();
  return (n: number, unit?: string) => {
    let sign = "";
    if (n > 0) {
      sign = "+";
    } else if (n < 0) {
      sign = "−";
    }
    return f.withUnit(`${sign}${f.short(Math.abs(n))}`, unit);
  };
};

// ═══ Who grew and who fell ═════════════════════════════════════════════════════════════════════════════════════

export const Movers = ({ m }: { m: MetricResult }) => {
  const t = useTranslations("chat.metrics");
  const f = useMetricFormat();
  const signed = useSigned();
  const labels = useBucketLabels();
  const rows = m.movers ?? [];
  const net = m.net ?? 0;
  const [from, to] = labels(
    [m.period?.from ?? "", m.period?.to ?? ""],
    m.bucket ?? "month"
  );
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.change)), 1e-9);
  const good = (n: number) => n > 0 === (m.good !== "down");
  const tone = (n: number) => {
    if (n === 0) {
      return "currentColor";
    }
    return good(n) ? GOOD : BAD;
  };
  return (
    <div className="flex flex-col gap-5">
      <Headline
        big={<span style={{ color: tone(net) }}>{signed(net, m.unit)}</span>}
        note={t("movers.note", {
          by: m.by ?? "",
          from: from ?? "",
          to: to ?? "",
        })}
        small={t("movers.small", { down: m.down ?? 0, up: m.up ?? 0 })}
      />
      <ol className="flex flex-col gap-1.5">
        {rows.map((r, i) => {
          const w = (Math.abs(r.change) / maxAbs) * 50;
          const color = tone(r.change);
          const up = r.change > 0;
          return (
            <li
              className="m-in grid grid-cols-[minmax(0,7.5rem)_1fr_4.75rem] items-center gap-2 text-sm"
              key={r.name}
              style={at(i + 1)}
            >
              <span className="truncate" title={r.name}>
                {r.name}
              </span>
              <span className="relative h-5">
                <span
                  aria-hidden
                  className="bg-foreground/15 absolute inset-y-0 left-1/2 w-px"
                />
                <span
                  className="m-fill absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                  style={{
                    background: color,
                    left: up ? "50%" : `${50 - w}%`,
                    transformOrigin: up ? "left center" : "right center",
                    width: `${w}%`,
                  }}
                />
              </span>
              <Tip
                className="text-right text-xs tabular-nums"
                tip={`${f.exact(r.before)} → ${f.exact(r.after)}${r.pct === null ? "" : ` · ${r.pct > 0 ? "+" : ""}${f.percent(r.pct)}`}`}
              >
                <span style={{ color }}>{signed(r.change, m.unit)}</span>
              </Tip>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

// ═══ Pareto / ABC ══════════════════════════════════════════════════════════════════════════════════════════════

const CLASS_OPACITY = { A: 1, B: 0.55, C: 0.25 } as const;
/** Up to this many groups every one gets its row; past it the curve says it. */
const ROWS_UP_TO = 15;

const ParetoCurve = ({
  curve,
  n80,
  groups,
}: {
  curve: number[];
  n80: number;
  groups: number;
}) => {
  const t = useTranslations("chat.metrics");
  const id = useId();
  const w = 400;
  const h = 100;
  const n = curve.length;
  const pts: [number, number][] = [
    [0, h],
    ...curve.map((c, i): [number, number] => [((i + 1) / n) * w, h - c * h]),
  ];
  const d = pts
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join("");
  const x80 = (n80 / groups) * w;
  return (
    <div className="m-in relative" style={at(1)}>
      <div className="m-draw">
        <svg
          aria-hidden
          className="w-full overflow-visible"
          viewBox={`0 0 ${w} ${h}`}
        >
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line
            stroke="currentColor"
            strokeDasharray="3 4"
            strokeOpacity="0.25"
            x1="0"
            x2={w}
            y1={h * 0.2}
            y2={h * 0.2}
          />
          <line
            stroke="currentColor"
            strokeDasharray="3 4"
            strokeOpacity="0.25"
            x1={x80}
            x2={x80}
            y1={h * 0.2}
            y2={h}
          />
          <path d={`${d}L${w} ${h}L0 ${h}Z`} fill={`url(#${id})`} />
          <path
            d={d}
            fill="none"
            stroke={ACCENT}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <span
        aria-hidden
        className="m-late bg-background pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--chart-1)]"
        style={{ left: `${(x80 / w) * 100}%`, top: `${20}%` }}
      />
      <span className="text-muted-foreground absolute -top-5 right-0 text-xs">
        100{NBSP}%
      </span>
      <span className="text-muted-foreground absolute top-[18%] right-0 -translate-y-full text-xs">
        80{NBSP}%
      </span>
      <div className="text-muted-foreground mt-1 flex justify-between text-xs">
        <span>{t("pareto.axis", { count: 0 })}</span>
        <span>{groups}</span>
      </div>
    </div>
  );
};

export const Pareto = ({ m }: { m: MetricResult }) => {
  const t = useTranslations("chat.metrics");
  const f = useMetricFormat();
  const rows = m.pareto ?? [];
  const groups = m.groupCount ?? rows.length;
  const top = rows[0]?.value ?? 1;
  const listed = groups <= ROWS_UP_TO;
  return (
    <div className="flex flex-col gap-4">
      <Headline
        big={t("pareto.big", { all: groups, n: m.n80 ?? 0 })}
        note={t("pareto.note", { by: m.by ?? "", field: m.field ?? "" })}
        small={t("pareto.small")}
      />
      {listed ? (
        <ol className="flex flex-col">
          {rows.map((p, i) => {
            const next = rows[i + 1];
            return (
              <li
                className={cn(
                  "m-in grid grid-cols-[1.25rem_minmax(0,7.5rem)_1fr_3.5rem_2.75rem] items-center gap-2 py-[5px] text-sm",
                  next && next.cls !== p.cls && "border-b border-dashed"
                )}
                key={p.name}
                style={at(i + 1)}
              >
                <span className="text-muted-foreground text-xs">{p.cls}</span>
                <span className="truncate" title={p.name}>
                  {p.name}
                </span>
                <span className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <span
                    className="m-fill block h-full rounded-full"
                    style={{
                      background: ACCENT,
                      opacity: CLASS_OPACITY[p.cls],
                      width: `${(p.value / top) * 100}%`,
                    }}
                  />
                </span>
                <Tip
                  className="text-muted-foreground text-right text-xs tabular-nums"
                  tip={f.withUnit(f.exact(p.value), m.unit)}
                >
                  {f.short(p.value)}
                </Tip>
                <span className="text-right text-xs tabular-nums">
                  {f.percent(p.cum * 100, 0)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <ParetoCurve curve={m.curve ?? []} groups={groups} n80={m.n80 ?? 0} />
      )}
      <div
        className="m-in grid grid-cols-3 gap-4 border-t pt-3"
        style={at(rows.length + 2)}
      >
        {(m.classes ?? []).map((c) => (
          <div className="flex flex-col gap-0.5" key={c.cls}>
            <span className="flex items-center gap-1.5 text-xs">
              <span
                className="size-2 rounded-full"
                style={{ background: ACCENT, opacity: CLASS_OPACITY[c.cls] }}
              />
              {t("pareto.class", { cls: c.cls })}
            </span>
            <span className="text-sm font-medium tabular-nums">
              {t("pareto.count", { count: c.count })}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {t("pareto.share", { share: f.percent(c.share * 100, 0) })}
            </span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{t("pareto.legend")}</p>
    </div>
  );
};

// ═══ Outliers ══════════════════════════════════════════════════════════════════════════════════════════════════

/** A stable vertical scatter for a value by its place, so the strip does not shimmer between renders. */
const jitter = (i: number) => ((i * 2_654_435_761) % 1000) / 1000;
const LISTED = 3;

export const Outliers = ({ m }: { m: MetricResult }) => {
  const t = useTranslations("chat.metrics");
  const f = useMetricFormat();
  const format = useFormatter();
  const q = m.quartiles;
  const values = m.values ?? [];
  const fence = m.fence ?? 0;
  const median = q?.median ?? 0;
  const max = Math.max(q?.max ?? 1, 1e-9);
  const w = 400;
  const h = 64;
  const x = (v: number) => (v / max) * (w - 6) + 3;
  const count = m.outlierCount ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <Headline
        big={
          count === 0
            ? t("outliers.none")
            : t("outliers.big", { all: f.exact(m.count ?? 0), n: count })
        }
        note={t("outliers.note", { fence: f.withUnit(f.short(fence), m.unit) })}
        small={count === 0 ? t("outliers.noneSmall") : t("outliers.small")}
      />
      <div className="m-in" style={at(1)}>
        <svg
          aria-hidden
          className="w-full overflow-visible"
          viewBox={`0 0 ${w} ${h}`}
        >
          {values.map((v, i) => (
            <circle
              cx={x(v)}
              cy={6 + jitter(i) * (h - 12)}
              fill={v > fence ? "var(--chart-2)" : ACCENT}
              fillOpacity={v > fence ? 0.9 : 0.28}
              key={i}
              r={v > fence ? 2.3 : 1.8}
            />
          ))}
          <line
            stroke="currentColor"
            strokeDasharray="3 3"
            strokeOpacity="0.45"
            x1={x(fence)}
            x2={x(fence)}
            y1="0"
            y2={h}
          />
          <line
            stroke="currentColor"
            strokeOpacity="0.5"
            x1={x(median)}
            x2={x(median)}
            y1="0"
            y2={h}
          />
        </svg>
        <div className="text-muted-foreground relative mt-1 h-4 text-xs">
          <span
            className="absolute -translate-x-1/2"
            style={{ left: `${(x(median) / w) * 100}%` }}
          >
            {t("outliers.median")}
          </span>
          {count > 0 && (
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${(x(fence) / w) * 100}%` }}
            >
              {t("outliers.fence")}
            </span>
          )}
          <span className="absolute right-0">{f.short(max)}</span>
        </div>
      </div>
      <ol className="flex flex-col gap-1.5">
        {(m.outliers ?? []).slice(0, LISTED).map((o, i) => (
          <li
            className="m-in flex items-baseline justify-between gap-3 text-sm"
            key={`${o.name}${o.date}${o.value}${i}`}
            style={at(i + 2)}
          >
            <span className="truncate">
              {o.name}
              {o.date && (
                <span className="text-muted-foreground ms-1.5 text-xs">
                  {format.dateTime(new Date(`${o.date}T00:00:00Z`), {
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  })}
                </span>
              )}
            </span>
            <Tip
              className="text-xs tabular-nums"
              tip={f.withUnit(f.exact(o.value), m.unit)}
            >
              <span className="font-medium">
                {f.withUnit(f.short(o.value), m.unit)}
              </span>
              {median > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · ×{Math.round(o.value / median)}
                </span>
              )}
            </Tip>
          </li>
        ))}
      </ol>
    </div>
  );
};

// ═══ A whole as parts ══════════════════════════════════════════════════════════════════════════════════════════

const TONES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];
const REST = "color-mix(in oklab, var(--muted-foreground) 45%, transparent)";

export const Composition = ({ m }: { m: MetricResult }) => {
  const t = useTranslations("chat.metrics");
  const f = useMetricFormat();
  const [hover, setHover] = useState<number | null>(null);
  const parts = m.parts ?? [];
  const whole = m.whole ?? 1;
  const nameOf = (p: (typeof parts)[number]) =>
    p.rest ? t("composition.rest", { count: p.count ?? 0 }) : p.name;
  const [first] = parts;
  return (
    <div className="flex flex-col gap-5">
      <Headline
        big={f.percent(((first?.value ?? 0) / whole) * 100, 0)}
        note={t("composition.note", {
          by: m.by ?? "",
          total: f.withUnit(f.short(whole), m.unit),
        })}
        small={t("composition.small", { name: first ? nameOf(first) : "" })}
      />
      <div className="m-in flex h-3 gap-0.5" style={at(1)}>
        {parts.map((p, i) => (
          <Tip
            className="block h-full first:[&>span]:rounded-s-full last:[&>span]:rounded-e-full"
            key={p.name + i}
            style={{ flexBasis: 0, flexGrow: p.value }}
            tip={`${nameOf(p)} · ${f.withUnit(f.exact(p.value), m.unit)}`}
          >
            <span
              className="m-fill block h-full transition-opacity duration-150"
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              style={{
                background: p.rest ? REST : TONES[i % TONES.length],
                opacity: hover === null || hover === i ? 1 : 0.4,
              }}
            />
          </Tip>
        ))}
      </div>
      <ul className="flex max-w-md flex-col gap-1.5">
        {parts.map((p, i) => (
          <li
            className="m-in grid grid-cols-[0.5rem_minmax(0,1fr)_auto_auto] items-center gap-2 text-sm transition-opacity duration-150"
            key={p.name + i}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            style={{
              ...at(i + 2),
              opacity: hover === null || hover === i ? 1 : 0.45,
            }}
          >
            <span
              className="size-2 rounded-full"
              style={{ background: p.rest ? REST : TONES[i % TONES.length] }}
            />
            <span className="truncate">{nameOf(p)}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {f.short(p.value)}
            </span>
            <span className="w-10 text-right text-xs font-medium tabular-nums">
              {f.percent((p.value / whole) * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
