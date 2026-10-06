"use client";

import { cn } from "@metobe/ui/lib/utils";

import { WidgetFrame } from "@/components/chat/widget-frame";

import { Bars, Bone, DeltaBadge, Facts, Figure, Meter, Spark, Spread, METRICS_CSS, Tip, at, caption } from "./atoms";
import { Failure } from "./chat";
import { FROM_NOTE } from "./data";
import type { Metric, Scenario } from "./data";
import { exactOf, percent } from "./format";
import { useProto } from "./state";

// «Лента»: one framed card like the table's, a row per metric — the name and what it adds on the left, a small
// picture of it in the middle (a history, a bar, a spread), the figure and its change on the right. The first metric
// is the hero: the figure big, its history wide under it. Densest of the three: nine metrics fit a screen.

/** The middle of a row: the picture of the form, small. */
const Micro = ({ m }: { m: Metric }) => {
  switch (m.form) {
    case "trend":
      return <Spark height={30} series={m.series} unit={m.unit} />;
    case "goal":
      return <Meter label={m.label} value={m.value / m.target} />;
    case "share":
      return <Meter label={m.label} value={m.value / m.whole} />;
    case "range":
      return <Spread {...m} />;
    default:
      return null;
  }
};

/** The right of a row: the figure, and under it the change. */
const Value = ({ m }: { m: Metric }) => {
  switch (m.form) {
    case "goal":
      return (
        <>
          <Figure size="md" unit={m.unit} value={m.value} />
          <Tip className="text-muted-foreground text-xs tabular-nums" tip={`${exactOf(m.value)} из ${exactOf(m.target)}`}>
            {percent((m.value / m.target) * 100, 0)} плана
          </Tip>
        </>
      );
    case "share":
      return <Figure size="md" unit="%" value={(m.value / m.whole) * 100} />;
    case "range":
      return (
        <>
          <Figure size="md" unit={m.unit} value={m.median} />
          <span className="text-muted-foreground text-xs">медиана</span>
        </>
      );
    case "value":
      return <Figure size="md" unit={m.unit} value={m.value} />;
    case "delta":
    case "trend":
      return (
        <div className="flex items-center gap-2">
          <DeltaBadge delta={m.delta} />
          <Figure size="md" unit={m.unit} value={m.value} />
        </div>
      );
    default:
      return null;
  }
};

const Row = ({ m, i }: { m: Metric; i: number }) => {
  if (m.form === "ranking" || m.form === "summary") {
    return (
      <div className="m-in flex flex-col gap-2.5 border-t px-3.5 py-3" style={at(i)}>
        <Tip className="text-sm" tip={m.source}>
          {m.label}
        </Tip>
        {m.form === "ranking" ? <Bars items={m.items} unit={m.unit} whole={m.whole} /> : <Facts rows={m.rows} wide />}
      </div>
    );
  }
  return (
    <div className="m-in flex items-center gap-4 border-t px-3.5 py-2.5" style={at(i)}>
      <div className="flex min-w-0 flex-1 flex-col">
        <Tip className="text-sm text-pretty" tip={m.source}>
          {m.label}
        </Tip>
        {caption(m) && (
          <span className="text-muted-foreground text-xs text-pretty">
            {caption(m)}
          </span>
        )}
      </div>
      <div className="hidden w-32 shrink-0 @md:block">
        <Micro m={m} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 @md:w-44">
        <Value m={m} />
      </div>
    </div>
  );
};

/** The first metric, big: the figure and its change, the history across the whole row. */
const Hero = ({ m }: { m: Metric }) => {
  if (m.form !== "trend" && m.form !== "delta" && m.form !== "value") {
    return <Row i={0} m={m} />;
  }
  return (
    <div className="m-in flex flex-col gap-3 px-3.5 pt-3.5 pb-3" style={at(0)}>
      <div className="flex items-center justify-between gap-2">
        <Tip className="text-muted-foreground text-sm" tip={m.source}>
          {m.label}
        </Tip>
        {"delta" in m && <DeltaBadge delta={m.delta} showVersus />}
      </div>
      <Figure size="xl" unit={m.unit} value={m.value} />
      {m.form === "trend" && <Spark height={56} series={m.series} unit={m.unit} />}
    </div>
  );
};

const Bones = ({ n }: { n: number }) => (
  <div>
    <div className="flex flex-col gap-3 px-3.5 py-3.5">
      <Bone className="h-3 w-20" />
      <Bone className="h-10 w-48" />
      <Bone className="h-12 w-full" />
    </div>
    {Array.from({ length: Math.min(n - 1, 5) }, (_, i) => (
      <div className="flex items-center gap-4 border-t px-3.5 py-3" key={i}>
        <Bone className="h-3.5 flex-1" />
        <Bone className="hidden h-6 w-32 @md:block" />
        <Bone className="h-5 w-24" />
      </div>
    ))}
  </div>
);

export const Ledger = ({ scenario }: { scenario: Scenario }) => {
  const { status, arrival } = useProto();
  const [first, ...rest] = scenario.metrics;
  const n = scenario.metrics.length;
  return (
    <div className="@container m-root w-full" data-live={arrival === "live" ? "" : undefined}>
      <style>{METRICS_CSS}</style>
      <WidgetFrame building="Считает показатели…" meta={status === "ready" ? `${n} ${n === 1 ? "показатель" : "показателей"}` : undefined} streaming={status === "building"} title={scenario.title}>
        {status === "building" && <Bones n={n} />}
        {status === "error" && <Failure />}
        {status === "ready" && first && (
          <>
            <Hero m={first} />
            {rest.map((m, i) => (
              <Row i={i + 1} key={m.id} m={m} />
            ))}
            <p className={cn("text-muted-foreground border-t px-3.5 py-2 text-xs")}>{FROM_NOTE}</p>
          </>
        )}
      </WidgetFrame>
    </div>
  );
};
