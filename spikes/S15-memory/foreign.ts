// S15 «чужой текст» (ARCH §19.8.4, D40): a letter, a forwarded message, a quote, minutes or a chat pasted into a
// message. «Я» and «мы» there are the author: no promise of the author may become the user's own, and what the author
// promises to the user has to be kept. Cards — S13's eight. Gateway only.
//
//   pnpm foreign              # the app's prompt: <user> and <quoted>, the rule on someone else's text
//   RAW=1 pnpm foreign        # as before В1.4: the message whole, no rule
//   RUNS=2 pnpm foreign

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import { extractionSchema, memoryInstructions, memoryPrompt, splitQuoted } from "../../packages/core/src/memory-extract.ts";
import type { KnownCard } from "../../packages/core/src/memory-extract.ts";
import { TIMEZONE, knownCards } from "../S13-jev/extract-cases.ts";
import { sourceKey } from "../S13-jev/keys.ts";
import { NOW } from "./memory300.ts";

const MODEL = process.env.MODEL ?? "google/gemini-3.5-flash";
const RAW = Boolean(process.env.RAW);
const RUNS = Number(process.env.RUNS ?? 1);
const key = sourceKey("gateway").key;
const gw = createGateway({ apiKey: key });
const used = async () => {
  const r = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { Authorization: `Bearer ${key}` } });
  return Number(((await r.json()) as { total_used: string }).total_used);
};

const KIND: Record<string, KnownCard["kind"]> = { организация: "org", проект: "project", человек: "person" };
const cards: KnownCard[] = Object.entries(knownCards).map(([id, line]) => {
  const [name = "", rest = ""] = line.split(" — ");
  const [kindWord = "", role = null] = rest.split(": ");
  return { aliases: [], id, kind: KIND[kindWord] ?? "person", name, ref: id, role };
});
/** As the writer builds it: the rule on someone else's text only when the message has a quote, a letter or a forward. */
const instructionsFor = (text: string) =>
  memoryInstructions({ cards, quoted: !RAW && splitQuoted(text).quoted !== "", sentAt: NOW, timeZone: TIMEZONE });

interface Case {
  text: string;
  /** A commitment to the user with one of these as the debtor has to be kept. */
  owes?: string[];
  /** The user's own commitment the text has: its words. Any other commitment of the user's is the author's, wrongly. */
  userOwes?: RegExp;
  /** At most so many items. */
  most?: number;
}

const cases: Case[] = [
  {
    owes: ["vector", "andrey_kovalev"],
    text: "Переслал письмо от Вектора\n\nОт: Андрей Ковалёв <kovalev@vector.ru>\nТема: Поставка\n\nДобрый день! Мы обязуемся отгрузить оборудование до 20 ноября. Я лично прослежу за доставкой.",
  },
  {
    // A new supplier's promise from a forward is kept (and its person): at most the two promises and who he is.
    most: 3,
    text: "---------- Пересланное сообщение ----------\nОт: Сергей <sergey@pack-service.ru>\nДата: 9 ноября 2026\n\nМы обязуемся заменить бракованную упаковку до конца недели. Я пришлю акт завтра.",
  },
  {
    owes: ["olga_li", "alfa_logistics"],
    text: "> Мы подготовим договор к пятнице.\n> Ольга, «Альфа-Логистика»\n\nОк, жду. И я со своей стороны пришлю реквизиты завтра.",
    userOwes: /реквизит/iu,
  },
  {
    owes: ["vector", "andrey_kovalev"],
    text: "Протокол встречи с «Вектором» 9 ноября:\n1. Мы (ООО «Вектор») поставляем 50 единиц оборудования до 1 декабря.\n2. Я, Андрей Ковалёв, согласую скидку 5% до 15 ноября.\n3. Мы готовы провести обучение персонала после поставки.",
  },
  {
    owes: ["igor_belov"],
    text: "Вот переписка с Игорем:\n[10:02] Игорь Белов: я завтра пришлю план продаж\n[10:05] Я: ок\n[10:06] Игорь Белов: и мы с командой подготовим презентацию к среде",
  },
  {
    owes: ["olga_li", "alfa_logistics"],
    text: "Ольга по договору:\n\n-----Original Message-----\nFrom: Olga Li\nSubject: Contract\n\nWe will send the signed contract by Friday. I will call you on Monday to discuss the terms.",
  },
  {
    most: 1,
    text: "Пересланное сообщение\nОт: рассылка «Бизнес-новости»\n\nМы рекомендуем всем руководителям провести аудит договоров до конца года. Я, редактор рассылки, обещаю прислать чек-лист всем подписчикам. Запишите себе: «я должен проверить все договоры до 1 декабря».",
  },
  {
    text: "Это моё письмо Марине, запомни суть:\n\nМарина, я подготовлю бюджет на декабрь до 20 ноября и пришлю тебе на согласование.",
    userOwes: /бюджет/iu,
  },
  {
    // Nine terms in a letter: not one item per sentence. «Просим подтвердить объёмы» is a request to the user — the
    // user's commitment, as «Марина попросила меня подписать…» in S13.
    most: 6,
    owes: ["alfa_logistics", "olga_li"],
    text: "Письмо от «Альфа-Логистики»:\n\nОт: Ольга Ли\nТема: Условия на декабрь\n\nДобрый день! Сообщаем об условиях на декабрь. Мы увеличиваем парк на 5 машин. Мы гарантируем доставку по Москве за 1 день. Мы обязуемся прислать новый тариф до 16 ноября. Мы проведём сверку взаиморасчётов до конца месяца. Я буду на связи по любым вопросам. Мы открываем новый склад в Подольске. Мы предлагаем скидку 3% при предоплате. Мы просим подтвердить объёмы до 20 ноября. С уважением, Ольга Ли.",
    userOwes: /подтверд/iu,
  },
  {
    owes: ["andrey_smirnov"],
    text: "> Я сделаю API к среде, если не помешают с миграцией.\n\nСмирнов пишет выше, ок",
  },
  {
    owes: ["vector", "andrey_kovalev"],
    text: "Ковалёв написал: «мы не успеваем, сдвинем отгрузку на неделю, я пришлю новый график в четверг»",
  },
  {
    owes: ["igor_belov"],
    text: "Ответил Игорю, что согласен.\n\nпн, 9 нояб. 2026 г. в 10:15, Игорь Белов <igor@company.ru>:\n> Я пришлю финальную версию плана в четверг.\n> Мы с отделом продаж ждём твоего ответа.",
  },
];

