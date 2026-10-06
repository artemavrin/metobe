"use client";

import { Button } from "@metobe/ui/components/button";
import { Skeleton } from "@metobe/ui/components/skeleton";
import { Table2, ChartColumn } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { ReactNode } from "react";

import { useChartFormat } from "@/components/chat/chart-format";
import type { Format } from "@/components/chat/chart-format";
import { WidgetFailure, WidgetFrame } from "@/components/chat/widget-frame";
import type { ChartPart } from "@/lib/answer-work";
import { chartView, pieSlices } from "@/lib/chart-data";
import type { ChartView } from "@/lib/chart-data";

// A chart the model builds in its answer (evilcharts on ECharts): its frame first, then the points landing as the
// model writes them — the chart grows. The chart's own code is loaded when the first chart appears, not with the
// chat. The reveal animation plays for a chart that was there whole (a chat opened from history), not for one that
// grew as the model wrote it: redrawing a reveal on every point would flicker.

/** Rings and pies read as a ring; the rest as bars — for the skeleton and the height. */
const ringed = (kind: ChartView["kind"]) =>
  kind === "pie" || kind === "radial" || kind === "radar";

/** Before the first points: the chart's shape, pale — bars for a chart with axes, a ring for a ring. */
const ChartSkeleton = ({ ring }: { ring: boolean }) =>
  ring ? (
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

// ssr: false — a canvas has nothing to draw on the server; the skeleton holds the place while the code loads.
const ChartBody = dynamic(() => import("@/components/chat/answer-chart-body"), {
  loading: () => <ChartSkeleton ring={false} />,
  ssr: false,
});

/** The numbers under the chart, as a table: for a reader who wants them exactly — or cannot tell two colors apart. */
const ChartData = ({ view, fmt }: { view: ChartView; fmt: Format }) => (
  <div className="max-h-72 overflow-auto rounded-lg border p-2 text-sm">
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-muted-foreground text-left text-xs">
          <th className="px-2 py-1.5 font-medium">{view.x.label}</th>
          {view.series.map((s) => (
            <th className="px-2 py-1.5 text-right font-medium" key={s.key}>
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {view.points.map((p) => (
          <tr className="border-t" key={String(p.x)}>
            <td className="px-2 py-1.5">{fmt.x(p.x, "full")}</td>
            {view.series.map((s) => {
              const value = p[s.key];
              return (
                <td className="px-2 py-1.5 text-right tabular-nums" key={s.key}>
                  {typeof value === "number" ? fmt.value(value, s) : "—"}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** A chart's kinds whose numbers already stand beside it (a ring's list), so they need no table. */
const listed = (kind: ChartView["kind"]) => kind === "pie" || kind === "radial";

export const AnswerChart = ({ part }: { part: ChartPart }) => {
  const t = useTranslations("chat.chart");
  const view = chartView(part);
  const fmt = useChartFormat(view);
  const [table, setTable] = useState(false);
  // Fixed at the first render: a chart that begins streaming never plays its reveal, one that begins whole does.
  // oxlint-disable-next-line react/hook-use-state -- made once and never changed: no setter to name
  const [animate] = useState(() => part.state !== "input-streaming");
  const ring = ringed(view.kind);
  const shares = listed(view.kind);
  const ready = view.series.length > 0 && view.points.length > 0;
  let meta: string | undefined;
  if (ready) {
    // A total is for shares of a whole; rings of progress do not add up.
    meta =
      view.kind === "pie"
        ? t("total", {
            value: fmt.value(
              pieSlices(view, "").reduce((sum, s) => sum + s.value, 0),
              view.series[0]
            ),
          })
        : t("points", { count: view.points.length });
  }
  let body: ReactNode = null;
  if (view.error !== undefined) {
    body = <WidgetFailure reason={view.error} title={t("failed")} />;
  } else if (ready && table && !shares) {
    body = <ChartData fmt={fmt} view={view} />;
  } else if (ready) {
    body = <ChartBody animate={animate} fmt={fmt} view={view} />;
  } else if (view.streaming) {
    body = <ChartSkeleton ring={ring} />;
  } else {
    body = <p className="text-muted-foreground p-4 text-sm">{t("noData")}</p>;
  }
  return (
    <WidgetFrame
      actions={
        ready &&
        !shares && (
          <Button
            aria-pressed={table}
            onClick={() => setTable((v) => !v)}
            size="xs"
            variant="ghost"
          >
            {table ? <ChartColumn /> : <Table2 />}
            <span className="max-sm:sr-only">
              {table ? t("showChart") : t("showData")}
            </span>
          </Button>
        )
      }
      building={t("building")}
      framed={false}
      meta={meta}
      streaming={view.streaming}
      title={view.title}
    >
      <div className="pt-1">{body}</div>
    </WidgetFrame>
  );
};
