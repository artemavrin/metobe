// S15 part «Кратко» (ARCH §19.9, MEMORY-PLAN §11.4): a card's account written by the «Память» model from the card's
// records. Four hand-made cards with 6–14 records each; the model is sent what the app sends (`summaryPrompt`), its answer
// goes through `supported` as the app does. The code checks that every number and every capitalised name in a sentence is
// in the records the sentence names; the accounts are printed to be read. Gateway only.
//
//   pnpm run summary          # meta/muse-ember — about $0.005 for four cards
//   MODEL=google/gemini-3.5-flash pnpm run summary

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import type { MemoryEntity, MemoryRecord } from "../../packages/core/src/memory.ts";
import {
  SUMMARY_INSTRUCTIONS,
  summaryPrompt,
  summarySchema,
  supported,
} from "../../packages/core/src/memory-summary-text.ts";
import { TIMEZONE } from "../S13-jev/extract-cases.ts";
import { sourceKey } from "../S13-jev/keys.ts";
import { NOW } from "./memory300.ts";

const MODEL = process.env.MODEL ?? "meta/muse-ember";
const day = (d: string) => new Date(`${d}T00:00:00+03:00`);
const ago = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const entity = (id: string, kind: MemoryEntity["kind"], name: string, role: string | null): MemoryEntity =>
  ({ aliases: [], createdAt: ago(100), email: null, id, kind, name, phone: null, role, type: null, updatedAt: ago(1) }) as MemoryEntity;

const ME = entity("me", "self", "Я", null);
const OLGA = entity("olga", "person", "Ольга Ли", "менеджер в «Альфа-Логистике»");
const VECTOR = entity("vector", "org", "ООО «Вектор»", "поставщик оборудования");
const ANDREY = entity("andrey", "person", "Андрей Смирнов", "разработчик бэкенда");
const SKLAD = entity("sklad", "project", "«Склад 2.0»", "новая складская система");

const rec = (id: string, over: Partial<MemoryRecord> & Pick<MemoryRecord, "kind" | "text" | "entities">): MemoryRecord =>
  ({
    id, closedByWrite: null, deletedAt: null, doneAt: null, dueAt: null, givenAt: null, important: false,
    occurredAt: null, occurredPrecision: null, recordedAt: ago(10), role: null, rule: null, status: null,
    supersededAt: null, supersededBy: null, validFrom: null, validTo: null, writeId: null, ...over,
  }) as MemoryRecord;
const about = (id: string) => [{ entityId: id, role: "about" as const }];
const owes = (debtor: string, creditor: string) => [
  { entityId: debtor, role: "debtor" as const },
  { entityId: creditor, role: "creditor" as const },
];
const met = (id: string, text: string, on: string, who: string) =>
  rec(id, { entities: [{ entityId: who, role: "participant" }, { entityId: "me", role: "participant" }], kind: "event", occurredAt: day(on), occurredPrecision: "day", text });

