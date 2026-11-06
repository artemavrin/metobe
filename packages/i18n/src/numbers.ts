// How figures are said in the user's language — one source for the chat's widgets (through next-intl's locale) and for
// what is rendered on the server without React (a task's letter). Big numbers short («1,69 млрд»), small ones whole,
// percents and signed changes with a real minus.

const NBSP = " ";

const signOf = (n: number) => {
  if (n > 0) {
    return "+";
  }
  return n < 0 ? "−" : "";
};

/** `withUnit("4,8 млн", "₽")` → «4,8 млн ₽», with a non-breaking space. */
export const withUnit = (text: string, unit?: string) =>
  unit ? `${text}${NBSP}${unit}` : text;

/** The figures' formatters for a locale. */
export const numberFormat = (locale: string) => {
  const fmt = (n: number, options: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale, options).format(n);
  const exact = (n: number) => fmt(n, { maximumFractionDigits: 2 });
  const short = (n: number) =>
    Math.abs(n) >= 1e4
      ? fmt(n, { maximumSignificantDigits: 3, notation: "compact" })
      : fmt(n, { maximumFractionDigits: Math.abs(n) < 100 ? 1 : 0 });
  const percent = (n: number, digits = 1) =>
    `${fmt(n, { maximumFractionDigits: digits })}${NBSP}%`;
  const signed = (n: number, digits = 1) =>
    `${signOf(n)}${fmt(Math.abs(n), { maximumFractionDigits: digits })}`;
  return { exact, percent, short, signed, withUnit };
};

export type NumberFormat = ReturnType<typeof numberFormat>;
