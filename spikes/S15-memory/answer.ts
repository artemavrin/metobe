// S15 part «ответ» (Г1.6а, MEMORY-PLAN §7.1): the assistant's answer retells what a tool read — the mail, a business
// system, the web — and may settle an open commitment as «ждёт проверки», nothing else. 15 cases on the 300-card
// memory: 8 where the answer shows a commitment done (one of them — two), 7 where it only plans, advises, guesses,
// finds something partial or something else. The writer is shown what it would be shown: the cards and commitments
// the pick finds for the request and the answer, the request in <message>, the answer in <answer>; its output goes
// through the table of voices (`limitByVoice`) and `planWrite`. Aim: no false closure, nothing settled as «выполнено»,
// no record made from the answer. Gateway only.
//
//   DRY=1 pnpm run answer        # no model: what each case is shown, and whether the pick holds the commitment
//   pnpm run answer              # meta/muse-ember — about $0.01 for 15 answers
//   ONLY=3,7 SHOW=1 pnpm run answer

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import type { MemoryEntity, MemoryRecord } from "../../packages/core/src/memory.ts";
import { candidateCards, candidateCommitments } from "../../packages/core/src/memory-candidates.ts";
import { limitByVoice } from "../../packages/core/src/memory-evidence.ts";
import { extractionSchema, memoryInstructions, memoryPrompt, planWrite } from "../../packages/core/src/memory-extract.ts";
import type { KnownCard, OpenCommitment } from "../../packages/core/src/memory-extract.ts";
import { sourceKey } from "../S13-jev/keys.ts";
import { NOW, SELF, fillerCards, fillerPromises, promise } from "./memory300.ts";

const MODEL = process.env.MODEL ?? "meta/muse-ember";
const DRY = Boolean(process.env.DRY);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map(Number)) : null;

// --- the memory -----------------------------------------------------------------------------------------------------

const card = (id: string, kind: MemoryEntity["kind"], name: string, role: string | null): MemoryEntity => ({
  aliases: [],
  createdAt: new Date(NOW.getTime() - 120 * 86_400_000),
  email: null,
  id,
  kind,
  name,
  phone: null,
  role,
  type: null,
  updatedAt: new Date(NOW.getTime() - 120 * 86_400_000),
});

const base: MemoryEntity[] = [
  card("olga_li", "person", "Ольга Ли", "менеджер в «Альфа-Логистике»"),
  card("andrey_smirnov", "person", "Андрей Смирнов", "разработчик бэкенда"),
  card("vector", "org", "ООО «Вектор»", "поставщик оборудования"),
  card("andrey_kovalev", "person", "Андрей Ковалёв", "менеджер по закупкам в «Векторе»"),
  card("svetlana_petrova", "person", "Светлана Петрова", "главный бухгалтер"),
  card("marina_orlova", "person", "Марина Орлова", "дизайнер"),
];
const filler = fillerCards();
const entities = [SELF, ...base, ...filler];

const due = (d: string) => new Date(`${d}T00:00:00+03:00`);
const owed = [
  promise("K_OLGA", "Ольга Ли пришлёт подписанный договор поставки к 13 ноября", "olga_li", "user", { ago: 6, due: due("2026-11-13") }),
  promise("K_API", "Андрей Смирнов закончит API для «Склада 2.0» к 13 ноября", "andrey_smirnov", "user", { ago: 8, due: due("2026-11-13") }),
  promise("K_DOCS", "Андрей Смирнов выложит документацию API версии 2.0 на сайт", "andrey_smirnov", "user", { ago: 10 }),
  promise("K_INVOICE", "ООО «Вектор» выставит счёт за сканеры", "vector", "user", { ago: 5 }),
  promise("K_PAY", "Светлана Петрова оплатит счёт «Вектора» №118", "svetlana_petrova", "user", { ago: 4 }),
  promise("K_MAKET", "Марина Орлова пришлёт макеты главной страницы к 16 ноября", "marina_orlova", "user", { ago: 7, due: due("2026-11-16") }),
  promise("K_KP", "Андрей Ковалёв пришлёт коммерческое предложение по сканерам", "andrey_kovalev", "user", { ago: 9 }),
];
const records: MemoryRecord[] = [...owed, ...fillerPromises(filler)];

