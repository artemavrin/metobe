"use client";

import { WidgetFrame } from "@/components/chat/widget-frame";

import { Bars, Bone, DeltaBadge, Facts, Figure, Meter, Spark, Spread, METRICS_CSS, Tip, at, caption } from "./atoms";
import { Failure } from "./chat";
import { FROM_NOTE } from "./data";
import type { Metric, Scenario } from "./data";
import { exactOf, percent } from "./format";
import { useProto } from "./state";

// «Полоса»: no cards, no frame — the figures stand on the page like a printed table of key numbers. The first one is
// large with its history beside it; the others are a grid of figures with a hairline picture under each; rankings and
// summaries go below, in two columns. Structure is felt, not drawn: the least chrome of the three.

const Stat = ({ m, i }: { m: Metric; i: number }) => (
  <div className="m-in flex min-w-0 flex-col gap-1.5" style={at(i)}>
    <Tip className="text-muted-foreground truncate text-xs" tip={m.source}>
      {m.label}
    </Tip>
    {m.form === "goal" && (
      <>
        <div className="flex items-baseline justify-between gap-2">
          <Figure unit={m.unit} value={m.value} />
          <Tip className="text-muted-foreground text-sm tabular-nums" tip={`${exactOf(m.value)} из ${exactOf(m.target)}`}>
            {percent((m.value / m.target) * 100, 0)}
          </Tip>
        </div>
        <Meter label={m.label} value={m.value / m.target} />
        <span className="text-muted-foreground truncate text-xs">{caption(m)}</span>
      </>
    )}
    {m.form === "share" && (
      <>
        <Figure unit="%" value={(m.value / m.whole) * 100} />
        <Meter label={m.label} value={m.value / m.whole} />
        <span className="text-muted-foreground truncate text-xs" title={m.partLabel}>
          {m.partLabel}
        </span>
      </>
    )}
    {m.form === "range" && (
      <>
        <div className="flex items-baseline gap-2">
          <Figure unit={m.unit} value={m.median} />
          <span className="text-muted-foreground text-xs">медиана</span>
        </div>
        <Spread {...m} />
      </>
    )}
    {m.form === "value" && <Figure unit={m.unit} value={m.value} />}
    {m.form === "delta" && (
      <>
        <Figure unit={m.unit} value={m.value} />
        <div className="flex items-center gap-2">
          <DeltaBadge delta={m.delta} />
        </div>
      </>
    )}
    {m.form === "trend" && (
      <>
        <div className="flex items-center justify-between gap-2">
          <Figure unit={m.unit} value={m.value} />
          <DeltaBadge delta={m.delta} />
        </div>
        <Spark height={28} series={m.series} unit={m.unit} />
      </>
    )}
  </div>
);

const Hero = ({ m }: { m: Metric }) => {
  if (m.form !== "trend" && m.form !== "delta" && m.form !== "value") {
    return <Stat i={0} m={m} />;
  }
  return (
    <div className="m-in flex flex-col gap-4 @lg:flex-row @lg:items-end @lg:justify-between" style={at(0)}>
      <div className="flex flex-col gap-1.5">
        <Tip className="text-muted-foreground text-sm" tip={m.source}>
          {m.label}
        </Tip>
        <Figure size="xl" unit={m.unit} value={m.value} />
        {"delta" in m && (
          <div className="flex items-center gap-2">
            <DeltaBadge delta={m.delta} />
            <span className="text-muted-foreground text-xs">{m.delta.versus}</span>
          </div>
        )}
      </div>
      {m.form === "trend" && <Spark className="w-full @lg:max-w-sm" height={64} series={m.series} unit={m.unit} />}
    </div>
  );
};

const Bones = ({ n }: { n: number }) => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-2">
      <Bone className="h-3 w-20" />
      <Bone className="h-12 w-56" />
    </div>
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 @lg:grid-cols-3">
      {Array.from({ length: Math.min(n - 1, 6) }, (_, i) => (
        <div className="flex flex-col gap-2" key={i}>
          <Bone className="h-3 w-24" />
          <Bone className="h-7 w-28" />
          <Bone className="h-1.5 w-full" />
        </div>
      ))}
    </div>
  </div>
);

export const Strip = ({ scenario }: { scenario: Scenario }) => {
  const { status, arrival } = useProto();
  const [first, ...rest] = scenario.metrics;
  const stats = rest.filter((m) => m.form !== "ranking" && m.form !== "summary");
  const lists = rest.filter((m) => m.form === "ranking" || m.form === "summary");
  const n = scenario.metrics.length;
  return (
    <div className="@container m-root w-full" data-live={arrival === "live" ? "" : undefined}>
      <style>{METRICS_CSS}</style>
      <WidgetFrame building="Считает показатели…" framed={false} meta={status === "ready" ? `${n} ${n === 1 ? "показатель" : "показателей"}` : undefined} streaming={status === "building"} title={scenario.title}>
        <div className="flex flex-col gap-6 px-1 pt-3 pb-1">
          {status === "building" && <Bones n={n} />}
          {status === "error" && <Failure />}
          {status === "ready" && first && (
            <>
              <Hero m={first} />
              {stats.length > 0 && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 @lg:grid-cols-3">
                  {stats.map((m, i) => (
                    <Stat i={i + 1} key={m.id} m={m} />
                  ))}
                </div>
              )}
              {lists.length > 0 && (
                <div className="grid gap-x-10 gap-y-6 border-t pt-5 @lg:grid-cols-2">
                  {lists.map((m, i) => (
                    <div className="m-in flex flex-col gap-2.5" key={m.id} style={at(stats.length + i + 1)}>
                      <Tip className="text-muted-foreground text-xs" tip={m.source}>
                        {m.label}
                      </Tip>
                      {m.form === "ranking" ? <Bars items={m.items} unit={m.unit} whole={m.whole} /> : m.form === "summary" ? <Facts rows={m.rows} /> : null}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-muted-foreground text-xs">{FROM_NOTE}</p>
            </>
          )}
        </div>
      </WidgetFrame>
    </div>
  );
};
