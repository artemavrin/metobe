// S13 part 4: does the app's «Память» prompt ask instead of guessing (P18, ARCH §19.4)? 14 messages where the card
// is clear (a surname, a company, a role, the topic) or new, 8 where two or three known cards fit and nothing tells
// which — those must become an `asks` entry with the right candidates, not a guess. Keys from the dev DB.

import { createGateway } from "@ai-sdk/gateway";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, type LanguageModel } from "ai";
import { ProxyAgent, fetch as undiciFetch } from "undici";

import { yandexFetch } from "../../packages/core/src/ai-yandex-fetch.ts";
import { extractionSchema, memoryInstructions } from "../../packages/core/src/memory-extract.ts";
import { cards } from "./cases.ts";
import { TIMEZONE, TODAY_ISO } from "./extract-cases.ts";
import { sourceKey } from "./keys.ts";

const MODELS = (process.env.MODELS ?? "google/gemini-3.5-flash,anthropic/claude-haiku-5.5").split(",");
const RUNS = Number(process.env.RUNS ?? 1);

const gw = createGateway({ apiKey: sourceKey("gateway").key });
let yandex: ((id: string) => LanguageModel) | undefined;
const model = (id: string): LanguageModel => {
  if (!id.startsWith("yandex:")) return gw(id);
  if (!yandex) {
    const { key, options } = sourceKey("yandex");
    const p = createOpenAICompatible({
      apiKey: key,
      baseURL: "https://ai.api.cloud.yandex.net/v1",
      fetch: yandexFetch(
        (process.env.HTTPS_PROXY
          ? (url: any, init: any) => undiciFetch(url, { ...init, dispatcher: new ProxyAgent(process.env.HTTPS_PROXY!) })
          : fetch) as typeof fetch
      ),
      includeUsage: true,
      name: "yandex",
      supportsStructuredOutputs: true,
    });
    yandex = (m) => p.chatModel(`gpt://${options.folderId}/${m}/latest`);
  }
  return yandex(id.slice("yandex:".length));
};

const known = {
  ...Object.fromEntries(Object.entries(cards).filter(([k]) => k !== "new" && k !== "unclear")),
  olga_petrova: "Ольга Петрова — главный бухгалтер",
};
const appCards = Object.entries(known).map(([ref, line]) => {
  const [name, role = null] = line.split(" — ");
  const kind = /организация/.test(line) ? "org" : "person";
  return { aliases: [], id: ref, kind, name, ref, role } as const;
});
const system = memoryInstructions({ cards: appCards, sentAt: new Date(`${TODAY_ISO}T09:00:00Z`), timeZone: TIMEZONE });

const ANDREYS = ["andrey_smirnov", "andrey_kovalev"];
const OLGAS = ["olga_li", "olga_petrova"];
const cases: { text: string; expected: string | string[] }[] = [
  { expected: "andrey_kovalev", text: "Андрей из «Вектора» прислал новый прайс." },
  { expected: "andrey_smirnov", text: "Андрей закоммитил исправление в складском API." },
  { expected: "igor_belov", text: "Созвонились с Игорем по плану продаж на декабрь." },
  { expected: "olga_li", text: "Ольга прислала новые тарифы на перевозку." },
  { expected: "new", text: "Наталья из бухгалтерии просит подписать акт." },
  { expected: "andrey_smirnov", text: "Смирнов не успевает с API." },
  { expected: "marina_orlova", text: "Марина нарисовала новые макеты главной страницы." },
  { expected: "andrey_kovalev", text: "Ковалёв просит отсрочку платежа." },
  { expected: "new", text: "Новый разработчик Павел выходит в понедельник." },
  { expected: "andrey_kovalev", text: "Позвонил закупщик от поставщика оборудования, просит подтвердить заказ." },
  { expected: "alfa_logistics", text: "Наш перевозчик снова задержал машину на два дня." },
  { expected: "andrey_smirnov", text: "Андрей обещал закончить API к пятнице." },
  { expected: "olga_petrova", text: "Ольга из бухгалтерии просит подписать акт сверки." },
  { expected: "olga_petrova", text: "Ольга Петрова уходит в отпуск с 20 ноября." },
  { expected: ANDREYS, text: "Андрей завтра в отпуске." },
  { expected: ANDREYS, text: "Андрей просил перезвонить ему после обеда." },
  { expected: ANDREYS, text: "С Андреем договорились встретиться в четверг." },
  { expected: ANDREYS, text: "Андрей прислал документы, посмотрю вечером." },
  { expected: ANDREYS, text: "Андрей заболел, вернётся в понедельник." },
  { expected: OLGAS, text: "Ольга обещала перезвонить завтра." },
  { expected: OLGAS, text: "Ольга в отпуске до конца месяца." },
  { expected: OLGAS, text: "Ольга просила напомнить про встречу." },
];

type Out = (typeof extractionSchema)["_output"];
const refs = (o: Out) => o.items.flatMap((i) => [...i.about, i.debtor, i.creditor]).filter(Boolean) as string[];

const verdict = (expected: string | string[], o: Out) => {
  const used = new Set(refs(o));
  if (Array.isArray(expected)) {
    const ask = o.asks.find((a) => expected.every((c) => a.candidates.includes(c)));
    if (!ask) return `guessed: refs ${[...used].join(", ")}, asks ${JSON.stringify(o.asks.map((a) => a.candidates))}`;
    if (!used.has(ask.id)) return `asked but items do not use ${ask.id}`;
    if (expected.some((c) => used.has(c))) return "asked and guessed too";
    return null;
  }
  if (o.asks.length > 0) return `asked needlessly: ${o.asks.map((a) => `${a.question} [${a.candidates}]`).join("; ")}`;
  // Any id from new_entities is a new card — the app takes «new_pavel» as well as «new:pavel».
  const fresh = new Set(o.new_entities.map((e) => e.id));
  if (expected === "new") return [...used].some((r) => fresh.has(r)) ? null : `no new card: refs ${[...used]}`;
  return used.has(expected) ? null : `wrong card: refs ${[...used].join(", ")}`;
};

for (const id of MODELS) {
  let clearOk = 0;
  let askOk = 0;
  const misses: string[] = [];
  const questions: string[] = [];
  for (let run = 0; run < RUNS; run++) {
    for (const c of cases) {
      try {
        const r = await generateText({
          maxRetries: 1,
      ...(process.env.REASONING ? { reasoning: process.env.REASONING as "none" } : {}),
          model: model(id),
          output: Output.object({ schema: extractionSchema }),
          prompt: `<message>\n${c.text}\n</message>`,
          providerOptions: id.startsWith("yandex:") ? {} : { gateway: { zeroDataRetention: true } },
          system,
        });
        const v = verdict(c.expected, r.output);
        if (v) misses.push(`${c.text} → ${v}`);
        else if (Array.isArray(c.expected)) askOk++;
        else clearOk++;
        for (const a of r.output.asks) questions.push(a.question);
      } catch (error) {
        misses.push(`${c.text} → error ${(error as Error).message.slice(0, 120)}`);
      }
    }
  }
  const clear = cases.filter((c) => !Array.isArray(c.expected)).length * RUNS;
  const unclear = cases.length * RUNS - clear;
  console.log(JSON.stringify({ asked_right: `${askOk}/${unclear}`, clear_right: `${clearOk}/${clear}`, model: id }));
  for (const m of misses) console.log("  ✗", m);
  for (const q of [...new Set(questions)].slice(0, 10)) console.log("  ?", q);
}
