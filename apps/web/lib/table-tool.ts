import { tableInputSchema, tableOutputSchema } from "@metobe/contracts/table";
import type { TableInput, TableOutput } from "@metobe/contracts/table";
import { tool } from "ai";
import type { Tool } from "ai";

import { tableOutput } from "./source-widgets";
import type { Sources } from "./tool-sources";

/** The tool's name — the answer draws its part (`tool-show_table`) as a grid. */
export const TABLE_TOOL = "show_table";

/** A table with this many rows or fewer is told to the model with its values, so it can speak of them exactly. */
const TOLD_UP_TO = 12;

/**
 * Shows data as a table in the answer: the user sorts and filters it, rows arrive as the model writes them — or, with
 * `from`, taken by the server from an earlier tool result (ARCH §9.2). What the model gets back is the count — the
 * table is already on screen — and, for a short one, its rows.
 */
export const tableTool = (sources: Sources): Tool<TableInput, TableOutput> =>
  tool({
    description:
      "Show data to the user as an interactive table in the chat (they can sort and filter it, and it can be grouped). Use it for lists of five or more records with shared fields — results of a query, a comparison, a register. When the rows fall into natural groups (by city, status, month) set groupBy, and summary on the number columns worth totalling. For data a tool returned, ALWAYS use `from` (and `field` in each column): the server reads the rows from the result itself, sorted by `from.sort` and cut to `from.limit` — a top twenty is `from: { sort: { field: <column>, desc: true }, limit: 20 }` — never retype a result's rows into `rows`. Write `rows` only for data that is not in a tool result. Do not write the same data as a markdown table. After it, sum up in a sentence or two what matters; do not repeat the rows.",
    execute: (input) =>
      tableOutput(
        input,
        input.from ? sources.resolve(input.from.ref).table : null
      ),
    inputSchema: tableInputSchema,
    outputSchema: tableOutputSchema,
    toModelOutput: ({ output }) => {
      const { data } = output;
      if (!data) {
        return { type: "json", value: { rows: output.rows } };
      }
      const cut =
        output.total !== undefined && output.total > output.rows
          ? ` of ${output.total} (the table holds at most that many; the user is told)`
          : "";
      const rows =
        data.length <= TOLD_UP_TO
          ? ` Its rows, for you to speak of:\n${data.map((r) => r.join(" | ")).join("\n")}`
          : "";
      return {
        type: "text",
        value: `The table is on screen: ${output.rows} rows${cut} taken from the tool result.${rows}`,
      };
    },
  });
