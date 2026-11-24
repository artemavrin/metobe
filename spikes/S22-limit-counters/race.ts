// Part 3 of S22: how far two answers that start at the same moment overshoot the limit. No model: a step is a pause and a cost.
// Policies:
//   A. remainder fixed at start; each answer stops when its own cost ≥ remainder (ARCH §20.8 as written)
//   B. step cost is written to Postgres right after the step; stopWhen re-reads the person's sum (≥ limit → stop)
//   C. B + before a step the answer reserves one maximal step (Redis-like in-flight counter); steps that don't fit are not started
// First a virtual-time model (200k trials per row), then B and A on the real Postgres with real concurrent writers.
import { writeFileSync } from "node:fs";

import { sql, stats } from "./common.ts";

const mulberry32 = (a: number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Step cost in units of S (S = the maximal step). */
const dists = {
  "uniform(0,S)": (r: () => number) => Math.max(0.001, r()),
  "mostly small, rare big (exp, mean S/5, cap S)": (r: () => number) =>
    Math.min(1, Math.max(0.001, (-Math.log(1 - r()) * 1) / 5)),
};

type Policy = "A" | "B" | "C";
/** Virtual time. `n` answers start together; each step takes 5–30 s. Returns overspend and unspent budget, in S. */
const trial = (
  policy: Policy,
  n: number,
  R: number,
  step: (r: () => number) => number,
  r: () => number
) => {
  type Ans = {
    next: number;
    cost: number;
    active: boolean;
    cum: number;
    reserved: boolean;
  };
  let written = 0;
  let reserved = 0;
  const answers: Ans[] = [];
  const begin = (a: Ans, t: number) => {
    if (policy === "C") {
      if (written + reserved + 1 > R) {
        a.active = false; // the step might not fit
        return;
      }
      reserved += 1;
      a.reserved = true;
    }
    a.next = t + 5 + r() * 25;
    a.cost = step(r);
  };
  for (let i = 0; i < n; i++) {
    const a: Ans = { next: 0, cost: 0, active: true, cum: 0, reserved: false };
    answers.push(a);
    begin(a, 0);
  }
  for (;;) {
    let cur: Ans | undefined;
    for (const a of answers)
      if (a.active && (!cur || a.next < cur.next)) cur = a;
    if (!cur) break;
    written += cur.cost;
    cur.cum += cur.cost;
    if (cur.reserved) {
      reserved -= 1;
      cur.reserved = false;
    }
    const stop = policy === "A" ? cur.cum >= R : written >= R;
    if (stop) cur.active = false;
    else begin(cur, cur.next);
  }
  return { over: Math.max(0, written - R), unspent: Math.max(0, R - written) };
};

const summarize = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return {
    mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3),
    p99: +s[Math.floor(s.length * 0.99)]!.toFixed(3),
    max: +s.at(-1)!.toFixed(3),
  };
};

const out: Record<string, unknown> = {
  unit: "S = the maximal cost of one step; numbers are overspend in S",
};
const TRIALS = 200_000;
for (const [name, dist] of Object.entries(dists)) {
  for (const n of [1, 2, 3]) {
    for (const policy of ["A", "B", "C"] as const) {
      const r = mulberry32(42 + n);
      const over: number[] = [];
      const unspent: number[] = [];
      for (let i = 0; i < TRIALS; i++) {
        const R = 0.5 + r() * 9.5; // remainder at the check: from half a step to ten steps
        const x = trial(policy, n, R, dist, r);
        over.push(x.over);
        unspent.push(x.unspent);
      }
      out[`${name} | ${n} answer(s) | ${policy}`] = {
        overspend: summarize(over),
        unspentOfRemainder: summarize(unspent).mean,
      };
    }
  }
}
// A with a big remainder: two answers each spend the whole remainder
{
  const r = mulberry32(7);
  const over: number[] = [];
  for (let i = 0; i < TRIALS; i++)
    over.push(trial("A", 2, 50, dists["uniform(0,S)"], r).over);
  out["A, remainder 50 S, 2 answers (uniform)"] = summarize(over);
  const overB: number[] = [];
  for (let i = 0; i < TRIALS; i++)
    overB.push(trial("B", 2, 50, dists["uniform(0,S)"], r).over);
  out["B, remainder 50 S, 2 answers (uniform)"] = summarize(overB);
}
console.log(JSON.stringify(out, null, 1));

// ---- real Postgres: two concurrent answers, steps 20–80 ms, S = 0.2, limit 1.0; sum re-read after each step ----
const S = 0.2;
const L = 1.0;
const real = async (policy: "A" | "B", trials: number) => {
  const overs: number[] = [];
  const checks: number[] = [];
  for (let i = 0; i < trials; i++) {
    const user = `race_${policy}_${i}`;
    const R = 0.5 * S + Math.random() * 6 * S;
    await sql`insert into runs (user_id, organization_id, status, charge, charge_u, created_at) values (${user}, 'bench', 'ok', ${L - R}, 0, now())`;
    const sumOf = async () => {
      const t0 = process.hrtime.bigint();
      const [x] =
        await sql`select coalesce(sum(charge), 0)::float8 s from runs where user_id = ${user}`;
      checks.push(Number(process.hrtime.bigint() - t0) / 1e6);
      return x!.s as number;
    };
    const startSum = await sumOf(); // both answers pass the check: nothing of theirs is recorded yet
    const remainder = L - startSum;
    await Promise.all(
      [0, 1].map(async () => {
        let cum = 0;
        for (;;) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));
          const c = 0.005 + Math.random() * (S - 0.005);
          cum += c;
          await sql`insert into runs (user_id, organization_id, status, charge, charge_u, created_at) values (${user}, 'bench', 'ok', ${c}, 0, now())`;
          if (policy === "A" ? cum >= remainder : (await sumOf()) >= L) return;
        }
      })
    );
    overs.push(Math.max(0, (await sumOf()) - L) / S);
  }
  const s = [...overs].sort((a, b) => a - b);
  return {
    trials,
    overspendInS: {
      mean: +(overs.reduce((a, b) => a + b, 0) / overs.length).toFixed(3),
      p99: +s[Math.floor(s.length * 0.99)]!.toFixed(3),
      max: +s.at(-1)!.toFixed(3),
    },
    recheckMs: stats(checks),
  };
};
out["real Postgres, 2 answers, B (recheck after each step)"] = await real(
  "B",
  300
);
out["real Postgres, 2 answers, A (remainder fixed at start)"] = await real(
  "A",
  300
);
await sql`delete from runs where organization_id = 'bench'`;
await sql`vacuum (analyze) runs`;
writeFileSync("results/race.json", JSON.stringify(out, null, 1));
console.log(
  JSON.stringify(out["real Postgres, 2 answers, B (recheck after each step)"]),
  JSON.stringify(out["real Postgres, 2 answers, A (remainder fixed at start)"])
);
await sql.end();
