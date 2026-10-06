import type { MetricResult } from "@metobe/contracts/metrics";

import type { MetricsPart } from "./answer-work";

// What of a metrics widget can be drawn now (the `show_metrics` part): while the model writes and while the server
// computes, only a title and how many figures are coming; with the output, every figure.

export interface MetricsView {
  title: string;
  /** The model is still writing it, or the server is still computing the figures. */
  streaming: boolean;
  /** How many figures are coming, for the skeleton. */
  coming: number;
  items: MetricResult[];
  /** How many rows of the tool result the figures were read from. */
  rows: number;
  /** Why the server could not compute them (the model is told, and may try again); none — it did not fail. */
  error?: string;
}

// The input while it streams is a partial parse: any field may be missing or cut off.
interface PartialInput {
  title?: string;
  items?: unknown[];
}

const DEFAULT_COMING = 4;

export const metricsView = (part: MetricsPart): MetricsView => {
  const input = (part.input ?? {}) as PartialInput;
  const done = part.state === "output-available" ? part.output : undefined;
  return {
    coming: Math.max(input.items?.length ?? 0, DEFAULT_COMING),
    ...(part.state === "output-error" ? { error: part.errorText } : {}),
    items: done?.items ?? [],
    rows: done?.rows ?? 0,
    streaming:
      part.state === "input-streaming" || part.state === "input-available",
    title: input.title ?? "",
  };
};