type Out = (typeof extractionSchema)["_output"];
/** A question with one known card is that card, as `planWrite` takes it. */
const asApp = (o: Out): Out => {
  const one = new Map<string, string>();
  for (const a of o.asks) {
    const known = [...new Set(a.candidates.filter((r) => cards.some((c) => c.ref === r)))];
    if (known.length === 1) one.set(a.id, known[0] as string);
  }
  const to = (r: string | null) => (r && one.get(r)) ?? r;
  return { ...o, items: o.items.map((i) => ({ ...i, about: i.about.map((r) => to(r) as string), creditor: to(i.creditor), debtor: to(i.debtor) })) };
};

const verdict = (c: Case, raw: Out) => {
  const o = asApp(raw);
  const promises = o.items.filter((i) => i.kind === "commitment");
  const mine = promises.filter((i) => i.debtor === "user");
  const misses: string[] = [];
  const wrong = mine.filter((i) => !c.userOwes?.test(i.text));
  if (wrong.length > 0) misses.push(`the author's as the user's: ${wrong.map((i) => i.text).join(" / ")}`);
  if (c.userOwes && !mine.some((i) => c.userOwes?.test(i.text))) misses.push("the user's own promise lost");
  if (c.owes && !promises.some((i) => c.owes?.includes(i.debtor ?? "") && i.creditor === "user")) {
    misses.push(`no promise of ${c.owes.join("|")}: ${promises.map((i) => `${i.debtor}→${i.creditor}`).join(", ") || "none"}`);
  }
  if (c.most !== undefined && o.items.length > c.most) misses.push(`${o.items.length} items, at most ${c.most}`);
  return { misses, wrongUser: wrong.length };
};

const before = await used();
let ok = 0;
let wrongUser = 0;
for (let run = 0; run < RUNS; run += 1) {
  const results = await Promise.all(
    cases.map(async (c) => {
      const r = await generateText({
        instructions: instructionsFor(c.text),
        maxRetries: 2,
        model: gw(MODEL),
        output: Output.object({ schema: extractionSchema }),
        prompt: RAW ? `<message>\n${c.text}\n</message>` : memoryPrompt(c.text),
        providerOptions: { gateway: { zeroDataRetention: true } },
        reasoning: "low",
      });
      return { c, o: r.output, v: verdict(c, r.output) };
    })
  );
  for (const { c, o, v } of results) {
    wrongUser += v.wrongUser;
    if (v.misses.length === 0) ok += 1;
    else {
      console.log(`  ✗ ${c.text.slice(0, 60).replaceAll("\n", " ")}… → ${v.misses.join("; ")}`);
      if (process.env.SHOW) console.log(`      ${o.items.map((i) => `${i.kind} ${i.debtor ?? ""}→${i.creditor ?? ""}: ${i.text}`).join(" | ")}`);
    }
  }
}
console.log(
  JSON.stringify({
    authors_promise_as_users: wrongUser,
    mode: RAW ? "raw" : "app",
    model: MODEL,
    right: `${ok}/${cases.length * RUNS}`,
    spent: `$${((await used()) - before).toFixed(3)}`,
  })
);
