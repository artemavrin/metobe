// Spike S8: what SearXNG gives for Russian and English questions — results, the engines behind them, the ones that failed.
const BASE = process.env.BASE ?? "http://127.0.0.1:8888";
const queries = [
  ["ru", "курс доллара ЦБ сегодня"],
  ["ru", "как оформить налоговый вычет за лечение"],
  ["ru", "Next.js 16 что нового"],
  ["ru", "Битрикс24 REST API создать сделку"],
  ["ru", "погода в Москве на выходные"],
  ["en", "Next.js 16 release notes"],
  ["en", "Vercel AI SDK tool search deferLoading"],
  ["en", "postgres partial index best practices"],
  ["en", "SearXNG JSON API format"],
  ["en", "weather London this weekend"],
];
const engineCount = new Map();
const failures = new Map();
for (const [lang, q] of queries) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/search?${new URLSearchParams({ format: "json", language: lang, q })}`);
  const ms = Date.now() - t0;
  const data = await res.json();
  const results = data.results ?? [];
  for (const r of results) for (const e of r.engines ?? [r.engine]) engineCount.set(e, (engineCount.get(e) ?? 0) + 1);
  for (const [e, why] of data.unresponsive_engines ?? []) failures.set(`${e}: ${why}`, (failures.get(`${e}: ${why}`) ?? 0) + 1);
  console.log(`\n[${lang}] ${q} — ${res.status}, ${results.length} results, ${ms} ms`);
  for (const r of results.slice(0, 3)) console.log(`   · ${r.title?.slice(0, 70)} — ${r.url?.slice(0, 70)} [${(r.engines ?? []).join(",")}]`);
}
console.log("\nengines behind results:", [...engineCount.entries()].sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e}×${n}`).join(", "));
console.log("unresponsive:", [...failures.entries()].map(([e, n]) => `${e} ×${n}`).join(" | ") || "none");
