// S15 «заметка на карточке» (P22 «Записать…»): a short note typed on a person's card, without their name — «обещал
// к пятнице», «вчера виделись». The writer reads it after `noteTurn` (the card as a question it answers), as the
// `note` source loads it. What is checked: the note is about the card's person unless it names someone else; who owes
// whom; the record's kind. Cards — S13's eight. Gateway only; run through `pnpm memory:eval` (PARTS=note).

import { RULE_TURN, extractionSchema, memoryInstructions, memoryPrompt, noteTurn } from "../../packages/core/src/memory-extract.ts";
import type { KnownCard } from "../../packages/core/src/memory-extract.ts";
import { caseId, type EvalCase } from "../S13-jev/eval-case.ts";
import { TIMEZONE, knownCards } from "../S13-jev/extract-cases.ts";
import { NOW } from "./memory300.ts";

const KIND: Record<string, KnownCard["kind"]> = { организация: "org", проект: "project", человек: "person" };
const cards: KnownCard[] = Object.entries(knownCards).map(([id, line]) => {
  const [name = "", rest = ""] = line.split(" — ");
  const [kindWord = "", role = null] = rest.split(": ");
  return { aliases: [], id, kind: KIND[kindWord] ?? "person", name, ref: id, role };
});

type Kind = "fact" | "event" | "commitment" | "rule";

interface Case {
  /** The card the note is typed on; none — a rule typed on the «Правила» page. */
  on?: string;
  /** A rule with a period: what it counts by, and every how many days. */
  period?: { kind: "rhythm" | "wait"; days: number };
  text: string;
  /** The item that has to be there: its kind, and for a commitment who owes whom; else the card it is about. */
  want: { kind: Kind; debtor?: string; creditor?: string; about?: string };
  /** Another kind as right: «сын пошёл в первый класс» is a fact about her and an event as well. */
  or?: Kind;
}

const cases: Case[] = [
  { on: "igor_belov", text: "обещал прислать отчёт к пятнице", want: { creditor: "user", debtor: "igor_belov", kind: "commitment" } },
  { on: "igor_belov", text: "вчера виделись, обсудили бюджет на декабрь", want: { about: "igor_belov", kind: "event" } },
  { on: "igor_belov", text: "предпочитает созваниваться утром, не писать", want: { about: "igor_belov", kind: "fact" } },
  { on: "igor_belov", text: "я обещал ему скидку 5% на следующий заказ", want: { creditor: "igor_belov", debtor: "user", kind: "commitment" } },
  { on: "olga_li", text: "должна подготовить договор до 20 ноября", want: { creditor: "user", debtor: "olga_li", kind: "commitment" } },
  { on: "olga_li", text: "пришлю ей смету в понедельник", want: { creditor: "olga_li", debtor: "user", kind: "commitment" } },
  { on: "marina_orlova", text: "встреча один на один в четверг в 15:00", want: { about: "marina_orlova", kind: "event" } },
  { on: "marina_orlova", or: "event", text: "сын пошёл в первый класс", want: { about: "marina_orlova", kind: "fact" } },
  { on: "andrey_smirnov", text: "один на один раз в две недели", want: { about: "andrey_smirnov", kind: "rule" } },
  // Names someone else: about them, not the card's person.
  { on: "igor_belov", text: "Андрей Смирнов обещал ему помочь с выгрузкой для отчёта", want: { creditor: "igor_belov", debtor: "andrey_smirnov", kind: "commitment" } },
  { on: "vector", text: "обещали отгрузить оборудование до конца месяца", want: { creditor: "user", debtor: "vector", kind: "commitment" } },
  { on: "andrey_kovalev", text: "ушёл из «Вектора», теперь в «Альфа-Логистике»", want: { about: "andrey_kovalev", kind: "fact" } },
  // A rule typed on the «Правила» page, with no card.
  { period: { days: 14, kind: "rhythm" }, text: "С каждым из моей команды встречаюсь один на один раз в две недели", want: { kind: "rule" } },
  { period: { days: 5, kind: "wait" }, text: "Если контрагент не отвечает больше пяти рабочих дней — напомни мне", want: { kind: "rule" } },
  { text: "Напоминай мне по пятницам проверить отчёты", want: { kind: "rule" } },
];

type Out = (typeof extractionSchema)["_output"];

const found = (c: Case, o: Out) =>
  o.items.some((i) => {
    if (c.want.kind === "rule") {
      return i.kind === "rule" && (!c.period || (i.rule_kind === c.period.kind && i.interval_days === c.period.days));
    }
    if (i.kind !== c.want.kind && i.kind !== c.or) return false;
    if (c.want.kind === "commitment") return i.debtor === c.want.debtor && i.creditor === c.want.creditor;
    return i.about.includes(c.want.about ?? "");
  });

/** The cases for `pnpm memory:eval`, as the `note` source sends them. */
export const evalCases = (): EvalCase[] =>
  cases.map((c, i) => {
    const card = cards.find((k) => k.id === c.on);
    if (c.on && !card) throw new Error(`note: no card ${c.on}`);
    return {
      id: caseId(i),
      instructions: memoryInstructions({ cards, sentAt: NOW, timeZone: TIMEZONE }),
      kind: "write",
      prompt: memoryPrompt(c.text, [card ? noteTurn(card) : RULE_TURN]),
      score: (o) => {
        const right = found(c, o);
        // The record keeps the note's language: a Russian note gives a Russian text.
        const russian = o.items.every((it) => /[а-яё]/iu.test(it.text));
        const misses = [
          !right && `no ${c.want.kind} ${c.want.debtor ?? c.want.about ?? ""}→${c.want.creditor ?? ""}: ${o.items.map((it) => `${it.kind} ${it.rule_kind ?? ""} ${it.interval_days} ${it.debtor ?? it.about.join(",")}→${it.creditor ?? ""}`).join(", ") || "none"}`,
          !russian && "not in the note's language",
        ].filter(Boolean);
        return {
          miss: misses.length > 0 ? misses.join("; ") : null,
          tally: { [card ? "on_card" : "rule_typed"]: [right ? 1 : 0, 1], language: [russian ? 1 : 0, 1] },
        };
      },
      text: `${card ? card.name : "Правила"}: ${c.text}`,
    };
  });
