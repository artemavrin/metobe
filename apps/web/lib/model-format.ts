import type { Currency } from "@metobe/contracts/models";

// How a model's facts read in lists: context in K/M, prices per 1M tokens, «новая» for under 90 days (ARCH §7.1).
// Display only — stored prices stay exact (core/pricing).

const NEW_DAYS = 90;
const SYMBOL: Record<Currency, string> = { RUB: "₽", USD: "$" };

export const isNew = (released: string | null) =>
  released !== null &&
  Date.now() - new Date(released).getTime() < NEW_DAYS * 24 * 3600 * 1000;

export const contextLabel = (tokens: number | null) => {
  if (!tokens) {
    return null;
  }
  return tokens >= 1_000_000
    ? `${+(tokens / 1_000_000).toFixed(1)}M`
    : `${Math.round(tokens / 1000)}K`;
};

/** A stored price (per `unitTokens`) shown per 1M tokens, rounded only for display. */
const perMillion = (value: string | null, unit: number | null) => {
  if (value === null || !unit) {
    return null;
  }
  const n = (Number(value) * 1_000_000) / unit;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: n < 1 ? 4 : 2,
  }).format(n);
};

/** A model's price fields, as every model query returns them. */
interface PricedModel {
  priceInput: string | null;
  priceOutput: string | null;
  priceUnitTokens: number | null;
  priceCurrency: string | null;
}

/** «$3 / $15» per 1M tokens, or null when the model has no price. */
export const priceLabel = (m: PricedModel) => {
  const input = perMillion(m.priceInput, m.priceUnitTokens);
  const output = perMillion(m.priceOutput, m.priceUnitTokens);
  if (input === null && output === null) {
    return null;
  }
  const s = SYMBOL[(m.priceCurrency ?? "USD") as Currency];
  return `${s}${input ?? "—"} / ${s}${output ?? "—"}`;
};

export type PriceOrder = "cheap" | "expensive";

/** A model's price per 1M tokens as numbers: input and output, null where it has none. */
const perMillionOf = (m: PricedModel) => {
  const unit = m.priceUnitTokens;
  const at = (value: string | null) =>
    value === null || !unit ? null : (Number(value) * 1_000_000) / unit;
  return { input: at(m.priceInput), output: at(m.priceOutput) };
};

/**
 * Models by price — the input's per 1M, the output's when inputs tie (the model picker sorts the same way); a model
 * without a price goes last either way: unknown is not free. Currencies are not converted: a source has one.
 */
export const byPrice =
  (order: PriceOrder) =>
  (a: PricedModel, b: PricedModel): number => {
    const x = perMillionOf(a);
    const y = perMillionOf(b);
    const ax = x.input ?? x.output;
    const by = y.input ?? y.output;
    if (ax === null || by === null) {
      return (ax === null ? 1 : 0) - (by === null ? 1 : 0);
    }
    const sign = order === "cheap" ? 1 : -1;
    return (ax - by || (x.output ?? 0) - (y.output ?? 0)) * sign;
  };
