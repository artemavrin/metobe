// S13 part 5: the message with the exchange before it (ARCH §19.4). The writer reads the context only to understand
// «он», «передумал» or an answer to the assistant's question, and must not record again what the context said.
// Gateway only. Cards — S13's, plus the two Андрея from the dev chat of 2026-11-09.

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import { extractionSchema, memoryInstructions, memoryPrompt } from "../../packages/core/src/memory-extract.ts";
import type { ChatTurn } from "../../packages/core/src/memory-extract.ts";
import { cards, exchange } from "./cases.ts";
import { TIMEZONE, TODAY_ISO } from "./extract-cases.ts";
import { sourceKey } from "./keys.ts";

const MODELS = (process.env.MODELS ?? "google/gemini-3.5-flash").split(",");
const gw = createGateway({ apiKey: sourceKey("gateway").key });

const known = {
  ...Object.fromEntries(Object.entries(cards).filter(([k]) => k !== "new" && k !== "unclear" && !k.startsWith("andrey"))),
  andrey_lanshin: "Андрей Ланьшин — коллега",
  andrey_sedov: "Андрей Седов — коллега",
  sklad: "«Склад 2.0» — проект: новая складская система",
};
const appCards = Object.entries(known).map(([ref, line]) => {
  const [name, role = null] = line.split(" — ");
  const kind = /организация/.test(line) ? "org" : /проект/.test(line) ? "project" : "person";
  return { aliases: [], id: ref, kind, name, ref, role } as const;
});
// What the app holds open after the previous messages: a message that settles one of them updates it (S13, part 6).
const open = (ref: string, text: string) => ({ due: null, id: ref, ref, status: "open" as const, text });
const commitments = [
  open("k1", "Ольга Ли пришлёт подписанный договор до 13 ноября"),
  open("k2", "Андрей Седов сделает API к 13 ноября"),
  open("k3", "Позвонить Андрею Седову 10 ноября"),
];
const system = memoryInstructions({
  cards: appCards,
  commitments,
  sentAt: new Date(`${TODAY_ISO}T09:00:00Z`),
  timeZone: TIMEZONE,
});

interface Case {
  before: { user?: string; assistant?: string };
  /** A story over a few messages (ARCH §19.8.2): the chat before, oldest first, in place of `before`. */
  story?: ChatTurn[];
  text: string;
  /** Refs the records must point at; `ask` — a question with these candidates, or nothing kept; `nothing` — nothing at all. */
  refs?: string[];
  ask?: string[];
  nothing?: boolean;
  /** A phrase of the context that must not be recorded again. */
  notAgain?: RegExp;
  when?: string;
  /** A commitment's deadline, by its start. */
  due?: string;
  /** An open commitment the message settles — then that update is the answer, and no refs are needed. */
  settles?: string;
}
const ANDREYS = ["andrey_sedov", "andrey_lanshin"];
const cases: Case[] = [
  {
    ask: ANDREYS,
    before: { assistant: "Записал: позвонить Андрею Седову завтра, встреча у Андрея Ланьшина сегодня в 15:00.", user: "Андрей Седов просил позвонить завтра\nАндрей Ланьшин организует сегодня в 15 встречу" },
    text: "андрей передумал",
  },
  {
    before: { assistant: "Какой Андрей передумал — Седов или Ланьшин? И что именно поменялось?", user: "андрей передумал" },
    refs: ["andrey_lanshin"],
    text: "Ланьшин, встречи не будет",
  },
  {
    before: { assistant: "Понял, жду договор от Ольги Ли.", user: "Ольга обещала прислать подписанный договор до пятницы." },
    notAgain: /до пятниц|13 ноября/,
    refs: ["olga_li"],
    settles: "k1:done",
    text: "она прислала",
  },
  {
    before: { assistant: "Подготовить короткое напоминание ООО «Вектор» о коммерческом предложении?", user: "«Вектор» так и не ответил на наше предложение." },
    refs: ["vector"],
    text: "да, и они ещё просили скидку 5%",
  },
  {
    before: { assistant: "Проект «Склад 2.0» в тестировании, запуск намечен на ноябрь.", user: "Как дела у «Склада 2.0»?" },
    refs: ["sklad"],
    text: "его перенесли на декабрь",
    when: "2026-12",
  },
  {
    before: { assistant: "Договорились: встреча с Игорем Беловым в среду, 11 ноября.", user: "Поставь встречу с Игорем на среду." },
    refs: ["igor_belov"],
    text: "перенесли на четверг",
    when: "2026-11-12",
  },
  {
    before: { assistant: "Андрей Седов взял на себя API к пятнице.", user: "Андрей Седов обещал сделать API к пятнице." },
    notAgain: /к пятниц|13 ноября/,
    refs: ["andrey_sedov"],
    settles: "k2:unconfirmed",
    text: "он уже всё сделал",
  },
  {
    before: { assistant: "Ольга Ли — менеджер в «Альфа-Логистике».", user: "Кто такая Ольга?" },
    nothing: true,
    text: "посчитай 15% от 240 тысяч",
  },
  // Told over a few messages: who «он» and «она» are was said two messages back, not in the last exchange.
  {
    before: {},
    refs: ["igor_belov"],
    story: [
      { role: "user", text: "Встретился с Игорем Беловым, обсуждали поставки на декабрь." },
      { role: "assistant", text: "Как прошло? О чём договорились?" },
      { role: "user", text: "Нормально, долго спорили о сроках." },
      { role: "assistant", text: "Сроки — частая тема. Что в итоге решили?" },
    ],
    due: "2026-11-11",
    text: "он пришлёт график к среде",
  },
  {
    before: {},
    notAgain: /до пятниц|13 ноября/,
    refs: ["olga_li"],
    settles: "k1:done",
    story: [
      { role: "user", text: "Ольга Ли обещала прислать подписанный договор до пятницы." },
      { role: "assistant", text: "Понял, жду договор от Ольги Ли." },
      { role: "user", text: "Посчитай 15% от 240 тысяч" },
      { role: "assistant", text: "15% от 240 000 — 36 000." },
    ],
    text: "кстати, она уже прислала",
  },
];

