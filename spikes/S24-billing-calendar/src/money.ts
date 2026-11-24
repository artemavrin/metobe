import { daysInMonth, localParts } from "./time";

// Money is integer kopecks. All rounding is half-up (amounts are never negative), one rounding per line.

export type Kopecks = number;

export interface Vat {
  /** Basis points: 2200 = 22 %. */
  rateBp: number;
  /** true: the tariff price already contains VAT. */
  included: boolean;
}

/** round(a / b) half-up, for a >= 0, b > 0, in safe integers. */
export const roundDiv = (a: number, b: number) => {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b <= 0) {
    throw new RangeError(`roundDiv(${a}, ${b})`);
  }
  return Math.floor((2 * a + b) / (2 * b));
};

/** Days left in the month for a change made at `at`, the day of the change included (ARCH §20.10). */
export const remainingDays = (at: Date, timeZone: string) => {
  const p = localParts(at, timeZone);
  const total = daysInMonth(p.year, p.month);
  return { remaining: total - p.day + 1, total };
};

/** `monthly` × remaining days / days in the month, by the zone's calendar. */
export const prorate = (monthly: Kopecks, at: Date, timeZone: string) => {
  const { remaining, total } = remainingDays(at, timeZone);
  return roundDiv(monthly * remaining, total);
};

export interface VatSplit {
  net: Kopecks;
  vat: Kopecks;
  gross: Kopecks;
}

/** Splits an amount in the tariff's price basis into net, VAT and gross. */
export const vatSplit = (amount: Kopecks, vat: Vat): VatSplit => {
  if (vat.included) {
    const v = roundDiv(amount * vat.rateBp, 10_000 + vat.rateBp);
    return { gross: amount, net: amount - v, vat: v };
  }
  const v = roundDiv(amount * vat.rateBp, 10_000);
  return { gross: amount + v, net: amount, vat: v };
};
