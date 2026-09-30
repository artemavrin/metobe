import { tableInputSchema, tableOutputSchema } from "@metobe/contracts/table";
import type { TableInput, TableOutput } from "@metobe/contracts/table";
import { tool } from "ai";
import type { Tool } from "ai";

/** The tool's name — the answer draws its part (`tool-show_table`) as a grid. */
export const TABLE_TOOL = "show_table";

/**
 * Shows the model's data as a table in its answer: the user sorts and filters it, rows arrive as the model writes
 * them. What the model gets back is only the count — the table is already on screen.
 */
export const tableTool: Tool<TableInput, TableOutput> = tool({
  description:
    "Show data to the user as an interactive table in the chat (they can sort and filter it, and it can be grouped). Use it for lists of five or more records with shared fields — results of a query, a comparison, a register. When the rows fall into natural groups (by city, status, month) set groupBy, and summary on the number columns worth totalling. Do not write the same data as a markdown table. After it, sum up in a sentence or two what matters; do not repeat the rows.",
  execute: ({ rows }) => ({ rows: rows.length }),
  inputSchema: tableInputSchema,
  outputSchema: tableOutputSchema,
});
