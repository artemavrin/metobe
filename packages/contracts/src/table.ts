import { z } from "zod";

import { sourceRefSchema } from "./source";

// A table the model builds in its answer (the `show_table` tool): columns, then rows, streamed into a grid the user
// sorts and filters. Rows are arrays in column order, not objects: keys repeated on every row would cost the model
// tokens and the user seconds.

/** How a column reads, sorts and filters: `category` — a few repeated values (a status, a city) to pick from. */
export const tableColumnTypes = ["text", "number", "date", "category"] as const;
export type TableColumnType = (typeof tableColumnTypes)[number];

/** What a group's row shows in a number column: the sum, the mean, the least or the greatest of its rows. */
export const tableSummaries = ["sum", "avg", "min", "max"] as const;
export type TableSummary = (typeof tableSummaries)[number];

/** How a number column is tinted: `scale` — deeper with the value; `good` / `bad` — the same in green / red, for where a big value is a good / a bad sign. */
export const tableHeats = ["scale", "good", "bad"] as const;
export type TableHeat = (typeof tableHeats)[number];

export const TABLE_MAX_COLUMNS = 12;
export const TABLE_MAX_GROUP_BY = 2;
export const TABLE_MAX_ROWS = 500;

const cellSchema = z.union([z.string(), z.number(), z.null()]);

/** Where a table takes its rows from: the full result of an earlier tool call, sorted and cut. */
export const tableSourceSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(TABLE_MAX_ROWS)
    .optional()
    .describe(
      "Keep this many rows after sorting — the top twenty, say; use it with sort. A result longer than the table allows is cut, and the table says how many there were."
    ),
  ref: sourceRefSchema,
  sort: z
    .object({
      desc: z.boolean().optional(),
      field: z
        .string()
        .describe("The result's column, named exactly as in the result."),
    })
    .optional()
    .describe(
      "Order the rows by a column of the result; the user can re-sort."
    ),
});
export type TableSource = z.infer<typeof tableSourceSchema>;

// The keys in the order the model writes them — a title first, the columns before the rows — so the table streams
// top down; they are not sorted.
// oxlint-disable-next-line sort-keys -- the order is the stream's
export const tableInputSchema = z.object({
  title: z
    .string()
    .describe("A short title for the table, in the user's language."),
  columns: z
    .array(
      // oxlint-disable-next-line sort-keys -- the order is the stream's
      z.object({
        field: z
          .string()
          .optional()
          .describe(
            "With `from`: the result's column this one shows, named exactly as in the result; the header's label when omitted."
          ),
        label: z
          .string()
          .describe("The column header, in the user's language."),
        type: z
          .enum(tableColumnTypes)
          .describe(
            "text — free text; number — a quantity or amount (a plain number, no units in the cell); date — an ISO date; category — a few repeated values to filter by (a status, a city)."
          ),
        summary: z
          .enum(tableSummaries)
          .optional()
          .describe(
            "Only for a number column: what the group rows (with groupBy) and the total row at the foot of the table show there — sum for amounts and counts, avg for prices and rates, min, max. Leave it out where a total means nothing; with no summary anywhere there is no total row."
          ),
        heat: z
          .enum(tableHeats)
          .optional()
          .describe(
            "Only for a number column: tint the cells by their value, so the eye finds the large and the small at once. scale — neutral, deeper for larger; good — green, larger is better (revenue, conversion); bad — red, larger is worse (returns, debt, delays). Use it on one or two columns that carry the point, not on all."
          ),
      })
    )
    .min(1)
    .max(TABLE_MAX_COLUMNS)
    .describe("Written before the rows."),
  from: tableSourceSchema
    .optional()
    .describe(
      "Take the rows from an earlier tool result instead of writing `rows`: the server reads each column's field from it. Use it for any data a tool returned — you never retype those values, so they cannot drift. Written before the rows."
    ),
  groupBy: z
    .array(z.string())
    .max(TABLE_MAX_GROUP_BY)
    .optional()
    .describe(
      "Group the rows by these columns' labels, exactly as written in columns, the outer group first — a city, then a department. The user sees a collapsible row per group with the number of rows in it and the columns' summaries. Use it when the rows fall into a few natural groups the user would compare or total; leave it out for a flat list. Written before the rows."
    ),
  rows: z
    .array(z.array(cellSchema))
    .max(TABLE_MAX_ROWS)
    .optional()
    .describe(
      "One array per row, its values in the columns' order; null for an empty cell. Leave it out when `from` is set; use it for data that is not in a tool result (from the user, a web page)."
    ),
});
export type TableInput = z.infer<typeof tableInputSchema>;
export type TableCell = z.infer<typeof cellSchema>;

/**
 * What the table is given back: how many rows; and, when they came from a tool result (`from`), the rows the server
 * took, in the same shape as `rows`, and how many the result had (more than `rows` when it was cut). What the model
 * is told is shorter (the table is on screen, so it only sums it up and does not write it out again).
 */
export const tableOutputSchema = z.object({
  data: z.array(z.array(cellSchema)).optional(),
  rows: z.number().int().nonnegative(),
  total: z.number().int().nonnegative().optional(),
});
export type TableOutput = z.infer<typeof tableOutputSchema>;
