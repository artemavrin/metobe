// What the golden file covers; shared by `golden.ts` (writes it from the calculator) and `forecast.test.ts`.
import type { ModelPrice } from "./forecast.ts";
import { DEFAULTS, type GenParams } from "./generate.ts";
import { MODEL_X } from "./scenario.ts";

export const GOLDEN_PARAMS: GenParams = {
  ...DEFAULTS,
  seats: 80,
  seed: 7,
  weeklyMedian: 25,
  volume: 1,
};
export const GOLDEN_MODEL: ModelPrice = MODEL_X;

type Limits = { price: number; l5: number | null; lw: number | null };
export type GoldenScenario = {
  name: string;
  state: {
    vat: 0 | 22;
    infra: number;
    fx: number;
    markup: number;
    weekMode: "calendar" | "rolling";
    model: string;
    growth: number;
  };
  tiers: Limits[];
};

const base = {
  vat: 22,
  infra: 150,
  fx: 90,
  markup: 4,
  weekMode: "calendar",
  model: "actual",
  growth: 1,
} as const;
const normal: Limits[] = [
  { price: 3000, l5: 180, lw: 540 },
  { price: 6000, l5: 380, lw: 1130 },
  { price: 12000, l5: null, lw: 2300 },
];
const tight: Limits[] = [
  { price: 3000, l5: 40, lw: 120 },
  { price: 6000, l5: 90, lw: 250 },
  { price: 12000, l5: null, lw: 500 },
];

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  { name: "default limits", state: base, tiers: normal },
  { name: "tight limits", state: base, tiers: tight },
  { name: "no limits", state: base, tiers: normal.map((t) => ({ ...t, l5: null, lw: null })) },
  { name: "all answers on model X, tight", state: { ...base, model: "x" }, tiers: tight },
  {
    name: "rolling week, growth ×3",
    state: { ...base, weekMode: "rolling", growth: 3 },
    tiers: tight,
  },
  {
    name: "rate 100, fee 8 %, no VAT refund",
    state: { ...base, vat: 0, fx: 100, markup: 8 },
    tiers: normal,
  },
];
