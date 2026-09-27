import { z } from "zod";

// A table the model builds in its answer (the `show_table` tool): columns, then rows, streamed into a grid the user
// sorts and filters. Rows are arrays in column order, not objects: keys repeated on every row would cost the model
// tokens and the user seconds.

/** How a column reads, sorts and filters: `category` — a few repeated values (a status, a city) to pick from. */
export const tableColumnTypes = ["text", "number", "date", "category"] as const;
export type TableColumnType = (typeof tableColumnTypes)[number];

export const TABLE_MAX_COLUMNS = 12;
export const TABLE_MAX_ROWS = 500;

const cellSchema = z.union([z.string(), z.number(), z.null()]);

// The keys in the order the model writes them — a title first, the columns before the rows — so the table streams
// top down; they are not sorted.
// oxlint-disable-next-line sort-keys -- the order is the stream's
export const tableInputSchema = z.object({
  title: z
    .string()
    .describe("A short title for the table, in the user's language."),
  columns: z
    .array(
      z.object({
        label: z
          .string()
          .describe("The column header, in the user's language."),
        type: z
          .enum(tableColumnTypes)
          .describe(
            "text — free text; number — a quantity or amount (a plain number, no units in the cell); date — an ISO date; category — a few repeated values to filter by (a status, a city)."
          ),
      })
    )
    .min(1)
    .max(TABLE_MAX_COLUMNS)
    .describe("Written before the rows."),
  rows: z
    .array(z.array(cellSchema))
    .max(TABLE_MAX_ROWS)
    .describe(
      "One array per row, its values in the columns' order; null for an empty cell."
    ),
});
export type TableInput = z.infer<typeof tableInputSchema>;
export type TableCell = z.infer<typeof cellSchema>;

/** What the model is told back: the table is on screen, so it only sums it up and does not write it out again. */
export const tableOutputSchema = z.object({
  rows: z.number().int().nonnegative(),
});
export type TableOutput = z.infer<typeof tableOutputSchema>;