// --- the cases ------------------------------------------------------------------------------------------------------

const cases: { request: string; answer: string; settles: string[] }[] = [
  {
    answer: "Да, Ольга Ли вчера в 16:40 прислала письмо «Договор поставки — подписанный экземпляр» с вложением dogovor_podpisan.pdf.",
    request: "Пришёл договор от Ольги?",
    settles: ["K_OLGA"],
  },
  {
    answer: "Задача «API для Склада 2.0» у Андрея Смирнова закрыта сегодня в 11:20, статус «Готово», изменения влиты в main.",
    request: "Глянь в трекере, Андрей доделал API для склада?",
    settles: ["K_API"],
  },
  {
    answer: "В почте есть письмо от ООО «Вектор» от 8 ноября: «Счёт №118 на оплату сканеров», PDF во вложении.",
    request: "Вектор выставил счёт за сканеры?",
    settles: ["K_INVOICE"],
  },
  {
    answer: "В учётной системе платёжное поручение №542 от 8 ноября на оплату счёта №118 ООО «Вектор» проведено, оплату провела Светлана Петрова.",
    request: "Проверь, оплачен ли счёт Вектора 118",
    settles: ["K_PAY"],
  },
  {
    answer: "Марина Орлова прислала письмо «Макеты главной» — ссылка на Figma и три PNG: десктоп, планшет, телефон.",
    request: "Марина прислала макеты?",
    settles: ["K_MAKET"],
  },
  {
    answer: "Новых писем три: от Андрея Ковалёва — коммерческое предложение по сканерам (KP_skanery.pdf), рассылка банка и уведомление о доставке.",
    request: "что нового в почте",
    settles: ["K_KP"],
  },
  {
    answer: "От Ольги Ли сегодня утром пришёл подписанный договор поставки (скан с печатью). Марина Орлова прислала макеты главной страницы — ссылка на Figma.",
    request: "Что пришло от Ольги и Марины?",
    settles: ["K_MAKET", "K_OLGA"],
  },
  {
    answer: "На docs.example.com опубликована документация API версии 2.0, дата публикации — 8 ноября, автор — Андрей Смирнов.",
    request: "Посмотри на сайте, выложил ли Андрей Смирнов документацию API",
    settles: ["K_DOCS"],
  },
  {
    answer: "Писем от Ольги Ли за неделю нет. Последнее — 2 ноября, про сроки поставки.",
    request: "Пришёл договор от Ольги?",
    settles: [],
  },
  {
    answer: "Задача «API для Склада 2.0» в статусе «В работе», последний комментарий Андрея Смирнова: «почти готово, завтра выкачу».",
    request: "Андрей доделал API?",
    settles: [],
  },
  {
    answer: "Письма от «Вектора» со счётом нет. Стоит напомнить Андрею Ковалёву — могу подготовить черновик.",
    request: "Вектор выставил счёт за сканеры?",
    settles: [],
  },
  {
    answer: "Счёт №118 в учётной системе есть, платёжное поручение создано, но ещё не проведено — оно на согласовании у Светланы Петровой.",
    request: "Проверь оплату счёта Вектора 118",
    settles: [],
  },
  {
    answer: "Марина Орлова написала, что макеты главной будут к понедельнику: сейчас дорабатывает мобильную версию.",
    request: "Марина прислала макеты?",
    settles: [],
  },
  {
    answer: "Андрей Ковалёв прислал прайс-лист на мониторы. Коммерческого предложения по сканерам пока нет.",
    request: "Что прислал Ковалёв?",
    settles: [],
  },
  {
    answer: "Ольга Ли прислала договор поставки на согласование — без подписи, с правками в разделе 4.",
    request: "Посмотри договор от Ольги",
    settles: [],
  },
];

