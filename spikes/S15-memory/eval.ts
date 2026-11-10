// S15 «все наборы одной командой» (MEMORY-PLAN §4): every memory set in one run — S13's and S15's — with a summary
// against the saved baseline and what the run cost. Each set keeps its own command; this one only takes their cases.
// Gateway only. A result holds case ids and outcomes, never a text or a key.
//
//   DRY=1 pnpm memory:eval                       # no model: how many cases, how big, about how much
//   pnpm memory:eval                             # the model of the «Память» slot, every set
//   PARTS=many.extract,update RUNS=2 pnpm memory:eval
//   FAILED=1 SHOW=1 pnpm memory:eval             # only what failed in the last saved run, with the answers; not saved
//   ONLY=many.extract/07,update/11 SHOW=1 pnpm memory:eval
//   BASELINE=1 pnpm memory:eval                  # the sets of this run become the baseline
//   NOKNOWN=1 PARTS=many.extract pnpm memory:eval    # as before §19.9.3: no block of current facts — to compare
//   MODEL=google/gemini-3.5-flash pnpm memory:eval
//
// Above $1 by the estimate the run asks for YES=1.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

import { createGateway } from "@ai-sdk/gateway";
import { experimental_evaluate as evaluate, generateText, Output } from "ai";
import { z } from "zod";

import { extractionSchema } from "../../packages/core/src/memory-extract.ts";
import { GATE_QUESTIONS, type GateAnswers } from "../../packages/core/src/memory-gate.ts";
import { evalCases as contextCases } from "../S13-jev/context.ts";
import type { EvalCase, Tally } from "../S13-jev/eval-case.ts";
import { evalCases as gateCases } from "../S13-jev/gate.ts";
import { evalCases as groupCases } from "../S13-jev/groups.ts";
import { sourceKey } from "../S13-jev/keys.ts";
import { evalCases as selfCases } from "../S13-jev/self.ts";
import { evalCases as foreignCases } from "./foreign.ts";
import { evalCases as manyCases } from "./many.ts";
import { evalCases as updateCases } from "./update.ts";

const MODEL = process.env.MODEL ?? "deepseek/deepseek-v4.1-flash-1017";
const GATE_MODEL = process.env.GATE_MODEL ?? "microsoft/microsoft-decision-1";
const RUNS = Number(process.env.RUNS ?? 1);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const DRY = Boolean(process.env.DRY);
const FAILED = Boolean(process.env.FAILED);
const SHOW = Boolean(process.env.SHOW);
const ONLY = process.env.ONLY?.split(",");
/** As before §19.9.3: the memory has no facts to show, so the block of current facts and its rule are not sent. */
const NOKNOWN = Boolean(process.env.NOKNOWN);
const LABEL = NOKNOWN ? "noknown" : "app";

// --- the sets -------------------------------------------------------------------------------------------------------

const facts = !NOKNOWN;
const SETS: Record<string, () => EvalCase[]> = {
  // S13 on its own few cards: a memory small enough to be shown whole.
  ask: () => manyCases("ask", { facts, small: true }),
  context: contextCases,
  extract: () => manyCases("extract", { facts, small: true }),
  foreign: foreignCases,
  gate: gateCases,
  groups: groupCases,
  // The same messages on 300 cards and 200 open promises: the writer is shown the pick.
  "many.ask": () => manyCases("ask", { facts }),
  "many.extract": () => manyCases("extract", { facts }),
  "many.status": () => manyCases("status", { facts }),
  self: selfCases,
  status: () => manyCases("status", { facts, small: true }),
  update: () => updateCases({ known: facts }),
};
const ORDER = ["gate", "extract", "ask", "context", "status", "self", "groups", "many.extract", "many.ask", "many.status", "foreign", "update"];
const PARTS = process.env.PARTS?.split(",") ?? ORDER;
const unknown = PARTS.filter((p) => !SETS[p]);
if (unknown.length > 0) throw new Error(`no such set: ${unknown.join(", ")}; there are ${ORDER.join(", ")}`);

// --- results on disk ------------------------------------------------------------------------------------------------

interface CaseResult {
  id: string;
  /** In how many of the runs it was right. */
  ok: number;
  runs: number;
  /** Dollars and input tokens, over all its runs. */
  cost: number;
  inputTokens: number;
}
interface SetResult {
  at: string;
  cases: CaseResult[];
  cost: number;
  errors: number;
  inputTokensMax: number;
  inputTokensP50: number;
  metrics: Tally;
}
interface Result {
  gateModel: string;
  label: string;
  model: string;
  sets: Record<string, SetResult>;
}

const DIR = new URL(`./results/eval/${MODEL.replaceAll(/[/:]/g, "__")}/`, import.meta.url);
const read = (name: string) =>
  existsSync(new URL(name, DIR)) ? (JSON.parse(readFileSync(new URL(name, DIR), "utf8")) as Result) : null;
/** The last saved run of this kind — with the block of facts or without. */
const last = () => {
  const names = existsSync(DIR) ? readdirSync(DIR).filter((n) => n.endsWith(`.${LABEL}.json`)).sort() : [];
  const name = names.at(-1);
  return name ? read(name) : null;
};
const baseline = read("baseline.json");
const before = last();

