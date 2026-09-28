import { z } from "zod";

// A chart the model builds in its answer (the `show_chart` tool): what it shows and its axes first, then the points,
// streamed into the chart as the model writes them. A point is an array — the x value, then a number per series —
// like a table's row: keys repeated on every point would cost the model tokens and the user seconds.

export const chartKinds = [
  "bar",
  "line",
  "area",
  "pie",
  "radar",
  "radial",
  "composed",
] as const;
export type ChartKind = (typeof chartKinds)[number];

export const chartAxisTypes = ["category", "date", "number"] as const;
export type ChartAxisType = (typeof chartAxisTypes)[number];

/** The theme has eight chart colors, in a fixed order; more series or slices would repeat one. */
export const CHART_MAX_SERIES = 8;
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
      "bar — compare categories, or rank them (horizontal); area — a trend or amounts over time, the default for one to three series (stacked when they add up); line — many series that cross and must be read exactly; pie — shares of one whole: one series, a few slices; radar — one entity across 4-8 measures on one scale, or two or three entities compared (at most 3 series); radial — progress or share of a goal per item, one ring each, one series; composed — bars and a line on the same axis and unit, e.g. amounts and their plan (mark each series with `as`)."
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
    .describe(
      "The horizontal axis; for a pie or a radial, the slices' or rings' names; for a radar, its axes' names."
    ),
  series: z
    .array(
      z.object({
        as: z
          .enum(["bar", "line"])
          .optional()
          .describe(
            "Composed only: draw this series as bars or as a line; the first as bars, the rest as lines when omitted. All share one axis, so one unit — numbers of different scales (money and percent) go in separate charts."
          ),
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
      "One number per point for each series; a pie and a radial have one. Written before the points."
    ),
  stacked: z
    .boolean()
    .optional()
    .describe("Stack the series (bar or area) when they add up to a whole."),
  percent: z
    .boolean()
    .optional()
    .describe(
      "With stacked: show each point's series as shares of 100% instead of amounts (bar or area)."
    ),
  horizontal: z
    .boolean()
    .optional()
    .describe(
      "Bar only: lay the bars on their side — for long names or a ranking, biggest first."
    ),
  smooth: z
    .boolean()
    .optional()
    .describe(
      "Line, area or composed line: curve between points (default) — false for straight segments, right for steps and counts."
    ),
  donut: z
    .boolean()
    .optional()
    .describe(
      "Pie only: a ring with a hole (default) — false for a whole pie."
    ),
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
