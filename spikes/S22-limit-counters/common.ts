import { TZDate } from "@date-fns/tz";
import { startOfWeek } from "date-fns";
import postgres from "postgres";

export const sql = postgres(process.env.DATABASE_URL!, {
  max: 24,
  onnotice: () => {},
});

if (new URL(process.env.DATABASE_URL!).pathname !== "/spike_s22")
  throw new Error("DATABASE_URL must point to spike_s22");

/** Fixed "now" of the benchmark: a Sunday evening, so the week of a busy person is full (worst case for the sum). */
export const ANCHOR = new Date("2026-11-29T17:00:00Z"); // 20:00 in Europe/Moscow
export const ORG_TZ = "Europe/Moscow";
export const WINDOW_MS = 5 * 3600_000;

/** Monday 00:00 in the organization's time zone (ARCH §20.8): computed, no row. */
export const weekStart = (now: Date, tz = ORG_TZ) =>
  new Date(startOfWeek(new TZDate(now, tz), { weekStartsOn: 1 }).getTime());

export const pct = (sorted: number[], p: number) =>
  sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ]!;

export const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const f = (x: number) => Math.round(x * 100) / 100;
  return {
    n: s.length,
    p50: f(pct(s, 50)),
    p95: f(pct(s, 95)),
    p99: f(pct(s, 99)),
    max: f(s.at(-1)!),
  };
};

export const ms = (t0: bigint) => Number(process.hrtime.bigint() - t0) / 1e6;
