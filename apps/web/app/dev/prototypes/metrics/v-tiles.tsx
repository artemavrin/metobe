"use client";

import { cn } from "@metobe/ui/lib/utils";

import { WidgetFrame } from "@/components/chat/widget-frame";

import { Bars, Bone, DeltaBadge, Facts, Figure, Meter, Spark, Spread, METRICS_CSS, Tip, at, caption } from "./atoms";
import { Failure } from "./chat";
import { FROM_NOTE } from "./data";
import type { Metric, Scenario } from "./data";
import { exactOf, percent } from "./format";
import { useProto } from "./state";

// «Плитки»: every metric in its own card, two to a row, the first one wide when the rest pair up. The label and the
// change on the card's top line, the figure, and under it what the form adds — a history, a bar to the goal, a spread.
// The most conventional of the three, and the one that reads at a glance when there are four to six.

const Body = ({ m }: { m: Metric }) => {
  switch (m.form) {
    case "value":
      return <Figure value={m.value} unit={m.unit} />;
    case "delta":
      return (
        <Figure unit={m.unit} value={m.value} />
      );
    case "trend":
      return (
        <>
          <Figure unit={m.unit} value={m.value} />
          <Spark className="-mx-0.5 mt-1" series={m.series} unit={m.unit} />
        </>
      );
    case "goal": {
      const done = m.value / m.target;
      return (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <Figure unit={m.unit} value={m.value} />
            <Tip className="text-muted-foreground text-sm tabular-nums" tip={`${exactOf(m.value)} из ${exactOf(m.target)}`}>
              {percent(done * 100, 0)}
            </Tip>
          </div>
          <Meter label={m.label} value={done} />
          <span className="text-muted-foreground text-xs">{caption(m)}</span>
        </>
      );
    }
    case "share":
      return (
        <>
          <Figure unit="%" value={(m.value / m.whole) * 100} />
          <Meter label={m.label} value={m.value / m.whole} />
          <span className="text-muted-foreground truncate text-xs" title={m.partLabel}>
            {m.partLabel}
          </span>
        </>
      );
    case "range":
      return (
        <>
          <div className="flex items-baseline gap-2">
            <Figure unit={m.unit} value={m.median} />
            <span className="text-muted-foreground text-xs">медиана</span>
          </div>
          <Spread {...m} />
        </>
      );
    case "ranking":
      return <Bars items={m.items} unit={m.unit} whole={m.whole} />;
    case "summary":
      return <Facts rows={m.rows} />;
  }
};

const Tile = ({ m, i, wide }: { m: Metric; i: number; wide: boolean }) => (
  <div className={cn("m-in bg-card flex flex-col gap-2 rounded-xl border p-3.5", wide && "@md:col-span-2")} style={at(i)}>
    <div className="flex min-h-5 items-center justify-between gap-2">
      <Tip className="text-muted-foreground min-w-0 truncate text-xs" tip={m.source}>
        {m.label}
      </Tip>
      {"delta" in m && <DeltaBadge delta={m.delta} />}
    </div>
    <Body m={m} />
  </div>
);

const Bones = ({ n }: { n: number }) => (
  <div className="grid grid-cols-1 gap-2 @md:grid-cols-2">
    {Array.from({ length: n }, (_, i) => (
      <div className={cn("bg-card flex flex-col gap-2.5 rounded-xl border p-3.5", n % 2 === 1 && i === 0 && n > 1 && "@md:col-span-2")} key={i}>
        <Bone className="h-3 w-24" />
        <Bone className="h-7 w-32" />
        <Bone className="h-8 w-full" />
      </div>
    ))}
  </div>
);

export const Tiles = ({ scenario }: { scenario: Scenario }) => {
  const { status, arrival } = useProto();
  const n = scenario.metrics.length;
  // The first card is wide when the others pair up: the grid has no hole.
  const heroWide = n % 2 === 1;
  return (
    <div className="@container m-root w-full" data-live={arrival === "live" ? "" : undefined}>
      <style>{METRICS_CSS}</style>
      <WidgetFrame building="Считает показатели…" framed={false} meta={status === "ready" ? `${n} ${n === 1 ? "показатель" : "показателей"}` : undefined} streaming={status === "building"} title={scenario.title}>
        <div className="pt-1">
          {status === "building" && <Bones n={n} />}
          {status === "error" && <Failure />}
          {status === "ready" && (
            <>
              <div className="grid grid-cols-1 gap-2 @md:grid-cols-2">
                {scenario.metrics.map((m, i) => (
                  <Tile i={i} key={m.id} m={m} wide={heroWide && i === 0} />
                ))}
              </div>
              <p className="text-muted-foreground mt-2 px-1 text-xs">{FROM_NOTE}</p>
            </>
          )}
        </div>
      </WidgetFrame>
    </div>
  );
};
