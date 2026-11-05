import type { ChartValue } from "@metobe/contracts/chart";

/** A number out of what the model wrote — 12, "12", "12,5", "1 200"; anything else is a gap. */
export const toNumber = (value: ChartValue | undefined): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const n = Number(value.replaceAll(/[\s ]/gu, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
