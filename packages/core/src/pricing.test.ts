import { describe, expect, it } from "vitest";

import { addCosts, costOf } from "./pricing";

const none = { cacheRead: null, cacheWrite: null, input: null, output: null };
const usage = (
  u: Partial<{
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }>
) => ({
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  ...u,
});

describe("exact run cost", () => {
  it("never rounds a tiny per-token price to zero", () => {
    // AI Gateway reports prices per 1 token, e.g. $0.0000001.
    expect(
      costOf(usage({ inputTokens: 1 }), {
        ...none,
        input: "0.0000001",
        unitTokens: 1,
      })
    ).toBe("0.0000001");
  });

  it("uses any unit: per 1000 tokens in rubles like Yandex", () => {
    // 1234 input tokens at 0.40 ₽ per 1000 → 0.4936 ₽.
    expect(
      costOf(usage({ inputTokens: 1234 }), {
        ...none,
        input: "0.40",
        unitTokens: 1000,
      })
    ).toBe("0.4936");
  });

  it("uses an odd unit exactly", () => {
    // 10 tokens at 1 per 3 tokens = 3.333… — kept to 18 digits, not rounded away.
    expect(
      costOf(usage({ inputTokens: 10 }), { ...none, input: "1", unitTokens: 3 })
    ).toBe("3.333333333333333333");
  });

  it("prices input, output, cache read and cache write separately", () => {
    // Per 1M: in 3, out 15, cache read 0.3, cache write 3.75.
    const prices = {
      cacheRead: "0.3",
      cacheWrite: "3.75",
      input: "3",
      output: "15",
      unitTokens: 1_000_000,
    };
    expect(
      costOf(
        usage({
          cacheReadTokens: 50_000,
          cacheWriteTokens: 20_000,
          inputTokens: 1000,
          outputTokens: 500,
        }),
        prices
      )
    ).toBe("0.1005");
  });

  it("says «unknown» instead of «free» when a used price is missing", () => {
    expect(
      costOf(usage({ inputTokens: 10, outputTokens: 5 }), {
        ...none,
        input: "1",
        unitTokens: 1000,
      })
    ).toBeNull();
    // Unused prices may be missing.
    expect(
      costOf(usage({ inputTokens: 10 }), {
        ...none,
        input: "1",
        unitTokens: 1000,
      })
    ).toBe("0.01");
    expect(costOf(usage({}), { ...none, unitTokens: 1 })).toBe("0");
  });

  it("sums many tiny costs without losing them", () => {
    const one = costOf(usage({ inputTokens: 1 }), {
      ...none,
      input: "0.0000001",
      unitTokens: 1,
    }) as string;
    expect(addCosts(Array.from({ length: 1000 }, () => one))).toBe("0.0001");
  });
});
