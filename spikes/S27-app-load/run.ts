import { fork, spawn } from "node:child_process";
import { openSync, readFileSync, writeFileSync } from "node:fs";

import postgres from "postgres";

import type { Record as Rec } from "./worker.ts";

// Orchestrator for one load level: starts the app (production standalone build on :3427) with the lag preload,
// warms it up with one answer, runs N closed-loop slots for RAMP + HOLD seconds across WORKERS driver processes,
// samples the app's RSS/CPU/event-loop (lag.mjs), the mock and the DB pool, probes a light endpoint, then prints the
// summary and writes out/level-<N>.json.
//   N=100 HOLD=120 RAMP=10 WORKERS=4 USERS_PER=1 pnpm exec tsx run.ts
const N = Number(process.env.N ?? 50);
const HOLD = Number(process.env.HOLD ?? 120) * 1000;
const RAMP = Number(process.env.RAMP ?? 10) * 1000;
const WORKERS = Number(process.env.WORKERS ?? 4);
const USERS_PER = Number(process.env.USERS_PER ?? 1);
const TAG = process.env.TAG ?? String(N);
const KEEP_APP = process.env.KEEP_APP === "1";
const BASE = "http://127.0.0.1:3427";
const MIX = {
  maxSec: Number(process.env.MAX_SEC ?? 120),
  maxTps: Number(process.env.MAX_TPS ?? 60),
  minSec: Number(process.env.MIN_SEC ?? 30),
  minTps: Number(process.env.MIN_TPS ?? 30),
};
const here = new URL(".", import.meta.url).pathname;
const { people } = JSON.parse(readFileSync(`${here}cookies.json`, "utf8")) as {
  people: { cookie: string }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const mb = (x: number) => Math.round(x / 1048576);
const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

// 1. The app.
let app = spawn(process.env.START_CMD ?? `${here}start-app.sh`, { env: { ...process.env, APP_NODE_OPTIONS: "--expose-gc", ...(process.env.PROF ? { S27_PROF: `${here}out/app-${TAG}.cpuprofile` } : {}) }, stdio: ["ignore", openSync(`${here}out/app-${TAG}.log`, "w"), openSync(`${here}out/app-${TAG}.log`, "a")] });
const up = async () => {
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/auth/get-session`);
      if (r.status < 500) return;
    } catch {}
    await sleep(200);
  }
  throw new Error("app did not start");
};
await up();

// 2. Warm-up: one full answer, so lazy module loads and the DB pool are not in the numbers.
await new Promise<void>((resolve) => {
  const w = fork(`${here}worker.ts`, { execArgv: ["--import", "tsx"], env: {
    ...process.env,
    WORKER_OUT: `${here}out/worker-warmup.json`, WARMUP: "1",
    WORKER_CFG: JSON.stringify({ deadline: Date.now() + 1, mix: { maxSec: 3, maxTps: 40, minSec: 3, minTps: 40 }, rampMs: 0, slots: [0], total: 1, usersPer: 1 }),
  } });
  w.on("exit", () => resolve());
});
await sleep(3000);

const lagFile = `${here}out/lag.jsonl`;
const readLag = () =>
  readFileSync(lagFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, number>);
const lag0 = readLag().filter((l) => !l.gc);
const pid = Number(
  Object.entries(
    lag0.reduce<Record<string, number>>((a, l) => ({ ...a, [l.pid]: Math.max(a[l.pid] ?? 0, l.rss) }), {})
  ).sort((a, b) => b[1] - a[1])[0][0]
);
const baseline = lag0.filter((l) => l.pid === pid).at(-1)!;
let appDied = false;
const gcNow = async () => {
  const before = readLag().filter((l) => l.gc && l.pid === pid).length;
  try {
    process.kill(pid, "SIGUSR2");
  } catch {
    // The app is gone (crashed under load): report its last sample.
    appDied = true;
    return { ...readLag().filter((l) => l.pid === pid).at(-1)!, heapUsed: 0 } as Record<string, number>;
  }
  for (let i = 0; i < 50; i += 1) {
    await sleep(200);
    const all = readLag().filter((l) => l.gc && l.pid === pid);
    if (all.length > before) return all.at(-1)!;
  }
  throw new Error("no gc line");
};
const footprint = async () => {
  const out = await new Promise<string>((resolve) => {
    const c = spawn("footprint", [String(pid)]);
    let b = "";
    c.stdout.on("data", (d) => (b += d));
    c.on("close", () => resolve(b));
  });
  const m = /Footprint:\s+([\d.]+)\s*(KB|MB|GB)/.exec(out);
  return m ? Number(m[1]) * ({ GB: 1024, KB: 1 / 1024, MB: 1 }[m[2] as "KB"]) : -1;
};
const gcBase = await gcNow();
const footBase = await footprint();

// 3. The level.
const T0 = Date.now();
const deadline = T0 + RAMP + HOLD;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const samples: { t: number; conns: number; foot: number; mockLive: number }[] = [];
const probe: { t: number; ms: number; ok: boolean }[] = [];
let running = true;
const sampler = (async () => {
  while (running) {
    const [{ n }] = await sql`select count(*)::int n from pg_stat_activity where datname = 'spike_s27' and pid <> pg_backend_pid()`;
    const live = await fetch("http://127.0.0.1:3428/stats").then((r) => r.json() as Promise<{ live: number }>).catch(() => ({ live: -1 }));
    samples.push({ conns: n, foot: await footprint(), mockLive: live.live, t: Date.now() });
    await sleep(2000);
  }
})();
const prober = (async () => {
  while (running) {
    const t = performance.now();
    let ok = false;
    try {
      const r = await fetch(`${BASE}/api/auth/get-session`, { headers: { cookie: people[people.length - 1].cookie } });
      await r.text();
      ok = r.ok;
    } catch {}
    probe.push({ ms: performance.now() - t, ok, t: Date.now() });
    await sleep(250);
  }
})();

const slots = Array.from({ length: N }, (_, i) => i);
const parts = Array.from({ length: WORKERS }, (_, w) => slots.filter((s) => s % WORKERS === w));
let gcPlateau: Record<string, number> | null = null;
setTimeout(async () => { gcPlateau = await gcNow(); }, Math.max(0, deadline - 2000 - Date.now()));
const results = await Promise.all(
  parts.map(
    (mine) =>
      new Promise<{ records: Rec[]; driverLagMax: number; driverLagP99: number }>((resolve) => {
        const outFile = `${here}out/worker-${TAG}-${mine[0]}.json`;
        const w = fork(`${here}worker.ts`, {
          env: { ...process.env, WORKER_OUT: outFile, WORKER_CFG: JSON.stringify({ deadline, mix: MIX, rampMs: RAMP, slots: mine, total: N, usersPer: USERS_PER }) },
          execArgv: ["--import", "tsx"],
        });
        w.on("exit", () => resolve(JSON.parse(readFileSync(outFile, "utf8"))));
      })
  )
);
const T1 = Date.now();
running = false;
await Promise.all([sampler, prober]);

// 4. After the drain: what the app holds once the answers are over (the recorder keeps chunks 120 s after the end).
await sleep(Number(process.env.SETTLE ?? 20) * 1000);
const lagAll = readLag().filter((l) => l.pid === pid && !l.gc);
const settled = lagAll.at(-1)!;
await sleep(Number(process.env.SETTLE2 ?? 110) * 1000);
const lagFinal = readLag().filter((l) => l.pid === pid && !l.gc).at(-1)!;
const gcFinal = await gcNow();
const footFinal = await footprint();

const records = results.flatMap((r) => r.records);
const plateauFrom = T0 + RAMP + 5000;
const plateauTo = deadline - 1000;
const inPlateau = <T extends { t: number }>(xs: T[]) => xs.filter((x) => x.t >= plateauFrom && x.t <= plateauTo);
const lagP = inPlateau(lagAll);
const col = (k: string) => lagP.map((l) => l[k]);
const done = records.filter((r) => r.ok);
const bad = records.filter((r) => !r.ok);
const ttft = done.map((r) => (r.ttftMs ?? 0) - r.mockTtft);
const gapSum = done.reduce((a, r) => a.map((x, i) => x + r.gaps[i]), Array(8).fill(0) as number[]);
const gapTotal = gapSum.reduce((a, b) => a + b, 0);
const probeP = inPlateau(probe);
const count = async (q: string) => {
  try {
    return (await sql.unsafe(q))[0].n as number;
  } catch {
    return -1;
  }
};
const msgs = process.env.STANDALONE ? await count("select count(*)::int n from s27_messages where role = 'assistant'") : await count("select count(*)::int n from messages where role = 'assistant'");
const runs = process.env.STANDALONE ? await count("select count(*)::int n from s27_steps where finish <> 'saved'") : await count("select count(*)::int n from model_runs where status = 'ok'");
const deltasIn = done.reduce((a, r) => a + r.deltas, 0);
const summary = {
  N,
  USERS_PER,
  app_died: appDied,
  hold_s: HOLD / 1000,
  answers: { started: records.length, ok: done.length, failed: bad.length, mismatchedDeltas: done.filter((r) => r.deltas !== r.expectedDeltas).length },
  failures: Object.entries(bad.reduce<Record<string, number>>((a, r) => ({ ...a, [`${r.status}:${r.error ?? ""}`]: (a[`${r.status}:${r.error ?? ""}`] ?? 0) + 1 }), {})),
  ttft_overhead_ms: { p50: r1(pct(ttft, 50)), p95: r1(pct(ttft, 95)), p99: r1(pct(ttft, 99)), max: r1(Math.max(...ttft)) },
  headers_ms: { p50: r1(pct(done.map((r) => r.headersMs ?? 0), 50)), p95: r1(pct(done.map((r) => r.headersMs ?? 0), 95)), max: r1(Math.max(...done.map((r) => r.headersMs ?? 0))) },
  delta_gaps_in_step: { buckets: ["<=25", "<=50", "<=100", "<=250", "<=500", "<=1000", "<=2500", ">2500"], share: gapSum.map((x) => Math.round((x / gapTotal) * 10000) / 100), max_ms: r1(Math.max(...done.map((r) => r.gapMax))) },
  app: {
    footprint_mb: { baseline: Math.round(footBase), plateau_mean: Math.round(inPlateau(samples).reduce((a, x) => a + x.foot, 0) / inPlateau(samples).length), plateau_peak: Math.round(Math.max(...inPlateau(samples).map((x) => x.foot))), after_130s: Math.round(footFinal) },
    live_heap_after_gc_mb: { baseline: mb(gcBase.heapUsed), plateau_end: mb(gcPlateau!.heapUsed), after_130s: mb(gcFinal.heapUsed) },
    rss_mb: { baseline: mb(baseline.rss), plateau_mean: mb(col("rss").reduce((a, b) => a + b, 0) / col("rss").length), plateau_peak: mb(Math.max(...col("rss"))), after_drain_20s: mb(settled.rss), after_130s: mb(lagFinal.rss) },
    heap_mb: { baseline: mb(baseline.heapUsed), plateau_peak: mb(Math.max(...col("heapUsed"))), after_130s: mb(lagFinal.heapUsed) },
    external_mb_peak: mb(Math.max(...col("external"))),
    cpu_pct_of_one_core: { mean: r1(col("cpu").reduce((a, b) => a + b, 0) / col("cpu").length), p95: r1(pct(col("cpu"), 95)), max: r1(Math.max(...col("cpu"))) },
    event_loop_excess_ms: { mean: r1(col("lagMean").reduce((a, b) => a + b - 10, 0) / col("lagMean").length), p99_median: r1((pct(col("lagP99"), 50) ?? 0) - 10), p99_max: r1(Math.max(...col("lagP99")) - 10), max: r1(Math.max(...col("lagMax")) - 10) },
  },
  probe_ms: { n: probeP.length, failed: probeP.filter((p) => !p.ok).length, p50: r1(pct(probeP.map((p) => p.ms), 50)), p95: r1(pct(probeP.map((p) => p.ms), 95)), p99: r1(pct(probeP.map((p) => p.ms), 99)), max: r1(Math.max(...probeP.map((p) => p.ms))) },
  db_conns: { max: Math.max(...samples.map((s) => s.conns)) },
  mock_live_peak: Math.max(...samples.map((s) => s.mockLive)),
  deltas_per_s_through_app: Math.round(deltasIn / ((T1 - T0) / 1000)),
  driver: { lag_p99_ms_max: r1(Math.max(...results.map((r) => r.driverLagP99))), lag_max_ms: r1(Math.max(...results.map((r) => r.driverLagMax))) },
  saved: { assistant_messages: msgs, model_runs_ok: runs },
};
console.log(JSON.stringify(summary, null, 2));
writeFileSync(`${here}out/level-${TAG}.json`, JSON.stringify({ summary, lag: lagAll, probe, samples }));
await sql.end();
if (process.env.PROF) {
  try { process.kill(pid, "SIGHUP"); } catch {}
  await sleep(5000);
}
if (!KEEP_APP) {
  app.kill("SIGTERM");
  try { process.kill(pid, "SIGTERM"); } catch {}
}
process.exit(0);
