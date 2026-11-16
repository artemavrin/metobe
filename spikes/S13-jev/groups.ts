// S13 part 7: groups (ARCH §19) — «моя команда» as a card the rules point at, who is in it as facts, «ушёл из
// команды» ending them. Scored on the app's own plan (planWrite), not the raw answer. Gateway only.

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import { extractionSchema, memoryInstructions, memoryPrompt, planWrite } from "../../packages/core/src/memory-extract.ts";
import type { MemoryRecord } from "../../packages/core/src/memory.ts";
import { caseId, isMain, type EvalCase } from "./eval-case.ts";
import { TIMEZONE, TODAY_ISO } from "./extract-cases.ts";
import { sourceKey } from "./keys.ts";

// Run as `pnpm groups`, the file calls the model itself; imported — by S15's eval.ts — it only gives its cases.
const MAIN = isMain(import.meta.url);
const MODELS = MAIN ? (process.env.MODELS ?? "google/gemini-3.5-flash").split(",") : [];
const gw = createGateway({ apiKey: MAIN ? sourceKey("gateway").key : "" });
const sentAt = new Date(`${TODAY_ISO}T09:00:00Z`);

const person = (ref: string, name: string, role: string | null) => ({ aliases: [], id: ref, kind: "person" as const, name, ref, role });
const team = { aliases: [], id: "team", kind: "group" as const, members: ["andrey", "marina"], name: "Моя команда", ref: "team", role: null };
const cards = [
  person("andrey", "Андрей Смирнов", "разработчик"),
  person("marina", "Марина Орлова", "дизайнер"),
  person("igor", "Игорь Белов", "руководитель отдела продаж"),
  person("olga", "Ольга Ли", "менеджер «Альфа-Логистики»"),
  { aliases: [], id: "vector", kind: "org" as const, name: "ООО «Вектор»", ref: "vector", role: "поставщик оборудования" },
  team,
];
const fact = (id: string, who: string): MemoryRecord => ({
  closedByWrite: null, deletedAt: null, doneAt: null, dueAt: null, givenAt: null, id, important: false, kind: "fact",
  entities: [{ entityId: who, role: "about" }, { entityId: "team", role: "group" }], occurredAt: null, occurredPrecision: null,
  recordedAt: sentAt, role: null, rule: null, status: null, supersededAt: null, text: `${who} в моей команде`, validFrom: null, validTo: null, writeId: null,
});
const facts = [fact("m-andrey", "andrey"), fact("m-marina", "marina")];

type Plan = ReturnType<typeof planWrite>;
const roles = (p: Plan) => p.records.flatMap((r) => r.entities.map((l) => `${r.kind}:${"entityId" in l ? l.entityId : "newRef" in l ? `new(${p.entities.find((e) => e.ref === l.newRef)?.kind})` : "ask"}:${l.role}`));
const cases: { text: string; check: (p: Plan) => string | null }[] = [
  { text: "Павел — новый разработчик в моей команде, вышел сегодня.", check: (p) => roles(p).some((r) => r === "fact:team:group") && roles(p).some((r) => r === "fact:new(person):about") ? null : "no membership" },
  { text: "Напоминай про один на один с каждым из моей команды раз в две недели.", check: (p) => { const r = p.records.find((x) => x.kind === "rule"); return r?.rule?.kind === "rhythm" && r.rule.days === 14 && r.entities.some((l) => "entityId" in l && l.entityId === "team") && !r.entities.some((l) => "entityId" in l && ["andrey", "marina"].includes(l.entityId)) ? null : `rule: ${JSON.stringify(r?.entities)} ${JSON.stringify(r?.rule)}`; } },
  { text: "Марина ушла из команды, теперь она на фрилансе.", check: (p) => (p.ends.includes("m-marina") && !p.ends.includes("m-andrey") ? null : `ends: ${p.ends}`) },
  { text: "В отделе продаж теперь работают Наталья Ким и Сергей Волков.", check: (p) => { const g = p.entities.find((e) => e.kind === "group"); const people = roles(p).filter((r) => r === "fact:new(person):about").length; const links = roles(p).filter((r) => r === "fact:new(group):group").length; return g && people >= 2 && links > 0 ? null : `group ${g?.name} links ${roles(p)}`; } },
  { text: "С отделом продаж созваниваться раз в неделю.", check: (p) => { const r = p.records.find((x) => x.kind === "rule"); const g = p.entities.find((e) => e.kind === "group"); return r?.rule?.days === 7 && g && r.entities.some((l) => "newRef" in l && l.newRef === g.ref) ? null : `rule ${JSON.stringify(r?.entities)} groups ${p.entities.map((e) => e.kind)}`; } },
  { text: "От подрядчиков ответа ждём три дня.", check: (p) => { const r = p.records.find((x) => x.kind === "rule"); const g = p.entities.find((e) => e.kind === "group"); return r?.rule?.kind === "wait" && r.rule.days === 3 && g ? null : `rule ${JSON.stringify(r?.rule)} groups ${p.entities.map((e) => `${e.kind}:${e.name}`)}`; } },
  { text: "«Вектор» — наш поставщик оборудования, договор до конца года.", check: (p) => (p.entities.some((e) => e.kind === "group") || roles(p).some((r) => r.endsWith(":group")) ? `grouped: ${roles(p)}` : null) },
  { text: "Андрей Смирнов теперь тимлид бэкенда.", check: (p) => (roles(p).some((r) => r.endsWith(":group")) || p.ends.length ? `grouped: ${roles(p)} ends ${p.ends}` : null) },
];

/** The cases for `pnpm memory:eval` (S15): judged on the app's own plan. */
export const evalCases = (): EvalCase[] =>
  cases.map((c, i) => ({
    id: caseId(i),
    instructions: memoryInstructions({ cards, sentAt, timeZone: TIMEZONE }),
    kind: "write",
    prompt: memoryPrompt(c.text),
    score: (o) => ({ miss: c.check(planWrite(o, { cards, facts, selfId: "me", timeZone: TIMEZONE })), tally: {} }),
    text: c.text,
  }));

for (const id of MODELS) {
  let ok = 0;
  for (const c of cases) {
    const r = await generateText({
      instructions: memoryInstructions({ cards, sentAt, timeZone: TIMEZONE }),
      maxRetries: 1,
      model: gw(id),
      output: Output.object({ schema: extractionSchema }),
      prompt: memoryPrompt(c.text),
      providerOptions: { gateway: { zeroDataRetention: true } },
      reasoning: "low",
    });
    const plan = planWrite(r.output, { cards, facts, selfId: "me", timeZone: TIMEZONE });
    const v = c.check(plan);
    if (v) console.log(`  ✗ ${c.text} → ${v}`);
    else ok++;
    console.log(`    · ${c.text}: ${[...plan.entities.map((e) => `+${e.kind} ${e.name}`), ...plan.records.map((x) => `${x.kind}: ${x.text}`), ...plan.ends.map((e) => `end ${e}`)].join(" | ")}`);
  }
  console.log(JSON.stringify({ model: id, right: `${ok}/${cases.length}` }));
}
