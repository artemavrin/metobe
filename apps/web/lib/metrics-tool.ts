import {
  metricsInputSchema,
  metricsOutputSchema,
} from "@metobe/contracts/metrics";
import type {
  MetricResult,
  MetricsInput,
  MetricsOutput,
} from "@metobe/contracts/metrics";
import { tool } from "ai";
import type { Tool } from "ai";

import { metricsFrom } from "./source-metrics";
import type { Sources } from "./tool-sources";

/** The tool's name — the answer draws its part (`tool-show_metrics`) as a strip of key figures. */
export const METRICS_TOOL = "show_metrics";

const num = (n: number) => String(Math.round(n * 100) / 100);

const withUnit = (m: MetricResult) => (m.unit ? ` ${m.unit}` : "");

const percent = (n: number) => `${n > 0 ? "+" : ""}${num(n)} %`;

const TELL: Record<MetricResult["form"], (m: MetricResult) => string> = {
  composition: (m) =>
    `${m.label}: ${(m.parts ?? []).map((p) => `${p.rest ? `the rest (${p.count} groups)` : p.name} ${num((p.value / (m.whole || 1)) * 100)} %`).join("; ")}`,
  goal: (m) =>
    `${m.label}: ${num(m.value ?? 0)}${withUnit(m)} of the goal ${num(m.target ?? 0)}${withUnit(m)} (${num(((m.value ?? 0) / (m.target || 1)) * 100)} %)`,
  movers: (m) =>
    `${m.label}, ${m.period?.to} against ${m.period?.from}: net ${num(m.net ?? 0)}${withUnit(m)}, ${m.up} grew, ${m.down} fell; ${(m.movers ?? []).map((x) => `${x.name} ${x.change > 0 ? "+" : ""}${num(x.change)}`).join("; ")}`,
  outliers: (m) =>
    `${m.label}: ${m.outlierCount} of ${m.count} above ${num(m.fence ?? 0)}${withUnit(m)} (median ${num(m.quartiles?.median ?? 0)}); ${(m.outliers ?? []).map((o) => `${o.name ?? ""} ${o.date ?? ""} ${num(o.value)}`.trim()).join("; ")}`,
  pareto: (m) =>
    `${m.label}: ${m.n80} of ${m.groupCount} groups make 80 %; ${(m.classes ?? []).map((c) => `class ${c.cls} ${c.count} groups ${num(c.share * 100)} %`).join(", ")}; biggest: ${(
      m.pareto ?? []
    )
      .slice(0, 5)
      .map((p) => `${p.name} ${num(p.value)}`)
      .join("; ")}`,
  range: (m) =>
    `${m.label}: min ${num(m.range?.min ?? 0)}, median ${num(m.range?.median ?? 0)}, average ${num(m.range?.avg ?? 0)}, max ${num(m.range?.max ?? 0)}${withUnit(m)}`,
  ranking: (m) =>
    `${m.label}: ${(m.items ?? []).map((i) => `${i.name} ${num(i.value)}`).join("; ")}`,
  share: (m) =>
    `${m.label}: ${num(((m.value ?? 0) / (m.whole || 1)) * 100)} % (${(m.names ?? []).join(", ")})`,
  summary: (m) =>
    `${m.label}: ${(m.facts ?? []).map((f) => `${f.fact} ${num(f.value)}`).join(", ")}`,
  trend: (m) => {
    const d = m.delta;
    const change = d
      ? `; ${d.to} against ${d.from}: ${d.change === null ? "no base" : percent(d.change)} (${num(d.previous)} → ${num(d.current)})`
      : "";
    return `${m.label}: ${num(m.value ?? 0)}${withUnit(m)}${change}`;
  },
  value: (m) => `${m.label}: ${num(m.value ?? 0)}${withUnit(m)}`,
};

/** One figure in a line, for the model to speak of it exactly. */
const told = (m: MetricResult) => TELL[m.form](m);

/**
 * Shows key figures in the answer, each computed by the server from the full result of an earlier tool call
 * (ARCH §9.2) — the model names the columns and the way to read them and never writes a figure. What it gets back
 * is the figures in words, so it can sum them up.
 */
export const metricsTool = (
  sources: Sources
): Tool<MetricsInput, MetricsOutput> =>
  tool({
    description:
      'Show key figures as a strip: a total, a trend with its change, progress to a goal the user named, a share, a spread, a ranking, a summary, who grew and fell, ABC, outliers, a composition. Every figure is computed by the server from a table-like tool result (`ref`; the latest by default): you give columns (`field`, `by`, `x`) and how to read them, never the numbers. The first item is shown big. For indicators, statistics, "how are we doing". After it, say in a sentence or two what matters; do not repeat the figures.',
    execute: (input) => metricsFrom(input, sources.resolve(input.ref).table),
    inputSchema: metricsInputSchema,
    outputSchema: metricsOutputSchema,
    toModelOutput: ({ output }) => ({
      type: "text",
      value: `The figures are on screen, computed from ${output.rows} rows of the tool result:\n${output.items.map(told).join("\n")}`,
    }),
  });
