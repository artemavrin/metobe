// Speed of the forecast on the server side: SQL aggregates vs reading rows and replaying in TypeScript.
// Usage: node --import tsx bench.ts [--schema=public] [--weeks=8] [--runs=7]
import { connect } from "./db.ts";
import { forecastNextMonth, replayLimits, WEEK, type Options, type Tariff } from "./forecast.ts";
import { loadRuns, loadSeats } from "./load.ts";
import { baseOptions, MODEL_X, tariffs as makeTariffs } from "./scenario.ts";
import { sqlForecast } from "./sql-forecast.ts";

const arg = (k: string, d: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const schema = arg("schema", "public");
const weeks = Number(arg("weeks", "8"));
const reps = Number(arg("runs", "7"));
const org = "org1";

const sql = connect();
const seats = await loadSeats(sql, schema, org);
const base = baseOptions();
const o0: Options = { ...base, windowStart: base.windowEnd - weeks * WEEK };
const T0 = makeTariffs(seats.length);
const tight = (): Tariff[] =>
  T0.map((t, i) => (i === 0 ? { ...t, limitWeek: 240, limit5h: 90 } : t));

const scenarios: { name: string; o: Options; t: Tariff[] }[] = [
  { name: "base", o: o0, t: T0 },
  { name: "growth ×1.5", o: { ...o0, growth: 1.5 }, t: T0 },
  { name: "all answers on model X", o: { ...o0, model: MODEL_X }, t: T0 },
  {
    name: "rate 100, fee 8 %, no VAT refund",
    o: { ...o0, fx: 100, markup: 8, platformVat: 0 },
    t: T0,
  },
  { name: "Regular limits 240 / 90", o: o0, t: tight() },
  { name: "rolling week", o: { ...o0, weekMode: "rolling" }, t: T0 },
];

const stat = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return `${s[Math.floor(s.length / 2)]!.toFixed(0)} (max ${s.at(-1)!.toFixed(0)})`;
};
async function time<T>(f: () => Promise<T>) {
  const ts: number[] = [];
  let last!: T;
  for (let i = 0; i < reps; i++) {
    const t = performance.now();
    last = await f();
    ts.push(performance.now() - t);
  }
  return { ts, last };
}

const [cnt] = await sql<{ n: number }[]>`select count(*)::int n from ${sql(schema)}.model_runs
  where organization_id = ${org} and created_at >= timestamptz 'epoch' + ${o0.windowStart}::float8 * interval '1 millisecond'`;
console.log(
  `schema ${schema}: ${seats.length} seats, ${cnt?.n} runs in the last ${weeks} weeks, ${reps} repetitions each; median ms (max)\n`,
);

// Warm up the connection and the JIT once, as a running server would be.
await loadRuns(sql, schema, org, seats, o0.windowStart, o0.windowEnd);

const loadT = await time(() => loadRuns(sql, schema, org, seats, o0.windowStart, o0.windowEnd));
console.log(`read rows into columns (cold request, no cache)   ${stat(loadT.ts)}`);
const runs = loadT.last;

console.log(
  "\nscenario                              TS read+replay   TS replay only   SQL aggregates   SQL vs TS: error of SQL: models/seat, weeks at limit, people at 5 h (exact→SQL), per tariff",
);
for (const s of scenarios) {
  const cold = await time(async () => {
    const r = await loadRuns(sql, schema, org, seats, s.o.windowStart, s.o.windowEnd);
    return forecastNextMonth(replayLimits(r, seats, s.t, s.o), seats, s.t, s.o);
  });
  const warm = await time(async () =>
    forecastNextMonth(replayLimits(runs, seats, s.t, s.o), seats, s.t, s.o),
  );
  const agg = await time(() => sqlForecast(sql, schema, org, s.t, s.o));
  const exact = warm.last.tariffs;
  const approx = agg.last;
  const err = exact
    .map((e, i) => {
      const a = approx[i]!;
      return `${(((a.models - e.perSeat.models) / e.perSeat.models) * 100).toFixed(1)} % / ${((a.shareWeeksHit - e.shareWeeksHit) * 100).toFixed(2)} pp / ${e.usersHit5}→${a.usersHit5}`;
    })
    .join("  |  ");
  console.log(
    `${s.name.padEnd(36)}  ${stat(cold.ts).padEnd(15)}  ${stat(warm.ts).padEnd(15)}  ${stat(agg.ts).padEnd(15)}  ${err}`,
  );
}
await sql.end();
