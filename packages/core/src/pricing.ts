// Exact cost of a run from token counts and prices per any unit of tokens (ARCH §5.2, D19). Everything is done
// in integer arithmetic on BigInt: no floats, no normalisation to 1M tokens, so tiny per-token prices never
// round to zero and sums stay exact. Rounding happens only when a value is shown.

export interface Prices {
  input: string | null;
  output: string | null;
  cacheRead: string | null;
  cacheWrite: string | null;
  /** How many tokens the prices are for: 1, 1000, 1_000_000 — any positive count. */
  unitTokens: number;
}

export interface Usage {
  /** Uncached input tokens. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** A decimal as an exact fraction: value = units / 10^scale. */
interface Fixed {
  units: bigint;
  scale: number;
}

const parse = (value: string): Fixed => {
  const match = /^(?<whole>\d+)(?:\.(?<frac>\d+))?$/u.exec(value.trim());
  if (!match?.groups) {
    throw new Error(`not a plain decimal: ${value}`);
  }
  const frac = match.groups.frac ?? "";
  return { scale: frac.length, units: BigInt(`${match.groups.whole}${frac}`) };
};

/** Digits kept after the point in stored costs: far below any currency's smallest coin, so nothing turns into 0. */
const COST_SCALE = 18;

/**
 * Σ tokens × price / unitTokens, exactly, as a plain decimal string for Postgres numeric (trailing zeros cut).
 * Returns null when no price applies to the tokens used — «unknown», not «free».
 */
export const costOf = (usage: Usage, prices: Prices): string | null => {
  const parts: [number, string | null][] = [
    [usage.inputTokens, prices.input],
    [usage.outputTokens, prices.output],
    [usage.cacheReadTokens, prices.cacheRead],
    [usage.cacheWriteTokens, prices.cacheWrite],
  ];
  const used = parts.filter(([tokens]) => tokens > 0);
  if (!used.length) {
    return "0";
  }
  if (used.some(([, price]) => price === null)) {
    return null;
  }
  // Bring every price to the common scale, sum tokens × units, divide once by unitTokens.
  const priced = used.map(([tokens, price]) => ({
    fixed: parse(price as string),
    tokens: BigInt(tokens),
  }));
  const scale = Math.max(...priced.map((p) => p.fixed.scale));
  let numerator = 0n;
  for (const { fixed, tokens } of priced) {
    numerator += tokens * fixed.units * 10n ** BigInt(scale - fixed.scale);
  }
  // value = numerator / (unitTokens × 10^scale), expressed with COST_SCALE fractional digits (truncated).
  const denominator = BigInt(prices.unitTokens) * 10n ** BigInt(scale);
  const scaled = (numerator * 10n ** BigInt(COST_SCALE)) / denominator;
  const text = scaled.toString().padStart(COST_SCALE + 1, "0");
  const whole = text.slice(0, -COST_SCALE);
  const frac = text.slice(-COST_SCALE).replace(/0+$/u, "");
  return frac ? `${whole}.${frac}` : whole;
};

/** Adds exact decimal strings (for totals), keeping full precision. */
export const addCosts = (values: string[]): string => {
  const parsed = values.map(parse);
  const scale = Math.max(0, ...parsed.map((p) => p.scale));
  const sum = parsed.reduce(
    (acc, p) => acc + p.units * 10n ** BigInt(scale - p.scale),
    0n
  );
  if (!scale) {
    return sum.toString();
  }
  const text = sum.toString().padStart(scale + 1, "0");
  const frac = text.slice(-scale).replace(/0+$/u, "");
  return frac ? `${text.slice(0, -scale)}.${frac}` : text.slice(0, -scale);
};
