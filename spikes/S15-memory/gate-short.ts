// S15 «отсев на коротких репликах» (D44): does the gate lose short replies that make sense only with the chat before
// them — an answer to the assistant's question, «с Андреем», «да, к пятнице»? 20 replies that must be read and 10 with
// nothing to keep, each with the turns before it, through the gate as the app asks it. Gateway only.
//
//   pnpm run gate-short        # microsoft/microsoft-decision-1 — a fraction of a cent
//   SHOW=1 pnpm run gate-short

import { createGateway } from "@ai-sdk/gateway";
import { experimental_evaluate as evaluate } from "ai";

import type { ChatTurn } from "../../packages/core/src/memory-extract.ts";
import { GATE_QUESTIONS, gateState, nothingToKeep } from "../../packages/core/src/memory-gate.ts";
import type { GateAnswers } from "../../packages/core/src/memory-gate.ts";
import { sourceKey } from "../S13-jev/keys.ts";

const MODEL = process.env.GATE_MODEL ?? "microsoft/microsoft-decision-1";
const TODAY = "Monday, 9 November 2026";
const u = (text: string): ChatTurn => ({ role: "user", text });
const a = (text: string): ChatTurn => ({ role: "assistant", text });

const cases: { keep: boolean; before: ChatTurn[]; text: string }[] = [
  // Answers to the assistant's question.
  { before: [u("у нас есть проект Давыдов"), a("Понял. С кем вы контактируете по нему?")], keep: true, text: "с Андреем" },
  { before: [u("у нас есть проект Давыдов и контрагент ООО ТД Давыдов"), a("Записал. Кто контакт со стороны контрагента?")], keep: true, text: "да, и контактируем мы по нему с Андреем" },
  { before: [u("Ольга обещала прислать договор"), a("К какому сроку она обещала?")], keep: true, text: "к пятнице" },
  { before: [u("надо позвонить в банк"), a("Когда вам напомнить?")], keep: true, text: "завтра в 10" },
  { before: [u("Марина делает макеты"), a("Для какого проекта?")], keep: true, text: "для склада" },
  { before: [u("встречаемся с Вектором"), a("Когда встреча?")], keep: true, text: "в среду в 15" },
  { before: [u("Андрей обещал доделать API"), a("Какой Андрей — Смирнов или Ковалёв?")], keep: true, text: "Смирнов" },
  { before: [u("Кирилл теперь в моей команде"), a("Кем он работает?")], keep: true, text: "разработчиком" },
  { before: [u("Светлана должна оплатить счёт"), a("Это важно или может подождать?")], keep: true, text: "горит" },
  { before: [u("жду ответа от поставщика"), a("От какого поставщика?")], keep: true, text: "от Вектора, по сканерам" },
  // Short news that leans on the chat before it.
  { before: [u("Ольга обещала прислать договор к пятнице"), a("Хорошо.")], keep: true, text: "прислала" },
  { before: [u("Андрей Смирнов обещал доделать API к пятнице"), a("Понял.")], keep: true, text: "он передумал, делаем к понедельнику" },
  { before: [u("в среду встреча с Вектором"), a("Хорошо.")], keep: true, text: "отменили" },
  { before: [u("надо отправить Игорю отчёт"), a("Понял.")], keep: true, text: "отправил" },
  { before: [u("Марина пришлёт макеты к 16 ноября"), a("Хорошо.")], keep: true, text: "не к 16, а к 20" },
  { before: [u("Влад делает v2 портала"), a("Понял.")], keep: true, text: "и документы тоже он" },
  { before: [u("Светлана — главный бухгалтер"), a("Понял.")], keep: true, text: "уже нет, теперь финдир" },
  { before: [u("созвон с Ольгой во вторник"), a("Хорошо.")], keep: true, text: "перенесли на четверг" },
  { before: [u("Кирилл Федотов — разработчик"), a("Понял.")], keep: true, text: "день рождения у него 3 марта" },
  { before: [u("жду счёт от Вектора"), a("Хорошо.")], keep: true, text: "пришёл, оплатили" },
  // Nothing to keep.
  { before: [u("посчитай 15% от 240 тысяч"), a("36 тысяч.")], keep: false, text: "спасибо" },
  { before: [u("Ольга обещала договор к пятнице"), a("Хорошо.")], keep: false, text: "ок" },
  { before: [a("Составить письмо Ольге?")], keep: false, text: "да, давай" },
  { before: [a("Вот черновик письма.")], keep: false, text: "сделай короче" },
  { before: [], keep: false, text: "привет" },
  { before: [a("36 тысяч.")], keep: false, text: "а если 18%?" },
  { before: [a("Вот таблица продаж за октябрь.")], keep: false, text: "покажи графиком" },
  { before: [], keep: false, text: "чем отличается индекс от первичного ключа" },
  { before: [a("Вот три варианта заголовка.")], keep: false, text: "второй лучше, переведи на английский" },
  { before: [a("Письмо отправлено.")], keep: false, text: "отлично" },
];

const gw = createGateway({ apiKey: sourceKey("gateway").key });
let lost = 0;
let skipped = 0;
let cost = 0;
await Promise.all(
  cases.map(async (c, i) => {
    const r = await evaluate({
      maxRetries: 2,
      model: gw.evaluationModel(MODEL),
      providerOptions: { gateway: { zeroDataRetention: true } },
      questions: GATE_QUESTIONS,
      state: gateState(c.text, TODAY, c.before),
    });
    cost += Number((r.providerMetadata?.gateway as { cost?: string } | undefined)?.cost ?? 0);
    const answers = r.answers as GateAnswers;
    const skip = nothingToKeep(answers);
    const top = Math.max(...Object.values(answers).map((x) => x.probability));
    if (c.keep && skip) {
      lost += 1;
      console.log(`  ✗ LOST ${i + 1}. «${c.text}» (max ${top.toFixed(2)})`);
    } else if (!c.keep && skip) skipped += 1;
    else if (!c.keep) console.log(`  · read ${i + 1}. «${c.text}» (max ${top.toFixed(2)})`);
    if (process.env.SHOW && c.keep) console.log(`    ${i + 1}. «${c.text}» max ${top.toFixed(2)}`);
  })
);
console.log(JSON.stringify({ cost: `$${cost.toFixed(5)}`, empty_skipped: `${skipped}/10`, lost: `${lost}/20`, model: MODEL }));
