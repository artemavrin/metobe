// Numbers as people read them in a Russian answer: a thin gap between thousands, a comma, «млн» and «млрд» for the
// big ones. The tile shows the short form; the exact one lives in the tooltip and `title`.

const NBSP = " ";
const exact = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export const exactOf = (n: number) => exact.format(n);

const digits = (n: number, max: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: max }).format(n);

/** 1 238 400 000 → «1,24 млрд»; 964 800 → «964,8 тыс.»; 12 → «12». */
export const compact = (n: number): { value: string; scale: string } => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return { scale: `${NBSP}млрд`, value: digits(n / 1e9, 2) };
  if (abs >= 1e6) return { scale: `${NBSP}млн`, value: digits(n / 1e6, abs >= 1e8 ? 0 : 1) };
  if (abs >= 1e4) return { scale: `${NBSP}тыс.`, value: digits(n / 1e3, abs >= 1e5 ? 0 : 1) };
  return { scale: "", value: digits(n, abs < 100 ? 1 : 0) };
};

export const signed = (n: number, max = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${digits(Math.abs(n), max)}`;

export const percent = (n: number, max = 1) => `${digits(n, max)}${NBSP}%`;
