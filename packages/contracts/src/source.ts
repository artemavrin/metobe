import { z } from "zod";

// Where a widget's numbers come from (ARCH §9.2). The model chooses what to show — a column, how rows combine — and
// the server takes the numbers from the full result of an earlier tool call; the model never retypes them. The two
// widget tools (`show_chart`, `show_table`) share these words.

/** How rows that fall on one point of a chart combine. */
export const sourceAggregates = ["sum", "avg", "min", "max", "count"] as const;
export type SourceAggregate = (typeof sourceAggregates)[number];

/** A date axis cut into days, weeks (from Monday), months or years. */
export const sourceBuckets = ["day", "week", "month", "year"] as const;
export type SourceBucket = (typeof sourceBuckets)[number];

/** The id of the tool call whose result is the source. */
export const sourceRefSchema = z
  .string()
  .optional()
  .describe(
    "The ref of the tool result to take the data from, as written in that result's header. Leave it out for the latest table-like result."
  );
