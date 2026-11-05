import { tableInputSchema, tableOutputSchema } from "@metobe/contracts/table";
import type { TableInput, TableOutput } from "@metobe/contracts/table";
import { tool } from "ai";
import type { Tool } from "ai";

import { copyError, tableOutput, writtenRows } from "./source-widgets";
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
      "Show data as an interactive table (sort, filter, group). For five or more records with shared fields. Set groupBy for natural groups and summary on number columns worth totalling. Data a tool returned: ALWAYS `from` plus `field` per column — the server reads the rows, sorted by `from.sort`, cut to `from.limit` (top twenty: `from: { sort: { field: <column>, desc: true }, limit: 20 }`); never retype a result into `rows`, those are for data from elsewhere. Do not repeat the rows as text. After it, say in a sentence or two what matters.",
    execute: (input) => {
      if (!input.from) {
        // Figures that are a tool result's are not typed by hand: the model is sent back to `from`.
        const copied = sources.copied(writtenRows(input));
        if (copied) {
          throw copyError(copied);
        }
      }
      return tableOutput(
        input,
        input.from ? sources.resolve(input.from.ref).table : null
      );
    },
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
