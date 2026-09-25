// Prices are kept exactly as typed, per any number of tokens (core/pricing). For display, a price per 1, 10, 100…
// tokens can move to another power of ten exactly — the decimal point shifts, no floating point, no rounding.

const isPowerOfTen = (n: number) => n > 0 && Number.isInteger(Math.log10(n));

/** Whether `convert` can move a price from `from` tokens to `to` tokens without changing a digit. */
export const canConvert = (from: number, to: number) =>
  isPowerOfTen(from) && isPowerOfTen(to);

/** A decimal price per `from` tokens as the same price per `to` tokens: 0.0000008 per 1 → 0.8 per 1M. */
export const convert = (value: string, from: number, to: number) => {
  if (!canConvert(from, to) || !/^\d*\.?\d*$/u.test(value) || value === "") {
    return value;
  }
  const shift = Math.round(Math.log10(to / from));
  const [int = "", frac = ""] = value.split(".");
  let digits = `${int}${frac}`;
  let point = int.length + shift;
  if (point < 0) {
    digits = "0".repeat(-point) + digits;
    point = 0;
  }
  if (point > digits.length) {
    digits += "0".repeat(point - digits.length);
  }
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/u, "") || "0";
  const fraction = digits.slice(point).replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole;
};
