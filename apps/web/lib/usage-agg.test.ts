import type { UsageBucket } from "@metobe/core/usage";
import { describe, expect, it } from "vitest";

import {
  currenciesOf,
  GONE,
  matches,
  rank,
  stackOf,
  totalsOf,
} from "./usage-agg";

const bucket = (b: Partial<UsageBucket>): UsageBucket => ({
  at: "2026-10-01",
  cacheRead: 0,
  cost: null,
  currency: null,
  errors: 0,
  input: 0,
  modelId: "haiku",
  output: 0,
  purpose: "chat",
  requests: 1,
  unpriced: 0,
  userId: "anna",
  ...b,
});

const rows = [
  bucket({ cost: 2, currency: "USD", requests: 4 }),
  bucket({
    at: "2026-10-02",
    cost: 300,
    currency: "RUB",
    modelId: "alice",
    requests: 2,
  }),
  bucket({ modelId: "gemma", requests: 3, unpriced: 3, userId: "boris" }),
  bucket({
    at: "2026-10-02",
    cost: 1,
    currency: "USD",
    modelId: null,
    requests: 1,
    userId: null,
  }),
];

describe("what «Расходы» counts", () => {
  it("never adds rubles to dollars, and leaves the unpriced out of the money", () => {
    const t = totalsOf(rows);
    expect(t.cost.get("USD")).toBe(3);
    expect(t.cost.get("RUB")).toBe(300);
    expect(t.requests).toBe(10);
    expect(t.unpriced).toBe(3);
    expect([...t.people]).toEqual(["anna", "boris"]);
  });

  it("puts first the currency more requests were paid in", () => {
    expect(currenciesOf(rows)).toEqual(["USD", "RUB"]);
  });

  it("keeps a deleted model or person as one entry of their own", () => {
    const ranked = rank(
      rows,
      [],
      ["2026-10-01", "2026-10-02"],
      "person",
      "requests",
      "USD"
    );
    expect(ranked.map((e) => [e.key, e.value])).toEqual([
      ["anna", 6],
      ["boris", 3],
      [GONE, 1],
    ]);
    expect(matches(rows[3] as UsageBucket, { model: GONE })).toBe(true);
  });

  it("compares each entry with the period before", () => {
    const [haiku] = rank(
      rows,
      [bucket({ requests: 2 })],
      ["2026-10-01", "2026-10-02"],
      "model",
      "requests",
      "USD"
    );
    expect(haiku).toMatchObject({ key: "haiku", prev: 2, value: 4 });
  });

  it("stacks the top entries and folds the rest into «Прочее»", () => {
    const { data, keys, rest } = stackOf(
      rows,
      ["2026-10-01", "2026-10-02"],
      "model",
      "requests",
      "USD",
      2
    );
    expect(keys).toEqual(["haiku", "gemma"]);
    expect(rest).toBe(true);
    expect(data[1]).toEqual({ at: "2026-10-02", gemma: 0, haiku: 0, other: 3 });
  });
});
