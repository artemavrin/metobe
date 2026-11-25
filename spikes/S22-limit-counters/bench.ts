// Part 1 of S22: p95 of "what is left in the 5 h window and in the week" on 100k rows of one person.
// Index variants × column type (numeric vs bigint micro-units); sequential, then under concurrent load + a writer.
import { writeFileSync } from "node:fs";

import { ANCHOR, WINDOW_MS, ms, sql, stats, weekStart } from "./common.ts";

type Col = "charge" | "charge_u";
const wk = weekStart(ANCHOR);

/** The check of ARCH §20.8: the window row, then one sum over the earlier of the two starts. */
const check = async (userId: string, now: Date, col: Col) => {
  const [w] =
    await sql`select started_at from limit_windows where user_id = ${userId} and kind = '5h'`;
  const open =
    w && now.getTime() - w.started_at.getTime() < WINDOW_MS
      ? (w.started_at as Date)
      : now;
  const lo = open < wk ? open : wk;
  const c = sql(col);
  const [r] = await sql`
    select coalesce(sum(${c}) filter (where created_at >= ${open}), 0) as five,
           coalesce(sum(${c}) filter (where created_at >= ${wk}), 0) as week
    from runs where user_id = ${userId} and created_at >= ${lo}`;
  return r!;
};

/** Same, in one round trip: the window start comes from a CTE. */
const checkOne = async (userId: string, now: Date, col: Col) => {
  const c = sql(col);
  const [r] = await sql`
    with w as (
      select case when ${now} - started_at < interval '5 hours' then started_at else ${now}::timestamptz end as s
      from limit_windows where user_id = ${userId} and kind = '5h'
      union all select ${now}::timestamptz where not exists (select 1 from limit_windows where user_id = ${userId} and kind = '5h')
      limit 1
    )
    select coalesce(sum(${c}) filter (where created_at >= w.s), 0) as five,
           coalesce(sum(${c}) filter (where created_at >= ${wk}), 0) as week
    from w, runs where user_id = ${userId} and created_at >= least(w.s, ${wk}::timestamptz)
    group by w.s`;
  return r ?? { five: 0, week: 0 };
};

const setIndex = async (name: "I0" | "I1" | "I2") => {
  await sql`drop index if exists runs_user_time`;
  const t0 = process.hrtime.bigint();
  if (name === "I0")
    await sql`create index runs_user_time on runs (user_id, created_at)`;
  if (name === "I1")
    await sql`create index runs_user_time on runs (user_id, created_at) include (charge)`;
  if (name === "I2")
    await sql`create index runs_user_time on runs (user_id, created_at) include (charge_u)`;
  await sql`vacuum (analyze) runs`;
  const [s] =
    await sql`select pg_size_pretty(pg_relation_size('runs_user_time')) size`;
  return { build: `${Math.round(ms(t0))} ms (with vacuum)`, size: s!.size };
};

const heavy = ["h_spread", "h_burst", "h_hot"];
const bgUsers = async (n: number) =>
  (
    await sql`select user_id from limit_windows where user_id like 'u%' order by random() limit ${n}`
  ).map((r) => r.user_id as string);

const seq = async (users: string[], reps: number, col: Col, fn = check) => {
  const xs: number[] = [];
  for (let i = 0; i < reps; i++) {
    const t0 = process.hrtime.bigint();
    await fn(users[i % users.length]!, ANCHOR, col);
    xs.push(ms(t0));
  }
  return stats(xs);
};

const explain = async (userId: string, col: Col) => {
  const c = sql(col);
  const rows = await sql`
    explain (analyze, buffers, costs off, timing off, summary on)
    select coalesce(sum(${c}) filter (where created_at >= ${ANCHOR}::timestamptz - interval '5 hours'), 0),
           coalesce(sum(${c}) filter (where created_at >= ${wk}), 0)
    from runs where user_id = ${userId} and created_at >= ${wk}`;
  const lines = rows.map((r) => r["QUERY PLAN"] as string);
  return lines
    .filter((l) => /Scan|Heap Fetches|Buffers|Execution|Rows Removed/.test(l))
    .map((l) => l.trim());
};

const results: Record<string, unknown> = {};
const combos: Array<["I0" | "I1" | "I2", Col]> = [
  ["I0", "charge"],
  ["I1", "charge"],
  ["I0", "charge_u"],
  ["I2", "charge_u"],
];
const bg = await bgUsers(300);

// 0. no index at all (the table has only the primary key): why the index is needed
await sql`drop index if exists runs_user_time`;
await sql`analyze runs`;
results["no-index (seq scan), h_burst, 5 runs"] = await seq(
  ["h_burst"],
  5,
  "charge"
);

for (const [idx, col] of combos) {
  const built = await setIndex(idx);
  console.log(`\n== ${idx} + ${col}`, built);
  const r: Record<string, unknown> = { ...built };
  await seq(heavy, 6, col); // warm
  for (const u of heavy) r[u] = await seq([u], 300, col);
  r["bg (300 other people)"] = await seq(bg, 900, col);
  r["h_burst, one round trip (CTE)"] = await seq(
    ["h_burst"],
    300,
    col,
    checkOne
  );
  r["plan h_burst"] = await explain("h_burst", col);
  r["plan h_hot"] = await explain("h_hot", col);
  results[`${idx}+${col}`] = r;
  console.log(JSON.stringify(r, null, 1));
}

writeFileSync("results/bench-seq.json", JSON.stringify(results, null, 1));
await sql.end();
