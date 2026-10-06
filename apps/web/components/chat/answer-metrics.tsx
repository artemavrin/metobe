"use client";

import type { MetricResult } from "@metobe/contracts/metrics";
import { Skeleton } from "@metobe/ui/components/skeleton";
import { cn } from "@metobe/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Composition,
  Movers,
  Outliers,
  Pareto,
} from "@/components/chat/metric-forms";
import {
  Bars,
  DeltaBadge,
  Facts,
  Figure,
  Meter,
  METRICS_CSS,
  Spark,
  Spread,
  Tip,
  at,
  useMetricFormat,
} from "@/components/chat/metric-parts";
import { WidgetFailure, WidgetFrame } from "@/components/chat/widget-frame";
import type { MetricsPart } from "@/lib/answer-work";
import { metricsView } from "@/lib/metrics-data";

// Key figures the model builds in its answer (the prototype's «Полоса»: /dev/prototypes/metrics): no cards and no
// frame, the figures stand on the page like a printed table of key numbers. The first is large with its history beside
// it; the others are a grid of figures with a hairline picture under each; rankings and summaries go below, in two
// columns. Every figure is computed by the server from a tool's result — hovering its label says how.

/** How a figure was made, in words: the hover of its label. */
const useHow = () => {
  const t = useTranslations("chat.metrics");
  return (m: MetricResult) =>
    [
      m.aggregate ? t(`aggregate.${m.aggregate}`) : null,
      m.field ? `«${m.field}»` : null,
      m.by ? t("by", { by: m.by }) : null,
    ]
      .filter(Boolean)
      .join(" ");
};

const Stat = ({ m, i }: { m: MetricResult; i: number }) => {
  const t = useTranslations("chat.metrics");
  const f = useMetricFormat();
  const how = useHow();
  return (
    <div className="m-in flex min-w-0 flex-col gap-1.5" style={at(i)}>
      <Tip className="text-muted-foreground truncate text-xs" tip={how(m)}>
        {m.label}
      </Tip>
      {m.form === "goal" && m.value !== undefined && m.target !== undefined && (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <Figure unit={m.unit} value={m.value} />
            <Tip
              className="text-muted-foreground text-sm tabular-nums"
              tip={`${f.exact(m.value)} / ${f.exact(m.target)}`}
            >
              {f.percent((m.value / m.target) * 100, 0)}
            </Tip>
          </div>
          <Meter label={m.label} value={m.value / m.target} />
          <span className="text-muted-foreground truncate text-xs">
            {t("goalOf", { target: f.withUnit(f.short(m.target), m.unit) })}
          </span>
        </>
      )}
      {m.form === "share" && m.value !== undefined && m.whole ? (
        <>
          <Figure unit="%" value={(m.value / m.whole) * 100} />
          <Meter label={m.label} value={m.value / m.whole} />
          <span
            className="text-muted-foreground truncate text-xs"
            title={m.names?.join(", ")}
          >
            {m.names?.join(", ")}
          </span>
        </>
      ) : null}
      {m.form === "range" && m.range && (
        <>
          <div className="flex items-baseline gap-2">
            <Figure unit={m.unit} value={m.range.median} />
            <span className="text-muted-foreground text-xs">
              {t("aggregate.median").toLowerCase()}
            </span>
          </div>
          <Spread range={m.range} unit={m.unit} />
        </>
      )}
      {m.form === "value" && m.value !== undefined && (
        <Figure unit={m.unit} value={m.value} />
      )}
      {m.form === "trend" && m.value !== undefined && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Figure unit={m.unit} value={m.value} />
            {m.delta && (
              <DeltaBadge bucket={m.bucket} delta={m.delta} unit={m.unit} />
            )}
          </div>
          {m.series && (
            <Spark
              bucket={m.bucket}
              height={28}
              series={m.series}
              unit={m.unit}
            />
          )}
        </>
      )}
    </div>
  );
};

/** The first figure, big: its change beside it, its history across the row. */
const Hero = ({ m }: { m: MetricResult }) => {
  const how = useHow();
  if (m.value === undefined) {
    return null;
  }
  return (
    <div
      className="m-in flex flex-col gap-4 @lg:flex-row @lg:items-end @lg:justify-between"
      style={at(0)}
    >
      <div className="flex flex-col gap-1.5">
        <Tip className="text-muted-foreground text-sm" tip={how(m)}>
          {m.label}
        </Tip>
        <Figure size="xl" unit={m.unit} value={m.value} />
        {m.delta && (
          <div className="flex items-center gap-2">
            <DeltaBadge bucket={m.bucket} delta={m.delta} unit={m.unit} />
          </div>
        )}
      </div>
      {m.series && (
        <Spark
          bucket={m.bucket}
          className="w-full @lg:max-w-sm"
          height={64}
          series={m.series}
          unit={m.unit}
        />
      )}
    </div>
  );
};