// --- what to run ----------------------------------------------------------------------------------------------------

const failedBefore = (set: string, id: string) => {
  const c = before?.sets[set]?.cases.find((x) => x.id === id);
  return Boolean(c && c.ok < c.runs);
};
if (FAILED && !before) throw new Error("FAILED=1: no saved run of this model to take the failed cases from");
const picked = PARTS.map((set) => ({
  cases: (SETS[set] as () => EvalCase[])().filter(
    (c) => (!ONLY || ONLY.includes(`${set}/${c.id}`)) && (!FAILED || failedBefore(set, c.id))
  ),
  set,
})).filter((p) => p.cases.length > 0);
/** A part of a set is for looking at what failed: it is not saved and not compared. */
const PARTIAL = FAILED || Boolean(ONLY);

// --- the estimate ---------------------------------------------------------------------------------------------------

const prices = new Map<string, { input: number; output: number }>();
{
  const res = await fetch("https://ai-gateway.vercel.sh/v1/models");
  const { data } = (await res.json()) as { data: { id: string; pricing?: { input?: string; output?: string } }[] };
  for (const m of data) prices.set(m.id, { input: Number(m.pricing?.input ?? 0), output: Number(m.pricing?.output ?? 0) });
}
/** Rough: the prompt is English rules with Russian names and examples. A case that ran before costs what it cost. */
const CHARS_PER_TOKEN = 3;
const OUTPUT_TOKENS = 400;
const SCHEMA_CHARS = JSON.stringify(z.toJSONSchema(extractionSchema)).length;
const QUESTIONS_CHARS = JSON.stringify(GATE_QUESTIONS).length;
const chars = (c: EvalCase) =>
  c.kind === "write" ? c.instructions.length + c.prompt.length + SCHEMA_CHARS : JSON.stringify(c.state).length + QUESTIONS_CHARS;
const guess = (set: string, c: EvalCase) => {
  const was = before?.sets[set]?.cases.find((x) => x.id === c.id);
  if (was && was.runs > 0 && was.cost > 0) return was.cost / was.runs;
  const price = prices.get(c.kind === "write" ? MODEL : GATE_MODEL) ?? { input: 0, output: 0 };
  return (chars(c) / CHARS_PER_TOKEN) * price.input + (c.kind === "write" ? OUTPUT_TOKENS * price.output : 0);
};

const money = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const col = (s: string, n: number) => s.padEnd(n);

let estimate = 0;
console.log(`${col("set", 14)}${col("cases", 7)}${col("chars p50", 11)}about`);
for (const { set, cases } of picked) {
  const cost = cases.reduce((sum, c) => sum + guess(set, c), 0) * RUNS;
  estimate += cost;
  console.log(`${col(set, 14)}${col(String(cases.length), 7)}${col(String(median(cases.map(chars))), 11)}${money(cost)}`);
}
const calls = picked.reduce((n, p) => n + p.cases.length, 0) * RUNS;
console.log(`${calls} calls, about ${money(estimate)} — ${MODEL}${picked.some((p) => p.set === "gate") ? `, gate ${GATE_MODEL}` : ""}, ${LABEL}`);
if (DRY || calls === 0) process.exit(0);
if (estimate > 1 && !process.env.YES) {
  console.log("above $1: run again with YES=1");
  process.exit(1);
}

// --- the run --------------------------------------------------------------------------------------------------------

const KEY = sourceKey("gateway").key;
const gw = createGateway({ apiKey: KEY });
const used = async () => {
  try {
    const r = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { Authorization: `Bearer ${KEY}` } });
    return Number(((await r.json()) as { total_used?: string | number }).total_used);
  } catch {
    return Number.NaN;
  }
};
const costOf = (r: { providerMetadata?: Record<string, unknown> }) =>
  Number((r.providerMetadata?.gateway as { cost?: string } | undefined)?.cost ?? 0);

interface Done {
  set: string;
  id: string;
  ok: boolean;
  error: boolean;
  tally: Tally;
  cost: number;
  inputTokens: number;
}

const ask = async (c: EvalCase) => {
  if (c.kind === "gate") {
    const r = await evaluate({
      abortSignal: AbortSignal.timeout(120_000),
      maxRetries: 2,
      model: gw.evaluationModel(GATE_MODEL),
      providerOptions: { gateway: { zeroDataRetention: true } },
      questions: GATE_QUESTIONS,
      state: c.state as never,
    });
    return { answer: r.answers, cost: costOf(r as never), inputTokens: r.usage.inputTokens ?? 0, verdict: c.score(r.answers as GateAnswers) };
  }
  const r = await generateText({
    abortSignal: AbortSignal.timeout(120_000),
    instructions: c.instructions,
    maxRetries: 2,
    model: gw(MODEL),
    output: Output.object({ schema: extractionSchema }),
    prompt: c.prompt,
    providerOptions: { gateway: { zeroDataRetention: true } },
    reasoning: "low",
  });
  const o = r.output;
  const answer = {
    asks: o.asks.map((a) => [a.id, a.candidates]),
    items: o.items.map((i) => [i.kind, i.text, i.about, i.debtor, i.creditor, i.when.date, i.due.date, i.replaces].filter(Boolean)),
    leaves: o.leaves,
    moves: o.moves,
    new: o.new_entities.map((e) => e.id),
    updates: o.updates,
  };
  return { answer, cost: costOf(r as never), inputTokens: r.usage.inputTokens ?? 0, verdict: c.score(o) };
};