type Out = (typeof extractionSchema)["_output"];
const refsOf = (o: Out) => o.items.flatMap((i) => [...i.about, i.debtor, i.creditor]).filter(Boolean) as string[];
const verdict = (c: Case, o: Out) => {
  if (c.nothing) return o.items.length === 0 && o.asks.length === 0 ? null : `recorded: ${o.items.map((i) => i.text).join(" / ")}`;
  const used = new Set(refsOf(o));
  if (c.settles) {
    const got = o.updates.map((u) => `${u.ref}:${u.status}`);
    return got.includes(c.settles) ? null : `settled ${got.join(", ") || "nothing"}, not ${c.settles}`;
  }
  // Silence is right too when it cannot say what to keep: the chat's assistant asks back anyway.
  if (c.ask && o.items.length === 0) return null;
  if (c.ask) {
    const a = o.asks.find((x) => c.ask?.every((r) => x.candidates.includes(r)));
    if (!a) return `no question: ${JSON.stringify(o.asks)} items ${o.items.map((i) => i.text).join(" / ")}`;
    if (!used.has(a.id)) return "question not used by any record";
  } else if (o.asks.length > 0) return `asked needlessly: ${o.asks.map((x) => x.question).join("; ")}`;
  for (const r of c.refs ?? []) if (!used.has(r)) return `no ${r}: refs ${[...used].join(", ")}`;
  if (c.notAgain && o.items.some((i) => c.notAgain?.test(i.text))) return `recorded the context again: ${o.items.map((i) => i.text).join(" / ")}`;
  if (c.when && !o.items.some((i) => i.when?.date.startsWith(c.when as string))) return `date: ${o.items.map((i) => i.when?.date).join(", ")}`;
  if (c.due && !o.items.some((i) => i.due?.date.startsWith(c.due as string))) return `due: ${o.items.map((i) => i.due?.date).join(", ")}`;
  return null;
};

for (const id of MODELS) {
  let ok = 0;
  for (const c of cases) {
    const r = await generateText({
      instructions: system,
      maxRetries: 1,
      model: gw(id),
      output: Output.object({ schema: extractionSchema }),
      prompt: memoryPrompt(c.text, c.story ?? exchange(c.before)),
      providerOptions: { gateway: { zeroDataRetention: true } },
      reasoning: "low",
    });
    const v = verdict(c, r.output);
    if (v) console.log(`  ✗ ${c.text} → ${v}`);
    else ok++;
    console.log(`    · ${c.text}: ${[...r.output.asks.map((a) => `? ${a.question}`), ...r.output.items.map((i) => `${i.kind}: ${i.text}`)].join(" | ") || "—"}`);
  }
  console.log(JSON.stringify({ model: id, right: `${ok}/${cases.length}` }));
}
