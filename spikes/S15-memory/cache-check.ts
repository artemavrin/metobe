// Does the Gateway read the «Память» prompt from the cache when the rules come first? The app sends today, the cards and
// the promises before ~3 thousand tokens of rules, so no two messages share a start and nothing is read from the cache
// (`model_runs`: 0 of 19). Here the same instructions, reordered: rules first, what changes from message to message
// last. Ten calls one after another on the S15 status cases with the pick. About $0.07.
//
//   pnpm prompt-cache

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import { candidateCards, candidateCommitments } from "../../packages/core/src/memory-candidates.ts";
import { extractionSchema, memoryInstructions, memoryPrompt } from "../../packages/core/src/memory-extract.ts";
import { TIMEZONE } from "../S13-jev/extract-cases.ts";
import { sourceKey } from "../S13-jev/keys.ts";
import { NOW, SELF, fillerCards, fillerPromises } from "./memory300.ts";

const MODEL = process.env.MODEL ?? "google/gemini-3.5-flash";
const CALLS = Number(process.env.CALLS ?? 10);
const key = sourceKey("gateway").key;
const gw = createGateway({ apiKey: key });

const used = async () => {
  const r = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { Authorization: `Bearer ${key}` } });
  return Number(((await r.json()) as { total_used: string }).total_used);
};

/** The app's instructions with the rules moved up: intro, rules, then today, the cards and the promises. */
const rulesFirst = (text: string) => {
  const rules = text.indexOf("\nRules:\n");
  const today = text.indexOf("\nToday is ");
  return `${text.slice(0, today)}\n${text.slice(rules + 1)}\n${text.slice(today + 1, rules)}`;
};

const filler = fillerCards();
const entities = [SELF, ...filler];
const records = fillerPromises(filler);
const TEXTS = [
  "Наталья Козлова прислала смету по ремонту",
  "Созвонился с Олегом Васильевым, он пришлёт отчёт за октябрь к пятнице",
  "Анна Соколова говорит, что доверенность готова",
  "Встречу с Тимуром Беляевым перенесли на четверг",
  "Отправил Ксении Голубевой техническое задание",
  "Дмитрий Новиков просит отсрочку по счёту",
  "Ирина Морозова уходит в отпуск с 20 ноября",
  "Максим Зайцев теперь руководит логистикой в «Сигме»",
  "Вера Тарасова обещала макет баннера до среды",
  "Роман Кузнецов прислал график отпусков",
];

const before = await used();
let read = 0;
let total = 0;
for (const [i, text] of TEXTS.slice(0, CALLS).entries()) {
  const cards = candidateCards({ entities, now: NOW, records, text });
  const commitments = candidateCommitments({ cards, now: NOW, records, selfId: SELF.id, text });
  const instructions = rulesFirst(
    memoryInstructions({
      cards: cards.map((e) => ({ aliases: e.aliases, id: e.id, kind: e.kind as "person", name: e.name, ref: e.id, role: e.role })),
      commitments: commitments.map((r) => ({ due: r.dueAt, id: r.id, ref: r.id, status: "open" as const, text: r.text })),
      sentAt: NOW,
      timeZone: TIMEZONE,
    })
  );
  // oxlint-disable-next-line eslint/no-await-in-loop -- one after another: the first writes what the next ones read
  const r = await generateText({
    instructions,
    maxRetries: 1,
    model: gw(MODEL),
    output: Output.object({ schema: extractionSchema }),
    prompt: memoryPrompt(text),
    providerOptions: { gateway: { zeroDataRetention: true } },
    reasoning: "low",
  });
  const cached = r.usage.inputTokenDetails.cacheReadTokens ?? 0;
  read += cached;
  total += r.usage.inputTokens ?? 0;
  console.log(
    `${i + 1}. input ${r.usage.inputTokens}, from cache ${cached}, cost $${(r.providerMetadata?.gateway as { cost?: string } | undefined)?.cost ?? "?"}`
  );
}
console.log(`from cache: ${read} of ${total} input tokens; spent $${((await used()) - before).toFixed(4)}`);
