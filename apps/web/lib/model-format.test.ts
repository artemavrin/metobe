import { describe, expect, it } from "vitest";

import { byPrice } from "./model-format";

const model = (
  id: string,
  input: string | null,
  output: string | null,
  unit = 1_000_000
) => ({
  id,
  priceCurrency: "USD",
  priceInput: input,
  priceOutput: output,
  priceUnitTokens: input === null && output === null ? null : unit,
});

describe("byPrice", () => {
  const models = [
    model("mid", "3", "15"),
    model("none", null, null),
    model("cheap", "0.05", "0.4"),
    // The same price per 1M, stored per 1K tokens.
    model("mid-per-1k", "0.003", "0.010", 1000),
    model("dear", "15", "75"),
  ];
  const sorted = (order: "cheap" | "expensive") =>
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy
    [...models].sort(byPrice(order)).map((m) => m.id);

  it("goes from the cheapest input per 1M, whatever unit the price is stored in, the output breaking a tie", () => {
    expect(sorted("cheap")).toEqual([
      "cheap",
      "mid-per-1k",
      "mid",
      "dear",
      "none",
    ]);
  });

  it("goes from the dearest, and a model without a price stays last — unknown is not free", () => {
    expect(sorted("expensive")).toEqual([
      "dear",
      "mid",
      "mid-per-1k",
      "cheap",
      "none",
    ]);
  });
});
