// S13 part 6: the first step in the app (packages/core/src/memory-gate.ts) — which messages a decision model lets the
// «Память» model skip. A skipped message that had something to keep is the one error that matters; the share of
// «nothing» skipped is the saving. Gateway only, zero data retention.

import { createGateway } from "@ai-sdk/gateway";
import { experimental_evaluate as evaluate } from "ai";

import { GATE_QUESTIONS, GATE_SKIP, gateState, nothingToKeep } from "../../packages/core/src/memory-gate.ts";
import { TODAY, exchange, gate } from "./cases.ts";
import { caseId, isMain, type EvalCase } from "./eval-case.ts";
import { sourceKey } from "./keys.ts";

// Run as `pnpm gate`, the file calls the model itself; imported — by S15's eval.ts — it only gives its cases.
const MAIN = isMain(import.meta.url);
const MODELS = MAIN ? (process.env.MODELS ?? "typesafe-ai/jev-1.14.0,microsoft/microsoft-decision-1,baseten/mammoth-1").split(",") : [];
const gw = createGateway({ apiKey: MAIN ? sourceKey("gateway").key : "" });

// Short replies that only make sense with the exchange before them — they have something to keep.
const withContext = [
  { before: { assistant: "Понял, жду договор от Ольги Ли.", user: "Ольга обещала прислать подписанный договор до пятницы." }, keep: true, text: "она прислала" },
  { before: { assistant: "Какой Андрей передумал — Седов или Ланьшин?", user: "андрей передумал" }, keep: true, text: "Ланьшин, встречи не будет" },
  { before: { assistant: "Договорились: встреча с Игорем Беловым в среду.", user: "Поставь встречу с Игорем на среду." }, keep: true, text: "перенесли на четверг" },
  { before: { assistant: "Андрей Седов взял на себя API к пятнице.", user: "Андрей Седов обещал сделать API к пятнице." }, keep: true, text: "он уже всё сделал" },
  { before: { assistant: "Готово, вот таблица.", user: "Сделай таблицу расходов" }, keep: false, text: "спасибо" },
  { before: { assistant: "15% от 240 тысяч — 36 тысяч.", user: "Посчитай 15% от 240 тысяч" }, keep: false, text: "а 20%?" },
];
const cases = [
  ...gate.map((c) => ({ before: {}, keep: c.remember, text: c.text })),
  ...withContext,
];

/**
 * The cases for `pnpm memory:eval` (S15). A skipped message that had something to keep is the miss; a message read
 * though there was nothing to keep only loses the saving.
 */
export const evalCases = (): EvalCase[] =>
  cases.map((c, i) => ({
    id: caseId(i),
    kind: "gate",
    score: (answers) => {
      const skip = nothingToKeep(answers);
      return {
        miss: skip && c.keep ? "skipped what had something to keep" : null,
        tally: c.keep ? { kept: [skip ? 0 : 1, 1] } : { skipped_nothing: [skip ? 1 : 0, 1] },
      };
    },
    state: gateState(c.text, TODAY, exchange(c.before)),
    text: c.text,
  }));

for (const id of MODELS) {
  let lost = 0;
  let saved = 0;
  let nothing = 0;
  let tokens = 0;
  const ms: number[] = [];
  for (const c of cases) {
    const started = performance.now();
    try {
      const r = await evaluate({
        maxRetries: 2,
        model: gw.evaluationModel(id),
        providerOptions: { gateway: { zeroDataRetention: true } },
        questions: GATE_QUESTIONS,
        state: gateState(c.text, TODAY, exchange(c.before)) as never,
      });
      ms.push(performance.now() - started);
      tokens += r.usage.inputTokens ?? 0;
      const answers = r.answers as never;
      const skip = nothingToKeep(answers);
      if (!c.keep) nothing += 1;
      if (skip && c.keep) {
        lost += 1;
        console.log(`  ✗ skipped what had something to keep: ${c.text}`, JSON.stringify(Object.fromEntries(Object.entries(r.answers).map(([k, v]) => [k, Math.round((v as { probability: number }).probability * 100) / 100]))));
      }
      if (skip && !c.keep) saved += 1;
      if (!skip && !c.keep) console.log(`  · read though nothing to keep: ${c.text}`, JSON.stringify(Object.fromEntries(Object.entries(r.answers).map(([k, v]) => [k, Math.round((v as { probability: number }).probability * 100) / 100]))));
    } catch (error) {
      console.log(`  ! ${c.text}: ${(error as Error).message.slice(0, 120)}`);
    }
  }
  const p50 = [...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)] ?? 0;
  console.log(JSON.stringify({ lost, model: id, p50_ms: Math.round(p50), skipped_nothing: `${saved}/${nothing}`, threshold: GATE_SKIP, tokens_per_msg: Math.round(tokens / cases.length) }));
}
