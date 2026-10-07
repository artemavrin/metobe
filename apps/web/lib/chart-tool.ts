import { chartInputSchema, chartOutputSchema } from "@metobe/contracts/chart";
import type { ChartInput, ChartOutput } from "@metobe/contracts/chart";
import { tool } from "ai";
import type { Tool } from "ai";

import { chartOutput, copyError, writtenPoints } from "./source-widgets";
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
      'Show numbers as a chart. Kinds: bar to compare or rank (`horizontal` for long names); area for a trend or amounts over time (default for 1-3 series; `stacked`, `percent`); line for many crossing series; pie for shares of one whole; radar for one entity across measures; radial for progress per item; composed for bars plus a line on one unit. One axis: different units go in separate charts. Up to 8 series, 200 points. Numbers a tool returned: ALWAYS `from` plus `field` per series — the server reads and groups them (monthly sales: `from: { x: <date column>, bucket: "month" }`); never retype a result into `points`, those are for numbers from elsewhere. Do not repeat the numbers as text. After it, say in a sentence or two what it shows.',
    execute: (input) => {
      if (!input.from) {
        // Figures that are a tool result's are not typed by hand: the model is sent back to `from`.
        const copied = sources.copied(writtenPoints(input));
        if (copied) {
          throw copyError(copied);
        }
      }
      return chartOutput(
        input,
        input.from ? sources.resolve(input.from.ref).table : null
      );
    },
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