const cards: { card: MemoryEntity; records: MemoryRecord[] }[] = [
  {
    card: OLGA,
    records: [
      rec("o1", { entities: about("olga"), kind: "fact", role: "менеджер в «Альфа-Логистике»", text: "Ольга Ли — менеджер в «Альфа-Логистике»", validFrom: day("2025-11-01") }),
      rec("o2", { entities: about("olga"), kind: "assessment", text: "Ольга быстро отвечает, но договоры присылает с опозданием", validFrom: day("2026-09-01") }),
      rec("o3", { entities: about("olga"), kind: "fact", text: "Предпочитает общаться в мессенджере, а не по почте", validFrom: day("2026-08-15") }),
      rec("o4", { dueAt: day("2026-11-16"), entities: owes("olga", "me"), givenAt: ago(6), kind: "commitment", status: "open", text: "Прислать договор на проверку" }),
      rec("o5", { dueAt: day("2026-11-12"), entities: owes("me", "olga"), givenAt: ago(5), important: true, kind: "commitment", status: "open", text: "Отправить ей спецификацию" }),
      rec("o6", { dueAt: day("2026-10-20"), doneAt: ago(14), entities: owes("olga", "me"), givenAt: ago(25), kind: "commitment", status: "done", text: "Прислать смету" }),
      met("o7", "Созвон с Ольгой по условиям поставки", "2026-11-04", "olga"),
      met("o8", "Встреча с Ольгой в офисе «Альфа-Логистики»", "2026-10-15", "olga"),
    ],
  },
  {
    card: VECTOR,
    records: [
      rec("v1", { entities: about("vector"), kind: "fact", text: "«Вектор» поставляет складское оборудование", validFrom: day("2025-06-01") }),
      rec("v2", { entities: about("vector"), kind: "fact", text: "Контакт в «Векторе» — Андрей Ковалёв, менеджер по закупкам", validFrom: day("2025-06-01") }),
      rec("v3", { dueAt: day("2026-11-20"), entities: owes("vector", "me"), givenAt: ago(7), kind: "commitment", status: "open", text: "Отгрузить стеллажи" }),
      rec("v4", { dueAt: day("2026-11-10"), entities: owes("me", "vector"), givenAt: ago(12), kind: "commitment", status: "open", text: "Подписать акт сверки" }),
      rec("v5", { entities: about("vector"), kind: "assessment", text: "С «Вектором» стоит договариваться заранее — склад у них загружен", validFrom: day("2026-10-01") }),
      met("v6", "Встречу с «Вектором» перенесли на четверг", "2026-11-12", "vector"),
    ],
  },
  {
    card: ANDREY,
    records: [
      rec("a1", { entities: about("andrey"), kind: "fact", role: "разработчик бэкенда", text: "Андрей Смирнов — разработчик бэкенда", validFrom: day("2025-03-01") }),
      rec("a2", { entities: about("andrey"), kind: "fact", text: "Андрея Смирнова назначили тимлидом бэкенда", validFrom: day("2026-10-20") }),
      rec("a3", { dueAt: day("2026-11-17"), entities: owes("andrey", "me"), givenAt: ago(4), kind: "commitment", status: "open", text: "Сдвинуть API на 17 ноября" }),
      rec("a4", { entities: about("andrey"), kind: "assessment", text: "Андрей надёжный, но не любит срочных задач в пятницу", validFrom: day("2026-07-01") }),
      met("a5", "Один на один с Андреем Смирновым", "2026-11-06", "andrey"),
      rec("a6", { entities: about("andrey"), kind: "fact", text: "Андрей Смирнов ведёт код-ревью в команде", validFrom: day("2026-05-01") }),
    ],
  },
  {
    card: SKLAD,
    records: [
      rec("s1", { entities: about("sklad"), kind: "fact", text: "«Склад 2.0» перешёл в тестирование", validFrom: day("2026-11-02") }),
      rec("s2", { entities: about("sklad"), kind: "fact", text: "У «Склада 2.0» появился второй заказчик", validFrom: day("2026-10-25") }),
      rec("s3", { dueAt: day("2026-11-25"), entities: owes("andrey", "me"), givenAt: ago(3), kind: "commitment", status: "open", text: "Подготовить релиз «Склада 2.0»" }),
      rec("s4", { dueAt: day("2026-11-14"), entities: owes("me", "vector"), givenAt: ago(2), kind: "commitment", status: "open", text: "Согласовать приёмку оборудования для «Склада 2.0»" }),
      met("s5", "Планёрка по «Складу 2.0»", "2026-11-13", "andrey"),
      rec("s6", { entities: about("sklad"), kind: "fact", text: "Стадия проекта — разработка", supersededAt: ago(8), validFrom: day("2026-10-02"), validTo: day("2026-11-02") }),
    ],
  },
];

const all = [ME, OLGA, VECTOR, ANDREY, SKLAD];
const KEY = sourceKey("gateway").key;
const gw = createGateway({ apiKey: KEY });
const norm = (s: string) => s.toLocaleLowerCase("ru").replaceAll("ё", "е");

/** The numbers and the capitalised words of a sentence that are in none of the records it names. */
const unsupported = (text: string, said: string) => {
  const hay = norm(said);
  // Dates are said as people do («12 ноября»): the month names stand for any day.
  const MONTHS = /января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря/u;
  const nums = (text.match(/\d+/gu) ?? []).filter((n) => !hay.includes(n));
  const names = (text.match(/(?<![.!?]\s)(?<!^)\p{Lu}[\p{L}-]{3,}/gu) ?? []).filter((w) => !hay.includes(norm(w).slice(0, Math.max(4, norm(w).length - 2))));
  return [...nums, ...names];
};

let sentences = 0;
let bad = 0;
let dropped = 0;
for (const { card, records } of cards) {
  const { prompt, refs } = summaryPrompt(card, records, all, TIMEZONE, NOW);
  const lines = new Map(
    [...refs].map(([ref, id]) => [id, prompt.split("\n").find((l) => l.startsWith(`${ref}:`)) ?? ""])
  );
  const r = await generateText({
    instructions: SUMMARY_INSTRUCTIONS,
    maxRetries: 2,
    model: gw(MODEL),
    output: Output.object({ schema: summarySchema }),
    prompt,
    providerOptions: { gateway: { zeroDataRetention: true } },
    reasoning: "low",
  });
  const asked = r.output.who.length + r.output.how.length + r.output.now.length;
  const kept = supported(r.output, refs);
  dropped += asked - (kept.who.length + kept.how.length + kept.now.length);
  console.log(`\n== ${card.name} (${records.length} records, ${r.usage.inputTokens} tokens in)`);
  for (const key of ["who", "how", "now"] as const) {
    for (const s of kept[key]) {
      sentences += 1;
      // What the model read: the record's line, with its dates and who owes whom.
      const said = s.records.map((id) => lines.get(id) ?? "").join(" ");
      const extra = unsupported(s.text, said);
      if (extra.length > 0) bad += 1;
      console.log(`  ${key.padEnd(3)} ${s.text}${extra.length > 0 ? `   ✗ not in the records: ${extra.join(", ")}` : ""}`);
    }
  }
}
console.log(JSON.stringify({ dropped_without_refs: dropped, model: MODEL, sentences, with_unsupported_words: bad }));