// --- what the model is shown ----------------------------------------------------------------------------------------

const shown = (request: string, answer: string) => {
  const said = `${request}\n${answer}`;
  const found = candidateCards({ entities, now: NOW, records, text: said });
  const commitments: OpenCommitment[] = candidateCommitments({ cards: found, now: NOW, records, selfId: SELF.id, text: said }).map(
    (r, i) => ({ due: r.dueAt, id: r.id, ref: `k${i + 1}`, status: r.status === "unconfirmed" ? "unconfirmed" : "open", text: r.text })
  );
  const cards: KnownCard[] = found.map((e) => ({ aliases: e.aliases, id: e.id, kind: e.kind as KnownCard["kind"], name: e.name, ref: e.id, role: e.role }));
  return { cards, commitments };
};

const TIMEZONE = "Europe/Moscow";
const picked = cases.map((c, i) => ({ c, i: i + 1 })).filter(({ i }) => !ONLY || ONLY.has(i));

for (const { c, i } of picked) {
  const s = shown(c.request, c.answer);
  const lost = c.settles.filter((id) => !s.commitments.some((k) => k.id === id));
  if (lost.length > 0) console.log(`  ✗ ${i}. pick lost ${lost.join(", ")}`);
  if (DRY) console.log(`  ${i}. ${s.commitments.length} commitments shown`);
}
if (DRY) process.exit(0);

const KEY = sourceKey("gateway").key;
const gw = createGateway({ apiKey: KEY });
let cost = 0;
let right = 0;
let falseClosures = 0;
let missed = 0;
let asDone = 0;
let fromAnswer = 0;
await Promise.all(
  picked.map(async ({ c, i }) => {
    const s = shown(c.request, c.answer);
    try {
      const r = await generateText({
        instructions: memoryInstructions({ answer: true, cards: s.cards, commitments: s.commitments, sentAt: NOW, timeZone: TIMEZONE }),
        maxRetries: 2,
        model: gw(MODEL),
        output: Output.object({ schema: extractionSchema }),
        prompt: memoryPrompt(c.request, [], c.answer),
        providerOptions: { gateway: { zeroDataRetention: true } },
        reasoning: "low",
      });
      cost += Number((r.providerMetadata?.gateway as { cost?: string } | undefined)?.cost ?? 0);
      const limited = limitByVoice(r.output, { answer: true, others: false, owner: true });
      const plan = planWrite(limited, { cards: s.cards, commitments: s.commitments, selfId: SELF.id, timeZone: TIMEZONE });
      asDone += plan.statuses.filter((x) => x.status === "done").length;
      fromAnswer += plan.records.length;
      if (plan.records.length > 0) console.log(`  · ${i}. records: ${plan.records.map((x) => `«${x.text}»`).join(", ")}`);
      // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array
      const got = plan.statuses.map((x) => x.recordId).sort();
      const want = [...c.settles].sort();
      const wrong = got.filter((id) => !want.includes(id));
      const lacking = want.filter((id) => !got.includes(id));
      falseClosures += wrong.length;
      missed += lacking.length;
      if (wrong.length === 0 && lacking.length === 0) right += 1;
      else console.log(`  ✗ ${i}. ${c.request} → closed [${got.join(", ")}], want [${want.join(", ")}]`);
      if (process.env.SHOW) console.log(`      ${JSON.stringify(r.output)}`);
    } catch (error) {
      console.log(`  ! ${i}. ${(error as Error).message.slice(0, 160)}`);
    }
  })
);
console.log(
  JSON.stringify({
    cost: `$${cost.toFixed(4)}`,
    false_closures: falseClosures,
    records_made: fromAnswer,
    settled_as_done: asDone,
    missed_closures: missed,
    model: MODEL,
    right: `${right}/${picked.length}`,
  })
);
