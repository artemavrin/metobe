import { chartKinds } from "@metobe/contracts/chart";
import type {
  ChartAxisType,
  ChartKind,
  ChartValue,
} from "@metobe/contracts/chart";

import type { ChartPart } from "@/lib/answer-work";

export interface ChartSeries {
  /** `s0`, `s1`… — the point's value index, as the chart names its data keys. */
  key: string;
  label: string;
  unit?: string;
  /** Composed: bars or a line. */
  as: "bar" | "line";
}

export type ChartPoint = { x: string | number } & Record<
  string,
  number | string | null
>;

export interface ChartView {
  title: string;
  kind: ChartKind;
  x: { label: string; type: ChartAxisType };
  /** Empty until the model has moved on to the points: a legend that grows series by series would jump. */
  series: ChartSeries[];
  points: ChartPoint[];
  stacked: boolean;
  /** Stacked as shares of 100%. */
  percent: boolean;
  /** Bars on their side. */
  horizontal: boolean;
  /** Curved between points; false — straight. */
  smooth: boolean;
  /** A pie with a hole. */
  donut: boolean;
  /** The model is still writing it, or the server is still taking its numbers from a tool result. */
  streaming: boolean;
  /** Why the server could not build it (the model is told, and may try again); none — it did not fail. */
  error?: string;
}

// The input while it streams is a partial parse: any field may be missing or cut off.
interface PartialInput {
  title?: string;
  kind?: string;
  x?: { label?: string; type?: string };
  series?: ({ label?: string; unit?: string; as?: string } | undefined)[];
  stacked?: boolean;
  percent?: boolean;
  horizontal?: boolean;
  smooth?: boolean;
  donut?: boolean;
  /** Set when the numbers come from a tool result: the server takes them, none are written. */
  from?: unknown;
  points?: (ChartValue[] | undefined)[];
}

const KINDS = new Set<string>(chartKinds);
const AXES = new Set<string>(["category", "date", "number"]);

/** A number out of what the model wrote — 12, "12", "12,5", "1 200"; anything else is a gap. */
export const toNumber = (value: ChartValue | undefined): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const n = Number(value.replaceAll(/[\s ]/gu, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Composed: what the model said a series is, else the first as bars and the rest as lines. */
const composedAs = (said: string | undefined, index: number) => {
  if (said === "bar" || said === "line") {
    return said;
  }
  return index === 0 ? "bar" : "line";
};

/** The series the model has written so far: a label is enough to draw one. */
const seriesOf = (input: PartialInput): ChartSeries[] =>
  (input.series ?? []).flatMap((s, i) =>
    s?.label === undefined
      ? []
      : [
          {
            as: composedAs(s.as, i),
            key: `s${i}`,
            label: s.label,
            unit: s.unit || undefined,
          },
        ]
  );

/** The points the chart can draw: those with an x, each series' number read out of them. */
const pointsOf = (
  written: (ChartValue[] | undefined)[],
  series: ChartSeries[]
): ChartPoint[] =>
  series.length === 0
    ? []
    : written.flatMap((p) => {
        const x = p?.[0];
        if (x === undefined || x === null || x === "") {
          return [];
        }
        const point: ChartPoint = { x: typeof x === "number" ? x : String(x) };
        for (const [i, s] of series.entries()) {
          point[s.key] = toNumber(p?.[i + 1]);
        }
        return [point];
      });

/** What the model said the chart looks like: its kind, axis and flags; the defaults for what it left out. */
const looksOf = (input: PartialInput) => ({
  donut: input.donut !== false,
  horizontal: input.horizontal === true,
  kind: KINDS.has(input.kind ?? "") ? (input.kind as ChartKind) : "bar",
  percent: input.percent === true,
  smooth: input.smooth !== false,
  stacked: input.stacked === true || input.percent === true,
  title: input.title ?? "",
  x: {
    label: input.x?.label ?? "",
    type: AXES.has(input.x?.type ?? "")
      ? (input.x?.type as ChartAxisType)
      : "category",
  },
});

/**
 * What of a chart can be drawn now. While the model writes, only whole things: the series once it has moved on to
 * the points, and every point but the last — the last may be cut mid-number. When it is done, all of it.
 */
export const chartView = (part: ChartPart): ChartView => {
  const input = (part.input ?? {}) as PartialInput;
  const sourced = input.from !== undefined;
  // A chart from a tool result is still being built after the model has written it, until the server's points arrive.
  const streaming =
    part.state === "input-streaming" ||
    (sourced && part.state === "input-available");
  const ready = !streaming || input.points !== undefined || sourced;
  const series = ready ? seriesOf(input) : [];
  const written =
    (part.state === "output-available" ? part.output?.data : undefined) ??
    input.points ??
    [];
  const whole =
    part.state === "input-streaming" ? written.slice(0, -1) : written;
  const points = pointsOf(whole, series);
  return {
    ...looksOf(input),
    ...(part.state === "output-error" ? { error: part.errorText } : {}),
    points,
    series,
    streaming,
  };
};

/** The theme's eight chart colors: more slices keep the biggest seven and put the rest together. */
const MAX_SLICES = 8;

/** A pie's slices, the biggest first; past eight, the rest go together under `other` (flagged, so it can be neutral). */
export const pieSlices = (view: ChartView, other: string) => {
  const key = view.series[0]?.key;
  if (!key) {
    return [];
  }
  const slices = view.points.flatMap((p) => {
    const value = p[key];
    return typeof value === "number" && value > 0
      ? [{ name: String(p.x), value }]
      : [];
  });
  // toSorted is past the ES2022 target; flatMap gave a fresh array.
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
  slices.sort((a, b) => b.value - a.value);
  if (slices.length <= MAX_SLICES) {
    return slices.map((slice) => ({ ...slice, other: false }));
  }
  const rest = slices
    .slice(MAX_SLICES - 1)
    .reduce((sum, s) => sum + s.value, 0);
  return [
    ...slices
      .slice(0, MAX_SLICES - 1)
      .map((slice) => ({ ...slice, other: false })),
    { name: other, other: true, value: rest },
  ];
};
