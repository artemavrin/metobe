// Spike S8, a chat's pace: an answer searches three times in a row, one answer every 20 s.
import { appendFileSync, writeFileSync } from "node:fs";
const BASE = "http://127.0.0.1:8888";
const OUT = process.argv[2];
const ROUNDS = Number(process.argv[3] ?? 15);
const topics = ["курс евро к рублю", "налоговый вычет за обучение", "как выбрать ноутбук для работы", "React 19 use hook", "PostgreSQL vacuum настройка", "погода в Казани", "ипотека ставки банков", "Docker compose healthcheck", "TypeScript satisfies оператор", "рецепт сырников", "Kubernetes ingress nginx", "курс биткоина сегодня", "Next.js server actions", "отпуск в Турции цены", "Rust borrow checker"];
const angles = ["", " 2026", " сравнение", " инструкция", " отзывы"];
writeFileSync(OUT, "");
for (let round = 0; round < ROUNDS; round++) {
  const t0 = Date.now();
  for (let k = 0; k < 3; k++) {
    const q = `${topics[(round * 3 + k) % topics.length]}${angles[k]}`;
    const s = Date.now();
    const res = await fetch(`${BASE}/search?${new URLSearchParams({ format: "json", language: /[а-я]/iu.test(q) ? "ru" : "en", q })}`).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    const engines = {};
    for (const r of data.results ?? []) for (const e of r.engines ?? []) engines[e] = (engines[e] ?? 0) + 1;
    appendFileSync(OUT, `${JSON.stringify({ engines, ms: Date.now() - s, q, results: (data.results ?? []).length, round, t: s, unresponsive: data.unresponsive_engines ?? [] })}\n`);
  }
  const wait = 20000 - (Date.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
