import { z } from "zod";

// A chart the model builds in its answer (the `show_chart` tool): what it shows and its axes first, then the points,
// streamed into the chart as the model writes them. A point is an array — the x value, then a number per series —
// like a table's row: keys repeated on every point would cost the model tokens and the user seconds.

export const chartKinds = ["bar", "line", "area", "pie"] as const;
export type ChartKind = (typeof chartKinds)[number];

export const chartAxisTypes = ["category", "date", "number"] as const;
export type ChartAxisType = (typeof chartAxisTypes)[number];

/** The theme has five chart colors; more series would blur together. */
export const CHART_MAX_SERIES = 5;
export const CHART_MAX_POINTS = 200;

const valueSchema = z.union([z.string(), z.number(), z.null()]);

// The keys in the order the model writes them — what the chart is before its points — so it streams top down.
// oxlint-disable-next-line sort-keys -- the order is the stream's
export const chartInputSchema = z.object({
  title: z
    .string()
    .describe("A short title for the chart, in the user's language."),
  kind: z
    .enum(chartKinds)
    .describe(
      "bar — compare categories; line — a trend over time; area — amounts over time, stacked when the series add up; pie — shares of one whole: one series, a few slices."
    ),
  x: z
    .object({
      label: z
        .string()
        .describe(
          "What the points are, in the user's language: «Месяц», «Город»."
        ),
      type: z
        .enum(chartAxisTypes)
        .describe(
          "category — names; date — ISO dates (2026-09-27); number — a numeric axis."
        ),
    })
    .describe("The horizontal axis; for a pie, the slices' names."),
  series: z
    .array(
      z.object({
        label: z
          .string()
          .describe("What is measured, in the user's language: «Выручка»."),
        unit: z
          .string()
          .max(12)
          .optional()
          .describe(
            "A unit shown with the numbers — ₽, %, шт.; omit when there is none."
          ),
      })
    )
    .min(1)
    .max(CHART_MAX_SERIES)
    .describe(
      "One number per point for each series; a pie has one. Written before the points."
    ),
  stacked: z
    .boolean()
    .optional()
    .describe("Stack the series (bar or area) when they add up to a whole."),
  points: z
    .array(z.array(valueSchema))
    .max(CHART_MAX_POINTS)
    .describe(
      "One array per point: the x value first, then one number per series in their order; null when a value is missing."
    ),
});
export type ChartInput = z.infer<typeof chartInputSchema>;
export type ChartValue = z.infer<typeof valueSchema>;

/** What the model is told back: the chart is on screen, so it sums it up and does not list the numbers again. */
export const chartOutputSchema = z.object({
  points: z.number().int().nonnegative(),
});
export type ChartOutput = z.infer<typeof chartOutputSchema>;
