import { z } from "zod";

import { sourceBuckets, sourceRefSchema } from "./source";

// A row of key figures the model builds in its answer (the `show_metrics` tool): a number, a number with its history
// and change, progress to a goal, a share of a whole, a spread, a ranking, a summary. The model only says which
// column and how to read it — the server computes every figure from the full result of an earlier tool call
// (ARCH §9.2), so a figure is the tool's, never the model's memory of it.

export const metricForms = [
  "value",
  "trend",
  "goal",
  "share",
  "range",
  "ranking",
  "summary",
  "movers",
  "pareto",
  "outliers",
  "composition",
] as const;
export type MetricForm = (typeof metricForms)[number];

/** How the rows of a column become one figure; `distinct` counts the different values (clients, products). */
export const metricAggregates = [
  "sum",
  "avg",
  "median",
  "min",
  "max",
  "count",
  "distinct",
] as const;
export type MetricAggregate = (typeof metricAggregates)[number];

export const METRICS_MAX_ITEMS = 12;
export const METRIC_MAX_RANKING = 10;
/** The rows of a Pareto the page lists by name; the curve of a longer one is drawn from `curve`. */
export const PARETO_LISTED = 40;
/** The most points of a Pareto curve and of an outliers' strip: more are thinned out evenly. */
export const METRIC_MAX_POINTS = 120;
export const OUTLIERS_MAX_VALUES = 500;
/** A history longer than this is not a sparkline: cut the dates into larger buckets. */
export const METRIC_MAX_SERIES = 120;

const FIELD = "named exactly as in the result";

