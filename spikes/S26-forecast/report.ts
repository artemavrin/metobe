// What the screen would show: the forecast for next month, then a few turns of "Покрутить" with the time of each.
// Usage: node --import tsx report.ts [--schema=public]
import { connect } from "./db.ts";
import {
  forecastNextMonth,
  replayLimits,
  type Forecast,
  type Options,
  type Tariff,
} from "./forecast.ts";
import { loadRuns, loadSeats } from "./load.ts";
import { baseOptions, MODEL_X, tariff, tariffs as makeTariffs, WINDOW_END } from "./scenario.ts";

const schema = process.argv.find((a) => a.startsWith("--schema="))?.split("=")[1] ?? "public";
const sql = connect();
const seats = await loadSeats(sql, schema, "org1");
const o0: Options = { ...baseOptions(), windowStart: WINDOW_END - 28 * 86400e3 };
const t0 = makeTariffs(seats.length);

let t = performance.now();
const runs = await loadRuns(sql, schema, "org1", seats, o0.windowStart, o0.windowEnd);
const readMs = performance.now() - t;
console.log(`window: last 4 weeks, ${runs.length} runs, read once in ${readMs.toFixed(0)} ms\n`);

const rub = (v: number) => Math.round(v).toLocaleString("ru-RU");
const pct = (v: number) => `${(v * 100).toFixed(1)} %`;
function show(name: string, f: Forecast, ms: number) {
  console.log(`## ${name}  (${ms.toFixed(0)} ms)`);
  console.log(
    `   next month, ₽: revenue ${rub(f.total.revenueGross)}, VAT ${rub(f.total.vat)}, models ${rub(f.total.models)}, servers ${rub(f.total.servers)}, left ${rub(f.total.margin)}`,
  );
  for (const x of f.tariffs) {
    console.log(
      `   ${x.name.padEnd(8)} ${String(x.seatsNext).padStart(4)} seats  models/seat ${rub(x.perSeat.models).padStart(5)}  left/seat ${rub(x.perSeat.margin).padStart(6)}  worst case left ${rub(x.perSeat.worstMargin).padStart(6)}  ` +
        `weeks at limit ${pct(x.shareWeeksHit)}  rejected ${pct(x.shareRejected)}  people at 5 h ${x.usersHit5}  near limit ${x.nearLimit}`,
    );
  }
}
function run(name: string, o: Options, tf: Tariff[]) {
  const s = performance.now();
  const f = forecastNextMonth(replayLimits(runs, seats, tf, o), seats, tf, o);
  show(name, f, performance.now() - s);
}

run("as is", o0, t0);
run(
  "Regular: weekly limit halved (260 / 90)",
  o0,
  t0.map((x, i) => (i === 0 ? { ...x, limitWeek: 260, limit5h: 90 } : x)),
);
run("Regular: price 3600, limits by the break-even rule", o0, [
  tariff("regular", "Обычный", 3600, t0[0]!.seatsNext),
  t0[1]!,
  t0[2]!,
]);
run("load ×2", { ...o0, growth: 2 }, t0);
run("all answers on model X", { ...o0, model: MODEL_X }, t0);
run("rate 100, fee 8 %", { ...o0, fx: 100, markup: 8 }, t0);
await sql.end();
