// S15 part 4 «проекты» (2026-11-10): does the writer make a card for a project it is told about? A dev screen showed «v2
// портала КАСКАД Плюс» in two records and no project card: the slot's model (DeepSeek v4.1 Flash) skipped it, Gemini
// 3.5 Flash did not. The prompt has no rule for projects; this probes one message on any model, a few times.
// Gateway only.
//
//   MODEL=openai/gpt-oss-120b RUNS=5 pnpm run project
//   MODEL=deepseek/deepseek-v4.1-flash-1017 pnpm run project
//   RULE=1 ...               # with a draft rule for projects added to the end of the instructions

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import { extractionSchema, memoryInstructions, memoryPrompt } from "../../packages/core/src/memory-extract.ts";
import { sourceKey } from "../S13-jev/keys.ts";

const gw = createGateway({ apiKey: sourceKey("gateway").key });
const MODEL = process.env.MODEL ?? "google/gemini-3.5-flash";
const RUNS = Number(process.env.RUNS ?? 3);
/** A draft of the rule the prompt lacks; added only with RULE=1, to see what it would do before it is written into the prompt. */
const PROJECT_RULE = `
- Projects: a named piece of work that someone is doing or has launched — «Склад 2.0», «v2 портала КАСКАД Плюс», «Бюджет 2027» — is a card of kind project (in new_entities when it is not among the known cards), and its ref goes into the about of every item about it, besides the people. A one-off request to the assistant («составь отчёт», «посчитай») is not a project.`;
const RULE = process.env.RULE ? PROJECT_RULE : "";
const cards = [{ aliases: [], id: "vlad", kind: "person", name: "Владислав Колебцев", ref: "c1", role: "заместитель" }] as const;

let cost = 0;
let projects = 0;
let linked = 0;
for (let run = 1; run <= RUNS; run += 1) {
  const call = (reasoning?: "low") =>
    generateText({
      instructions:
        memoryInstructions({ cards: [...cards], sentAt: new Date("2026-11-10T09:00:00Z"), timeZone: "Europe/Moscow" }) + RULE,
      model: gw(MODEL),
      output: Output.object({ schema: extractionSchema }),
      prompt: memoryPrompt("он сейчас делает v2 портала КАСКАД Плюс, обещал сегодня доделать", [
        { role: "user", text: "кто такой Владислав?" },
        { role: "assistant", text: "По памяти, Владислав Колебцев — ваш заместитель, работает в вашей команде. Больше о нём в памяти ничего нет." },
      ]),
      providerOptions: { gateway: { zeroDataRetention: true } },
      ...(reasoning ? { reasoning } : {}),
    });
  try {
    // As the app does: short reasoning, and once more with the default if the provider refuses it.
    const r = await call("low").catch(() => call());
    cost += Number((r.providerMetadata?.gateway as { cost?: string } | undefined)?.cost ?? 0);
    const made = r.output.new_entities.filter((e) => e.kind === "project");
    // Every ref is a shown card, the user or a card the answer makes — nothing invented.
    const refs = new Set(["c1", "user", ...r.output.new_entities.map((e) => e.id)]);
    const clean = r.output.items.every((i) => i.about.every((a) => refs.has(a)));
    if (made.length > 0) projects += 1;
    // Linked: every item points at the project's id, whatever the id looks like — the app takes «new_x» for «new:x» too.
    const ids = new Set(made.map((e) => e.id));
    if (made.length > 0 && clean && r.output.items.length > 0 && r.output.items.every((i) => i.about.some((a) => ids.has(a)))) linked += 1;
    console.log(run, JSON.stringify({ new: r.output.new_entities.map((e) => [e.kind, e.name]), items: r.output.items.map((i) => [i.kind, i.about]) }));
  } catch (error) {
    console.log(run, "ERROR", (error as Error).message.slice(0, 200));
  }
}
console.log(JSON.stringify({ cost: `$${cost.toFixed(4)}`, model: MODEL, project_made: `${projects}/${RUNS}`, project_made_and_both_linked: `${linked}/${RUNS}`, rule: Boolean(RULE), runs: RUNS }));
