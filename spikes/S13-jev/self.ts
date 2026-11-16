// S13 part 7: the user's own goals and ways of working as facts about «user», a person's skills one fact each, and
// a role when someone is now someone else (2026-11-09). Gateway only.

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import { extractionSchema, memoryInstructions, memoryPrompt } from "../../packages/core/src/memory-extract.ts";
import { caseId, isMain, type EvalCase } from "./eval-case.ts";
import { TIMEZONE, TODAY_ISO } from "./extract-cases.ts";
import { sourceKey } from "./keys.ts";

// Run as `pnpm self`, the file calls the model itself; imported — by S15's eval.ts — it only gives its cases.
const MAIN = isMain(import.meta.url);
const MODELS = MAIN ? (process.env.MODELS ?? "google/gemini-3.5-flash").split(",") : [];
const gw = createGateway({ apiKey: MAIN ? sourceKey("gateway").key : "" });

const person = (ref: string, name: string, role: string) =>
  ({ aliases: [], id: ref, kind: "person", name, ref, role }) as const;
const cards = [
  person("andrey", "Андрей Смирнов", "разработчик в команде"),
  person("marina", "Марина Орлова", "дизайнер в команде"),
];
const system = memoryInstructions({ cards, sentAt: new Date(`${TODAY_ISO}T09:00:00Z`), timeZone: TIMEZONE });

type Out = (typeof extractionSchema)["_output"];
type Item = Out["items"][number];
interface Case {
  text: string;
  check: (items: Item[]) => string | null;
}
const facts = (items: Item[], ref: string) => items.filter((i) => i.kind === "fact" && i.about.includes(ref));
const cases: Case[] = [
  {
    check: (items) => (facts(items, "user").length > 0 ? null : "no fact about the user"),
    text: "Я развиваю своих подчинённых и хочу, чтобы ты это учитывал",
  },
  {
    check: (items) => (facts(items, "user").length > 0 ? null : "no fact about the user"),
    text: "Мне важно, чтобы команда сама принимала решения, а не ждала меня",
  },
  {
    check: (items) => {
      const f = facts(items, "andrey");
      if (f.length < 3) return `${f.length} facts about Андрей, want 3+`;
      return items.some((i) => i.kind === "assessment" && i.about.includes("andrey")) ? null : "no assessment";
    },
    text: "Андрей Смирнов знает Go, Postgres и Kafka, ведёт API склада. По-моему, он слабоват в коммуникации",
  },
  {
    check: (items) => (facts(items, "andrey").some((i) => i.role) ? null : `no role: ${JSON.stringify(items.map((i) => [i.text, i.role]))}`),
    text: "Андрея Смирнова назначили тимлидом бэкенда",
  },
  {
    check: (items) => (items.some((i) => i.role) ? `a role where there is none: ${items.map((i) => i.role).join(",")}` : null),
    text: "Марина любит, когда ей дают свободу в макетах",
  },
  {
    check: (items) => (facts(items, "user").length === 0 ? null : "a request taken as a fact about the user"),
    text: "Составь план развития для Марины на квартал",
  },
];

/** The cases for `pnpm memory:eval` (S15). */
export const evalCases = (): EvalCase[] =>
  cases.map((c, i) => ({
    id: caseId(i),
    instructions: system,
    kind: "write",
    prompt: memoryPrompt(c.text),
    score: (o) => ({ miss: c.check(o.items), tally: {} }),
    text: c.text,
  }));

for (const id of MODELS) {
  let ok = 0;
  for (const c of cases) {
    const r = await generateText({
      instructions: system,
      maxRetries: 1,
      model: gw(id),
      output: Output.object({ schema: extractionSchema }),
      prompt: memoryPrompt(c.text),
      providerOptions: { gateway: { zeroDataRetention: true } },
      reasoning: "low",
    });
    const v = c.check(r.output.items);
    if (v) console.log(`  ✗ ${c.text} → ${v}`);
    else ok++;
  }
  console.log(`${id}: ${ok}/${cases.length}`);
}