const jobs = picked.flatMap(({ set, cases }) => Array.from({ length: RUNS }, () => cases.map((c) => ({ c, set }))).flat());
const done: Done[] = [];
const started = Date.now();
const usedBefore = await used();
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const { c, set } = jobs[next++] as (typeof jobs)[number];
      try {
        const r = await ask(c);
        const ok = r.verdict.miss === null;
        done.push({ cost: r.cost, error: false, id: c.id, inputTokens: r.inputTokens, ok, set, tally: r.verdict.tally });
        if (!ok) console.log(`  ✗ ${set}/${c.id} ${c.text} → ${r.verdict.miss}`);
        if (SHOW && (!ok || PARTIAL)) console.log(`      ${JSON.stringify(r.answer)}`);
      } catch (error) {
        done.push({ cost: 0, error: true, id: c.id, inputTokens: 0, ok: false, set, tally: {} });
        console.log(`  ! ${set}/${c.id} ${c.text}: ${(error as Error).message.slice(0, 160)}`);
      }
    }
  })
);
const spent = (await used()) - usedBefore;

// --- the summary ----------------------------------------------------------------------------------------------------

const at = new Date().toISOString();
const result: Result = { gateModel: GATE_MODEL, label: LABEL, model: MODEL, sets: {} };
for (const { set, cases } of picked) {
  const mine = done.filter((d) => d.set === set);
  const metrics: Tally = { right: [mine.filter((d) => d.ok).length, mine.length] };
  for (const d of mine) {
    for (const [k, [a, b]] of Object.entries(d.tally)) {
      const t = metrics[k] ?? [0, 0];
      metrics[k] = [t[0] + a, t[1] + b];
    }
  }
  const tokens = mine.filter((d) => !d.error).map((d) => d.inputTokens);
  result.sets[set] = {
    at,
    cases: cases.map((c) => {
      const runs = mine.filter((d) => d.id === c.id);
      return {
        cost: runs.reduce((n, d) => n + d.cost, 0),
        id: c.id,
        inputTokens: runs.reduce((n, d) => n + d.inputTokens, 0),
        ok: runs.filter((d) => d.ok).length,
        runs: runs.length,
      };
    }),
    cost: mine.reduce((n, d) => n + d.cost, 0),
    errors: mine.filter((d) => d.error).length,
    inputTokensMax: Math.max(0, ...tokens),
    inputTokensP50: median(tokens),
    metrics,
  };
}

const share = ([a, b]: [number, number]) => (b ? (100 * a) / b : null);
const shown = (t: [number, number]) => (t[1] ? `${t[0]}/${t[1]} (${Math.round(share(t) as number)} %)` : "—");
console.log(`\n${col("set", 14)}${col("measure", 18)}${col("now", 16)}${col("base", 16)}Δ`);
for (const [set, r] of Object.entries(result.sets)) {
  for (const [i, [k, t]] of Object.entries(r.metrics).entries()) {
    const base = PARTIAL ? undefined : baseline?.sets[set]?.metrics[k];
    const now = share(t);
    const was = base ? share(base) : null;
    const delta = now === null || was === null ? "" : `${now - was >= 0 ? "+" : "−"}${Math.abs(Math.round(now - was))}`;
    console.log(`${col(i === 0 ? set : "", 14)}${col(k, 18)}${col(shown(t), 16)}${col(base ? shown(base) : "—", 16)}${delta}`);
  }
}
const sets = Object.values(result.sets);
const total = sets.reduce((n, r) => n + r.cost, 0);
console.log(
  `\n${done.length} calls, ${sets.reduce((n, r) => n + r.errors, 0)} errors, ${Math.round((Date.now() - started) / 1000)} s; ` +
    `${money(total)} by the answers, ${Number.isNaN(spent) ? "n/a" : money(spent)} by the balance; ` +
    `input tokens p50 ${median(done.filter((d) => !d.error).map((d) => d.inputTokens))}`
);

if (PARTIAL) process.exit(0);
mkdirSync(DIR, { recursive: true });
const name = `${at.slice(0, 19).replaceAll(":", "-")}.${LABEL}.json`;
writeFileSync(new URL(name, DIR), `${JSON.stringify(result, null, 1)}\n`);
console.log(`saved ${name}`);
if (process.env.BASELINE) {
  if (NOKNOWN) throw new Error("BASELINE=1 with NOKNOWN=1: the baseline is what the app sends");
  const merged: Result = { ...result, sets: { ...baseline?.sets, ...result.sets } };
  writeFileSync(new URL("baseline.json", DIR), `${JSON.stringify(merged, null, 1)}\n`);
  console.log(`baseline: ${Object.keys(result.sets).join(", ")}`);
}
