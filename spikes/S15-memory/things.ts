// S15 «вещи» (D42): the writer names a thing — a pet, a vehicle, a contract, a device — as a new card of kind `thing`
// with the person's word for what it is in `about`; and keeps naming a person, an organization, a project or a group as
// before, and no card for what is mentioned in passing. What a thing becomes is the decision model's (`pnpm types`);
// here only the writer's side. Cards — S13's eight (none of them a thing). Gateway only; run through
// `pnpm memory:eval` (PARTS=things).

import { memoryInstructions, memoryPrompt, planWrite } from "../../packages/core/src/memory-extract.ts";
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

interface Case {
  text: string;
  /** A thing the message names: part of its name and part of the word for what it is. None — no thing at all. */
  thing?: { name: RegExp; about: RegExp };
  /** A new card of this built-in kind: «организация», «проект», «группа», «человек». */
  builtIn?: { name: RegExp; kind: "organization" | "project" | "group" | "person" };
}

const cases: Case[] = [
  { text: "Кота Барсика в четверг везу к ветеринару", thing: { about: /кот|питом/iu, name: /барсик/iu } },
  { text: "Автобус 412 встал на ремонт до пятницы", thing: { about: /автобус|транспорт|машин/iu, name: /412/u } },
  { text: "Станок ЧПУ-3 простаивает вторую неделю", thing: { about: /станок|оборудов/iu, name: /чпу/iu } },
  { text: "запиши еще, что из оборудования у нас есть mac studio m3 ultra на 256 гигов", thing: { about: /компьютер|оборудов|техник|mac/iu, name: /mac studio/iu } },
  { text: "Договор № 45 с «Вектором» истекает 1 декабря", thing: { about: /договор|контракт/iu, name: /45/u } },
  { text: "Сервер db-02 надо обновить до конца месяца", thing: { about: /сервер/iu, name: /db-02/iu } },
  { text: "Собака Альма привита до мая", thing: { about: /собак|питом/iu, name: /альма/iu } },
  { text: "Стройка на Речной, 3 отстаёт на две недели", thing: { about: /стройк|объект|площадк/iu, name: /речн/iu } },
  // Not things: the built-in kinds stay as they were.
  { builtIn: { kind: "person", name: /гуров/iu }, text: "Павел Гуров из «Вектора» обещал прислать прайс" },
  { builtIn: { kind: "organization", name: /стрел/iu }, text: "ООО «Стрела» подняла цены на запчасти" },
  { builtIn: { kind: "project", name: /crm/iu }, text: "Внедрение CRM идёт по плану, этап настройки закончен" },
  { builtIn: { kind: "group", name: /бухгалтер/iu }, text: "Бухгалтерия просит акты до пятницы" },
  // Nothing worth a card, in the message and for the writer too.
  { text: "Купил новый ноутбук, завтра настрою" },
  { text: "Отчёт за октябрь отправил" },
  { text: "Нужен автобус на корпоратив в декабре" },
  { text: "Закажи пиццу на обед" },
];

/** The cases for `pnpm memory:eval`, as the app sends them. */
export const evalCases = (): EvalCase[] =>
  cases.map((c, i) => ({
    id: caseId(i),
    instructions: memoryInstructions({ cards, sentAt: NOW, timeZone: TIMEZONE }),
    kind: "write",
    prompt: memoryPrompt(c.text),
    score: (o) => {
      const things = o.new_entities.filter((e) => e.kind === "thing");
      const named = c.thing
        ? things.filter((e) => c.thing?.name.test(e.name) && c.thing.about.test(e.about))
        : [];
      const found = named.length > 0;
      // The plan: a card nothing points at is not made — the code links a record that has the thing's name in its text.
      const plan = planWrite(o, { cards, selfId: "self", timeZone: TIMEZONE });
      const made = c.thing ? plan.entities.filter((e) => e.kind === "custom" && c.thing?.name.test(e.name)) : [];
      // Made, and with the right word for what it is: the card, and its type.
      const linked = made.length > 0;
      const typed = made.some((e) => c.thing?.about.test(e.type ?? ""));
      const builtIn = c.builtIn
        ? o.new_entities.some((e) => e.kind === c.builtIn?.kind && c.builtIn.name.test(e.name))
        : false;
      // The decision model sorts a thing the writer should not have named, so it is a cost, not a loss: counted apart.
      const extra = !c.thing && things.length > 0;
      const miss = [
        c.thing && found && !linked && `thing ${named[0]?.id} (${named[0]?.about}) made no card: ${o.items.map((i) => `${i.text.slice(0, 40)} → ${i.about.join(",")}`).join(" | ")}`,
        c.thing && !found && `no thing ${c.thing.name}: ${o.new_entities.map((e) => `${e.kind} ${e.name} (${e.about})`).join(", ") || "none"}`,
        c.builtIn && !builtIn && `no ${c.builtIn.kind} ${c.builtIn.name}: ${o.new_entities.map((e) => `${e.kind} ${e.name}`).join(", ") || "none"}`,
      ].filter(Boolean);
      return {
        miss: miss.length > 0 ? miss.join("; ") : null,
        tally: {
          ...(c.thing ? { thing_named: [found ? 1 : 0, 1] as [number, number], thing_made: [linked ? 1 : 0, 1] as [number, number], thing_typed: [typed ? 1 : 0, 1] as [number, number] } : {}),
          ...(c.builtIn ? { built_in_kept: [builtIn ? 1 : 0, 1] as [number, number] } : {}),
          ...(c.thing || c.builtIn ? {} : { no_extra_thing: [extra ? 0 : 1, 1] as [number, number] }),
        },
      };
    },
    text: c.text.slice(0, 60),
  }));
