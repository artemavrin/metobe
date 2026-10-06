import { chartInputSchema, chartOutputSchema } from "@metobe/contracts/chart";
import type { ChartInput, ChartOutput } from "@metobe/contracts/chart";
import { tool } from "ai";
import type { Tool } from "ai";

import { chartOutput } from "./source-widgets";
import type { Sources } from "./tool-sources";

/** The tool's name — the answer draws its part (`tool-show_chart`) as a chart. */
export const CHART_TOOL = "show_chart";

/** A chart with this many points or fewer is told to the model with its values, so it can speak of them exactly. */
const TOLD_UP_TO = 24;

/**
 * Shows numbers as a chart in the answer, points arriving as the model writes them — or, with `from`, taken by the
 * server from an earlier tool result (ARCH §9.2), so they are the tool's numbers and not the model's memory of them.
 * What the model gets back is the count — the chart is already on screen — and, for a small chart, its values.
 */
export const chartTool = (sources: Sources): Tool<ChartInput, ChartOutput> =>
  tool({
    description:
      'Show numbers to the user as a chart in the chat. Use it when the shape of the numbers matters, and pick the kind that fits: bar to compare categories (`horizontal` for long names or a ranking); area for a trend or amounts over time — the default for one to three series, `stacked` when they add up, `percent` for their shares; line only for many series that cross and must be read exactly; pie for shares of one whole; radar for one entity across several measures on one scale, or two or three entities compared; radial for progress toward a goal per item; composed for bars and a line on the same unit, e.g. actual and plan. All series share one axis: numbers of different scales or units (money and percent) go in separate charts, never squeezed into one. Up to 8 series and 200 points. For numbers a tool returned, ALWAYS use `from` (and `field` in each series): the server reads the result itself, groups by the x column and sums each field, and a month-by-month chart of a year of sales is `from: { x: <date column>, bucket: "month" }` — never retype a result\'s numbers into `points`. Write `points` only for numbers that are not in a tool result. For exact values of many records, use show_table instead. Do not also write the numbers as text or a markdown table. After it, say in a sentence or two what the chart shows.',
    execute: (input) =>
      chartOutput(
        input,
        input.from ? sources.resolve(input.from.ref).table : null
      ),
    inputSchema: chartInputSchema,
    outputSchema: chartOutputSchema,
    toModelOutput: ({ input, output }) => {
      const { data } = output;
      if (!input.from || !data) {
        return { type: "json", value: { points: output.points } };
      }
      const values =
        data.length <= TOLD_UP_TO
          ? ` Its points, for you to speak of: ${input.series.map((s) => s.label).join(" / ")}\n${data.map((p) => p.join(" | ")).join("\n")}`
          : "";
      return {
        type: "text",
        value: `The chart is on screen: ${output.points} points taken from the tool result.${values}`,
      };
    },
  });
