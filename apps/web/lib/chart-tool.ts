import { chartInputSchema, chartOutputSchema } from "@metobe/contracts/chart";
import type { ChartInput, ChartOutput } from "@metobe/contracts/chart";
import { tool } from "ai";
import type { Tool } from "ai";

/** The tool's name — the answer draws its part (`tool-show_chart`) as a chart. */
export const CHART_TOOL = "show_chart";

/**
 * Shows the model's numbers as a chart in its answer, points arriving as the model writes them. What the model gets
 * back is only the count — the chart is already on screen.
 */
export const chartTool: Tool<ChartInput, ChartOutput> = tool({
  description:
    "Show numbers to the user as a chart in the chat. Use it when the shape of the numbers matters, and pick the kind that fits: bar to compare categories (`horizontal` for long names or a ranking); area for a trend or amounts over time — the default for one to three series, `stacked` when they add up, `percent` for their shares; line only for many series that cross and must be read exactly; pie for shares of one whole; radar for one entity across several measures on one scale, or two or three entities compared; radial for progress toward a goal per item; composed for bars and a line on the same unit, e.g. actual and plan. All series share one axis: numbers of different scales or units (money and percent) go in separate charts, never squeezed into one. Up to 8 series and 200 points. For exact values of many records, use show_table instead. Do not also write the numbers as text or a markdown table. After it, say in a sentence or two what the chart shows.",
  execute: ({ points }) => ({ points: points.length }),
  inputSchema: chartInputSchema,
  outputSchema: chartOutputSchema,
});
