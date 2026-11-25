// Does the synthetic set have the shape of the live one? Shape only: ratios and shares, not absolute figures.
// The live set is read from the calculator file at run time; its numbers are printed here, not stored in the repo.
import { openCalculator } from "./calculator.ts";
import { DAY, MONTH_DAYS, runCosts, runsFromRows, WEEK, type Runs } from "./forecast.ts";
import { generate, paramsFromArgv } from "./generate.ts";
import { baseOptions, tariffs } from "./scenario.ts";

const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))]!;
};

type Shape = {
  /** p90 / p50 of the cost of a chat answer */
  costSpread: number;
  /** service runs per chat answer */
  servicePerChat: number;
  /** answers per person-week with at least one answer: mean, and p90 / median */
  weeklyMean: number;
  weeklySpread: number;
  /** share of all spend of the busiest 20 % of people */
  top20: number;
  /** share of person-weeks above the weekly limit of the first tariff, above the 5-hour limit (of windows) */
  overWeek: number;
  over5h: number;
};

function shape(runs: Runs, users: number, start: number): Shape {
  const o = baseOptions();
  const cost = runCosts(runs, { ...o, windowStart: start });
  const chat: number[] = [];
  let svc = 0;
  const perUser = new Float64Array(users);
  const perUserWeek = new Map<string, { n: number; spent: number }>();
  const lim = tariffs()[0]!;
  const win5 = new Map<string, number>();
  for (let i = 0; i < runs.length; i++) {
    perUser[runs.user[i]!]! += cost[i]!;
    const w = Math.floor((runs.t[i]! - start) / WEEK);
    const key = `${runs.user[i]}:${w}`;
    const e = perUserWeek.get(key) ?? { n: 0, spent: 0 };
    e.spent += cost[i]!;
    if (runs.request[i]) {
      chat.push(cost[i]!);
      e.n++;
    } else svc++;
    perUserWeek.set(key, e);
    const b = `${runs.user[i]}:${Math.floor((runs.t[i]! - start) / (5 * 3600e3))}`;
    win5.set(b, (win5.get(b) ?? 0) + cost[i]!);
  }
  const weeks = [...perUserWeek.values()].filter((e) => e.n > 0);
  const sorted = [...perUser].sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0);
  const top = sorted.slice(0, Math.max(1, Math.round(users * 0.2))).reduce((a, b) => a + b, 0);
  return {
    costSpread: q(chat, 0.9) / q(chat, 0.5),
    servicePerChat: svc / chat.length,
    weeklyMean: weeks.reduce((a, e) => a + e.n, 0) / weeks.length,
    weeklySpread:
      q(
        weeks.map((e) => e.n),
        0.9,
      ) /
      q(
        weeks.map((e) => e.n),
        0.5,
      ),
    top20: top / total,
    overWeek: weeks.filter((e) => e.spent > lim.limitWeek!).length / weeks.length,
    over5h: [...win5.values()].filter((v) => v > lim.limit5h!).length / win5.size,
  };
}

const calc = openCalculator();
const live = shape(
  runsFromRows(
    calc.events
      .map((e, i) => [e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7]])
      .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!),
  ),
  calc.users.length,
  calc.start,
);
const { seats, runs } = generate(paramsFromArgv(process.argv.slice(2)));
const synth = shape(
  runsFromRows(
    runs.map((r) => [r.user, r.t, r.purpose === "chat" ? 1 : 0, r.usd, 0, r.tin, r.tc, r.tout]),
  ),
  seats.length,
  baseOptions().windowStart,
);

// Tolerances: the live set is 11 people over ~5 weeks, so only the order of magnitude can be checked.
const checks: [keyof Shape, string, (l: number, s: number) => boolean][] = [
  ["costSpread", "p90/p50 of an answer's cost, ×1.6", (l, s) => s / l < 1.6 && l / s < 1.6],
  ["servicePerChat", "service runs per answer, ±30 %", (l, s) => Math.abs(s / l - 1) < 0.3],
  ["weeklyMean", "answers per active person-week, ±35 %", (l, s) => Math.abs(s / l - 1) < 0.35],
  ["weeklySpread", "p90/median of weekly answers, ×1.6", (l, s) => s / l < 1.6 && l / s < 1.6],
  ["top20", "share of spend of the top 20 %, ±0.12", (l, s) => Math.abs(l - s) < 0.12],
  ["overWeek", "person-weeks over the weekly limit, ±4 pp", (l, s) => Math.abs(l - s) < 0.04],
  ["over5h", "5-hour buckets over the limit, ±3 pp", (l, s) => Math.abs(l - s) < 0.03],
];
let all = true;
for (const [k, what, ok] of checks) {
  const good = ok(live[k], synth[k]);
  all &&= good;
  console.log(
    `${good ? "match" : "DIFFERENT"}  ${what}   live ${live[k].toFixed(3)}  synthetic ${synth[k].toFixed(3)}`,
  );
}
console.log(all ? "shape matches" : "shape differs");
void DAY;
void MONTH_DAYS;
process.exit(all ? 0 : 1);
