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
    "Show numbers to the user as a chart in the chat. Use it when the shape of the numbers matters — a trend over time, a comparison between categories, shares of a whole. For exact values of many records, use show_table instead. Do not also write the numbers as text or a markdown table. After it, say in a sentence or two what the chart shows.",
  execute: ({ points }) => ({ points: points.length }),
  inputSchema: chartInputSchema,
  outputSchema: chartOutputSchema,
});
