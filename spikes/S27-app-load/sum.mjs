// One line per level from out/level-*.json.
import { readdirSync, readFileSync } from "node:fs";
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : null);
const rows = readdirSync("out").filter((f) => /^level-[\w-]+\.json$/.test(f)).map((f) => {
  const d = JSON.parse(readFileSync(`out/${f}`, "utf8"));
  // The probe is GET /api/auth/get-session; Better Auth answers 429 beyond 100 a minute, so only the 200s count.
  const ok = d.probe.filter((x) => x.ok).map((x) => x.ms);
  d.summary.probe_ms = { ...d.summary.probe_ms, p50: Math.round(pct(ok, 50)), p95: Math.round(pct(ok, 95)), p99: Math.round(pct(ok, 99)), n_ok: ok.length };
  return { f, s: d.summary };
});
rows.sort((a, b) => a.s.N - b.s.N || a.f.localeCompare(b.f));
console.log("level | ok/started | TTFT+ p50/p95/max ms | gap>250ms % | max gap | CPU mean/p95 % | loop excess mean/p99max | heap live base→plateau→130s MB | footprint base/peak/130s MB | probe p50/p95 | dps | dbconns | died");
for (const { f, s } of rows) {
  const g = s.delta_gaps_in_step.share.slice(4).reduce((a, b) => a + b, 0).toFixed(1);
  console.log([f.replace(/^level-|\.json$/g, ""), `${s.answers.ok}/${s.answers.started}`, `${s.ttft_overhead_ms.p50}/${s.ttft_overhead_ms.p95}/${s.ttft_overhead_ms.max}`, g, s.delta_gaps_in_step.max_ms, `${s.app.cpu_pct_of_one_core.mean}/${s.app.cpu_pct_of_one_core.p95}`, `${s.app.event_loop_excess_ms.mean}/${s.app.event_loop_excess_ms.p99_max}`, `${s.app.live_heap_after_gc_mb.baseline}→${s.app.live_heap_after_gc_mb.plateau_end}→${s.app.live_heap_after_gc_mb.after_130s}`, `${s.app.footprint_mb.baseline}/${s.app.footprint_mb.plateau_peak}/${s.app.footprint_mb.after_130s}`, `${s.probe_ms.p50}/${s.probe_ms.p95}`, s.deltas_per_s_through_app, s.db_conns.max, s.app_died ?? false].join(" | "));
}
