import { describe, expect, it } from "vitest";

import { toPickerModel } from "./model-choice";

const row = {
  capabilities: {
    reasoning: true,
    structured: null,
    tools: true,
    vision: null,
  },
  contextWindow: 200_000,
  id: "m1",
  priceCacheRead: "0.0000003",
  priceCurrency: "USD" as const,
  priceInput: "0.000003",
  priceOutput: "0.000015",
  priceUnitTokens: 1,
  providerLogo: "anthropic",
  providerSlug: "anthropic",
  providerTitle: "Anthropic",
  releasedAt: "2026-08-01",
  sourceTitle: "Vercel AI Gateway",
  title: "Claude Sonnet 4.6",
};

describe("a model as the picker shows it", () => {
  it("prices per 1M tokens, whatever unit they were entered in", () => {
    expect(toPickerModel(row, 800).price).toEqual({
      cacheRead: 0.3,
      currency: "USD",
      input: 3,
      output: 15,
    });
    expect(
      toPickerModel(
        {
          ...row,
          priceCacheRead: null,
          priceInput: "500",
          priceOutput: "1200",
          priceUnitTokens: 1_000_000,
        },
        null
      ).price
    ).toEqual({
      currency: "USD",
      input: 500,
      output: 1200,
    });
  });

  it("has no price without both prices and a currency", () => {
    expect(toPickerModel({ ...row, priceOutput: null }, null).price).toBeNull();
    expect(
      toPickerModel({ ...row, priceCurrency: null }, null).price
    ).toBeNull();
  });

  it("falls back to the source when the maker is unknown", () => {
    const m = toPickerModel(
      { ...row, providerLogo: null, providerSlug: null, providerTitle: null },
      null
    );
    expect([m.maker, m.makerTitle, m.logo]).toEqual([
      "other",
      "Vercel AI Gateway",
      undefined,
    ]);
  });
});
