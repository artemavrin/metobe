// Scenario of the spike: three tariffs and the knobs. All numbers are assumptions of the spike (ORGS-PLAN §5.1:
// limits ×1 / ×2 / ×4; Max has no 5-hour window), not measured ones.
import { breakEvenWeek, DAY, MSK, type ModelPrice, type Options, type Tariff } from "./forecast.ts";

export const SERVERS_PER_SEAT = 150;

const round10 = (v: number) => Math.round(v / 10) * 10;

/** A tariff with limits set by the "week to zero" rule: weekly = break-even rounded down, 5 hours = a third. */
export function tariff(
  id: string,
  name: string,
  price: number,
  seatsNext: number,
  window5h = true,
  vatPct = 22,
  infra = SERVERS_PER_SEAT,
): Tariff {
  const week = Math.floor(breakEvenWeek(price, vatPct, infra) / 10) * 10;
  return {
    id,
    name,
    price,
    vatPct,
    limitWeek: week,
    limit5h: window5h ? round10(week / 3) : null,
    seatsNext,
  };
}

export const TARIFF_SHARE = [0.7, 0.25, 0.05] as const;

export const tariffs = (seats = 1000): Tariff[] => [
  tariff("regular", "Обычный", 3000, Math.round(seats * TARIFF_SHARE[0])),
  tariff("pro", "Про", 6000, Math.round(seats * TARIFF_SHARE[1])),
  tariff("max", "Макс", 12000, Math.round(seats * TARIFF_SHARE[2]), false),
];

/** Eight weeks ending on a Monday 00:00 Moscow time, so that calendar weeks are whole. */
export const WINDOW_END = Date.UTC(2026, 10, 23) - MSK;
export const WINDOW_START = WINDOW_END - 56 * DAY;

export const baseOptions = (): Options => ({
  fx: 90,
  markup: 4,
  platformVat: 22,
  model: null,
  memoryUsdPerRequest: 0,
  growth: 1,
  weekMode: "calendar",
  tzOffset: MSK,
  infraPerSeat: SERVERS_PER_SEAT,
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
});

/** Prices of the base model used to cost synthetic runs, $ per 1M tokens. Round placeholders of a cheap model. */
export const SYNTH_PRICE: ModelPrice = { in: 0.25, cache: 0.025, out: 1 };
/** A model "X" for the re-pricing knob: about ten times the base. */
export const MODEL_X: ModelPrice = { in: 3, cache: 0.3, out: 15 };
