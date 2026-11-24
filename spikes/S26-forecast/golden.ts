// Writes `golden.json`: the calculator's answers on a small synthetic dataset (it is generated from a seed, so only
// the answers are stored). `forecast.test.ts` checks `replayLimits` against them without the private calculator file.
// Run it again only if the calculator's rules change on purpose.
import fs from "node:fs";
import { openCalculator, type CalcData, type CalcState } from "./calculator.ts";
import { MIN } from "./forecast.ts";
import { generate } from "./generate.ts";
import { GOLDEN_MODEL, GOLDEN_PARAMS, GOLDEN_SCENARIOS } from "./golden-spec.ts";
import { WINDOW_END, WINDOW_START } from "./scenario.ts";

const { seats, runs } = generate(GOLDEN_PARAMS);
const active = [...new Set(runs.map((r) => r.user))].sort((x, y) => x - y);
const idx = new Map(active.map((u, i) => [u, i]));
const data: CalcData = {
  start: new Date(WINDOW_START).toISOString(),
  end: new Date(WINDOW_END).toISOString(),
  users: active.map((u) => seats[u]!.id),
  ev: runs.map((r) => [
    idx.get(r.user)!,
    (r.t - WINDOW_START) / MIN,
    r.purpose === "chat" ? 1 : 0,
    r.usd,
    0,
    r.tin,
    r.tc,
    r.tout,
  ]),
};
const calc = openCalculator(data, { x: { label: "X", ...GOLDEN_MODEL } });

const out = GOLDEN_SCENARIOS.map((sc) => ({
  ...sc,
  tiers: sc.tiers.map((t, k) => {
    const state: CalcState = {
      ...calc.defaults,
      ...sc.state,
      memory: false,
      price: t.price,
      l5: t.l5,
      lw: t.lw,
    };
    const lim = calc.replay(state, true).users;
    const free = calc.replay(state, false).users;
    return {
      ...t,
      // Only people of this tariff: [spent, blocked, stopped, requests, hit5, hitW, weeks, maxWeekFree, max5Free]
      users: active
        .map((u, i) => (seats[u]!.tariff === k ? i : -1))
        .filter((i) => i >= 0)
        .map((i) => [
          i,
          lim[i]!.spent,
          lim[i]!.blocked,
          lim[i]!.stopped,
          lim[i]!.chats,
          lim[i]!.hit5,
          lim[i]!.hitW,
          lim[i]!.weeks,
          free[i]!.maxW,
          free[i]!.max5,
        ]),
    };
  }),
}));
fs.writeFileSync(new URL("./golden.json", import.meta.url), JSON.stringify(out));
console.log(`golden.json: ${out.length} scenarios, ${active.length} people`);