const itemSchema = z.object({
  aggregate: z
    .enum(metricAggregates)
    .optional()
    .describe(
      "value, trend, goal, movers: sum (default), avg, median, min, max, count (rows), distinct (different values)."
    ),
  bucket: z
    .enum(sourceBuckets)
    .optional()
    .describe("trend, movers: period size — day, week, month (default), year."),
  by: z
    .string()
    .optional()
    .describe(
      `The grouping column (clients, products) for share, ranking, movers, pareto, composition; for outliers, the column naming each value; ${FIELD}.`
    ),
  field: z
    .string()
    .optional()
    .describe(`The result's column to read, ${FIELD}. Not for a plain count.`),
  form: z
    .enum(metricForms)
    .describe(
      "value: one figure; trend: with history by date (`x`) and its change; goal: progress to `target`; share: the biggest `top` groups of `by` as a share of the whole; range: min, median, average, max; ranking: the biggest groups of `by`; summary: count, sum, average, median, min, max; movers: which groups of `by` grew and fell most, last period against the one before (`x`, `by`, `field`); pareto: how few groups of `by` make 80% (ABC); outliers: values far above the usual (`by` names, `x` dates them); composition: the biggest `top` groups of `by` and the rest."
    ),
  good: z
    .enum(["up", "down"])
    .optional()
    .describe(
      "trend, movers: which way is good — up (default) or down (returns, debt)."
    ),
  label: z.string().describe("The figure's name, in the user's language."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(METRIC_MAX_RANKING)
    .optional()
    .describe(
      "ranking: groups (5); movers: growers and fallers each (4); outliers: listed (5)."
    ),
  target: z
    .number()
    .positive()
    .optional()
    .describe("goal: the user's own goal, same unit; never invent one."),
  top: z
    .number()
    .int()
    .min(1)
    .max(METRIC_MAX_RANKING)
    .optional()
    .describe(
      "share: groups counted as the part (3); composition: groups shown by name (4)."
    ),
  unit: z
    .string()
    .max(12)
    .optional()
    .describe("Unit shown with the figure: ₽, %, шт."),
  x: z
    .string()
    .optional()
    .describe(
      `The date column: trend and movers cut periods by it, outliers show it; ${FIELD}.`
    ),
});

// The keys in the order the model writes them — a title, then the figures — so the widget streams top down.
// oxlint-disable-next-line sort-keys -- the order is the stream's
export const metricsInputSchema = z.object({
  title: z
    .string()
    .describe("A short title for the figures, in the user's language."),
  ref: sourceRefSchema,
  items: z
    .array(itemSchema)
    .min(1)
    .max(METRICS_MAX_ITEMS)
    .describe(
      "The first one is the main figure, shown big; lists and rankings go last."
    ),
});
export type MetricsInput = z.infer<typeof metricsInputSchema>;
export type MetricItem = MetricsInput["items"][number];

/** The facts of a summary, by what they are; the page names them in the user's language. */
export const summaryFacts = [
  "rows",
  "sum",
  "avg",
  "median",
  "min",
  "max",
] as const;
export type SummaryFact = (typeof summaryFacts)[number];

const valueSchema = z.number();

/** One figure as the server computed it: what the page draws. */
export const metricResultSchema = z.object({
  aggregate: z.enum(metricAggregates).optional(),
  bucket: z.enum(sourceBuckets).optional(),
  by: z.string().optional(),
  classes: z
    .array(
      z.object({
        cls: z.enum(["A", "B", "C"]),
        count: z.number().int(),
        share: valueSchema,
      })
    )
    .optional(),
  count: z.number().int().optional(),
  curve: z.array(valueSchema).optional(),
  /** trend: the last point against the one before; `change` is in per cent, none when the one before is 0. */
  delta: z
    .object({
      change: valueSchema.nullable(),
      current: valueSchema,
      from: z.string(),
      good: z.enum(["up", "down"]),
      previous: valueSchema,
      to: z.string(),
    })
    .optional(),
  down: z.number().int().optional(),
  /** summary. */
  facts: z
    .array(z.object({ fact: z.enum(summaryFacts), value: valueSchema }))
    .optional(),
  fence: valueSchema.optional(),
  /** What the figure was made of — the page words it («Сумма «Выручка», по клиентам») on the label's hover. */
  field: z.string().optional(),
  form: z.enum(metricForms),
  good: z.enum(["up", "down"]).optional(),
  groupCount: z.number().int().optional(),
  /** ranking: the biggest groups. */
  items: z.array(z.object({ name: z.string(), value: valueSchema })).optional(),
  label: z.string(),
  /** movers: the groups that grew most, then those that fell most (biggest fall first); the periods compared; the net change of all groups; how many grew and how many fell. */
  movers: z
    .array(
      z.object({
        after: valueSchema,
        before: valueSchema,
        change: valueSchema,
        name: z.string(),
        pct: valueSchema.nullable(),
      })
    )
    .optional(),
  n80: z.number().int().optional(),
  names: z.array(z.string()).optional(),
  net: valueSchema.optional(),
  outlierCount: z.number().int().optional(),
  /** outliers: the ones above the fence, biggest first (how many there are is `outlierCount`); how many values were read; the quartiles and the fence; a thinned-out sample of all values for the strip. */
  outliers: z
    .array(
      z.object({
        date: z.string().optional(),
        name: z.string().optional(),
        value: valueSchema,
      })
    )
    .optional(),
  /** pareto: the biggest groups by name with their cumulative share (0..1) and class; how many groups there are; the curve of all of them (cumulative share, thinned out); how many groups make 80%; each class's groups and share of the whole. */
  pareto: z
    .array(
      z.object({
        cls: z.enum(["A", "B", "C"]),
        cum: valueSchema,
        name: z.string(),
        value: valueSchema,
      })
    )
    .optional(),
  /** composition: the biggest groups and the rest (`count` — how many groups it is made of). */
  parts: z
    .array(
      z.object({
        count: z.number().int().optional(),
        name: z.string(),
        rest: z.boolean().optional(),
        value: valueSchema,
      })
    )
    .optional(),
  period: z.object({ from: z.string(), to: z.string() }).optional(),
  quartiles: z
    .object({
      max: valueSchema,
      median: valueSchema,
      q1: valueSchema,
      q3: valueSchema,
    })
    .optional(),
  /** range. */
  range: z
    .object({
      avg: valueSchema,
      max: valueSchema,
      median: valueSchema,
      min: valueSchema,
    })
    .optional(),
  /** trend: the history, oldest first, each point on its bucket's first day. */
  series: z.array(z.object({ value: valueSchema, x: z.string() })).optional(),
  /** goal. */
  target: valueSchema.optional(),
  unit: z.string().optional(),
  up: z.number().int().optional(),
  /** The figure: for a share, the part. */
  value: valueSchema.optional(),
  values: z.array(valueSchema).optional(),
  /** share: the whole, and the groups that make the part. */
  whole: valueSchema.optional(),
});
export type MetricResult = z.infer<typeof metricResultSchema>;

/** What the page is given back: every figure, and how many rows of the result they were read from. */
export const metricsOutputSchema = z.object({
  items: z.array(metricResultSchema),
  /** The tool's result was cut (it says there is more): the figures are not the real totals. */
  partial: z.boolean().optional(),
  rows: z.number().int().nonnegative(),
});
export type MetricsOutput = z.infer<typeof metricsOutputSchema>;