/** The forms that need room: a list, a ranking, a story told in rows. They go below the figures, two to a row. */
const LIST_FORMS = new Set<MetricResult["form"]>([
  "ranking",
  "summary",
  "movers",
  "pareto",
  "outliers",
  "composition",
]);

const ListBlock = ({ m, i }: { m: MetricResult; i: number }) => {
  const how = useHow();
  return (
    <div className="m-in flex min-w-0 flex-col gap-2.5" style={at(i)}>
      <Tip className="text-muted-foreground text-xs" tip={how(m)}>
        {m.label}
      </Tip>
      {m.form === "ranking" && m.items && (
        <Bars items={m.items} unit={m.unit} whole={m.whole} />
      )}
      {m.form === "summary" && m.facts && (
        <Facts facts={m.facts} unit={m.unit} />
      )}
      {m.form === "movers" && <Movers m={m} />}
      {m.form === "pareto" && <Pareto m={m} />}
      {m.form === "outliers" && <Outliers m={m} />}
      {m.form === "composition" && <Composition m={m} />}
    </div>
  );
};

const Bones = ({ n }: { n: number }) => (
  <div aria-hidden className="flex flex-col gap-6">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-12 w-56" />
    </div>
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 @lg:grid-cols-3">
      {Array.from({ length: Math.min(n - 1, 6) }, (_, i) => (
        <div className="flex flex-col gap-2" key={i}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-1.5 w-full" />
        </div>
      ))}
    </div>
  </div>
);

/** The figures of a built widget: the first big, the rest as a grid, the lists below, and where they come from. */
const Figures = ({ items, rows }: { items: MetricResult[]; rows: number }) => {
  const t = useTranslations("chat.metrics");
  const f = useMetricFormat();
  const [first] = items;
  // The first figure is shown big when it is a number with or without its history; anything else starts the lists.
  const hero =
    first?.form === "trend" || first?.form === "value" ? first : undefined;
  const rest = hero ? items.slice(1) : items;
  const stats = rest.filter((m) => !LIST_FORMS.has(m.form));
  const lists = rest.filter((m) => LIST_FORMS.has(m.form));
  return (
    <>
      {hero && <Hero m={hero} />}
      {stats.length > 0 && (
        <div
          className={cn(
            "grid grid-cols-2 gap-x-6 gap-y-5 @lg:grid-cols-3",
            hero && "border-t pt-5"
          )}
        >
          {stats.map((m, i) => (
            <Stat i={i + 1} key={`${m.label}:${i}`} m={m} />
          ))}
        </div>
      )}
      {lists.length > 0 && (
        <div
          className={cn(
            "grid gap-x-10 gap-y-8 @lg:grid-cols-2",
            (hero || stats.length > 0) && "border-t pt-5"
          )}
        >
          {lists.map((m, i) => (
            <ListBlock i={stats.length + i + 1} key={`${m.label}:${i}`} m={m} />
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        {[
          items.some((m) => m.delta) ? t("changeNote") : null,
          t("source", { rows: f.exact(rows) }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </>
  );
};

export const AnswerMetrics = ({ part }: { part: MetricsPart }) => {
  const t = useTranslations("chat.metrics");
  const view = metricsView(part);
  // Fixed at the first render: figures built as the model wrote them play their arrival, ones opened from the
  // history do not.
  // oxlint-disable-next-line react/hook-use-state -- made once and never changed: no setter to name
  const [live] = useState(() => part.state !== "output-available");
  const ready = view.items.length > 0;
  return (
    <div className="m-root @container w-full" data-live={live ? "" : undefined}>
      <style>{METRICS_CSS}</style>
      <WidgetFrame
        building={t("building")}
        framed={false}
        meta={ready ? t("count", { count: view.items.length }) : undefined}
        streaming={view.streaming}
        title={view.title}
      >
        <div className="flex flex-col gap-6 px-1 pt-3 pb-1">
          {view.error !== undefined && (
            <WidgetFailure reason={view.error} title={t("failed")} />
          )}
          {view.error === undefined && view.streaming && (
            <Bones n={view.coming} />
          )}
          {view.error === undefined && !view.streaming && ready && (
            <Figures items={view.items} rows={view.rows} />
          )}
        </div>
      </WidgetFrame>
    </div>
  );
};
