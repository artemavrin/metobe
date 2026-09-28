// Spike S8 under load: a question a second for a few minutes — do results keep coming, which engines give out, when.
import { appendFileSync, writeFileSync } from "node:fs";
const BASE = "http://127.0.0.1:8888";
const OUT = process.argv[2];
const N = Number(process.argv[3] ?? 180);
const topics = ["курс евро", "налоговый вычет", "ремонт квартиры", "рецепт борща", "расписание электричек", "новости технологий", "Next.js", "PostgreSQL индексы", "React 19", "TypeScript generics", "погода в Казани", "как выбрать ноутбук", "Docker compose", "Kubernetes ingress", "машинное обучение", "курс биткоина", "ипотека ставки", "отпуск в Турции", "Python asyncio", "Rust ownership"];
const suffix = ["", " 2026", " как", " что это", " пример", " отзывы", " сравнение", " инструкция", " цена", " новости"];
writeFileSync(OUT, "");
for (let i = 0; i < N; i++) {
  const q = `${topics[i % topics.length]}${suffix[Math.floor(i / topics.length) % suffix.length]}`;
  const t0 = Date.now();
  let row;
  try {
    const res = await fetch(`${BASE}/search?${new URLSearchParams({ format: "json", language: /[а-я]/iu.test(q) ? "ru" : "en", q })}`);
    const data = await res.json();
    const engines = {};
    for (const r of data.results ?? []) for (const e of r.engines ?? []) engines[e] = (engines[e] ?? 0) + 1;
    row = { engines, i, ms: Date.now() - t0, q, results: (data.results ?? []).length, status: res.status, t: t0, unresponsive: data.unresponsive_engines ?? [] };
  } catch (error) {
    row = { error: String(error), i, ms: Date.now() - t0, q, results: 0, t: t0 };
  }
  appendFileSync(OUT, `${JSON.stringify(row)}\n`);
  const wait = 1000 - (Date.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
