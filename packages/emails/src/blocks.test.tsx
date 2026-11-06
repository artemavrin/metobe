import { describe, expect, it } from "vitest";

import type { LetterBlock } from "./blocks";
import { taskLetter } from "./task-letter";

// Every kind of block in one letter: it renders, and what each carries reaches the text part — a client that shows
// only text still gets the figures, not empty bars.
const blocks: LetterBlock[] = [
  {
    runs: [
      { text: "Главная: тарифы растут на " },
      { b: true, text: "8–12 %" },
      { href: "https://example.ru/t", text: " подробнее" },
    ],
    type: "p",
  },
  { text: "Тарифы доставки", type: "heading" },
  {
    items: [
      {
        strong: "Посылки",
        sub: ["по России: +8 %"],
        text: "дорожают меньше всего",
      },
    ],
    ordered: true,
    type: "list",
  },
  { text: "Цитата ассоциации", type: "quote" },
  { text: "cargo_class: standard", type: "code" },
  { type: "hr" },
  {
    head: ["Товар", "Остаток"],
    more: "Ещё 40 строк — в Metobe.",
    right: [1],
    rows: [["Кабель", "46 шт."]],
    total: ["Итого", "46 шт."],
    type: "table",
  },
  { items: [{ label: "Сделок", value: "34" }], type: "figures" },
  {
    bars: [0.5, 1],
    change: "+6,7 %",
    from: "5 окт",
    label: "Выручка",
    to: "23 ноя",
    tone: "good",
    type: "trend",
    value: "4,8 млн ₽",
  },
  {
    caption: "план — 20 млн ₽",
    label: "План месяца",
    pct: 0.82,
    type: "progress",
    value: "82 %",
  },
  {
    cells: [{ label: "Мин.", value: "12 тыс. ₽" }],
    label: "Сумма сделки",
    type: "range",
  },
  {
    items: [{ label: "Медиана", value: "88 тыс. ₽" }],
    label: "Сводка",
    type: "facts",
  },
  {
    items: [{ name: "Альфа-Опт", pct: 1, value: "21 млн ₽" }],
    label: "Клиенты",
    type: "bars",
  },
  {
    down: [{ name: "Орион", value: "−20 %" }],
    label: "Кто вырос и упал",
    type: "movers",
    up: [{ name: "Берёзка", value: "+34 %" }],
  },
  {
    items: [{ name: "Опт", pct: 0.55, value: "26,4 млн ₽" }],
    label: "Состав",
    type: "stack",
  },
  {
    bars: [0.4, 1],
    from: "янв",
    label: "Выручка по месяцам",
    to: "ноя",
    type: "columns",
    value: "18,6 млн ₽",
  },
  { text: "График — в Metobe.", type: "more" },
];

const letter = {
  blocks,
  button: {
    href: "https://metobe.example.ru/tasks/x",
    label: "Открыть задачу",
  },
  heading: "Все блоки",
  kind: "result" as const,
  label: "Новый итог",
  locale: "ru",
  off: {
    href: "https://metobe.example.ru/tasks/x?notify=off",
    label: "Отключить для этой задачи",
  },
  preview: "Все блоки.",
  task: {
    color: "#2a78d6",
    meta: "Каждый день в 9:00",
    name: "Проверка блоков",
  },
  why: "Письмо пришло, потому что включены уведомления на почту.",
};

describe("the blocks a result is made of", () => {
  it("all render in one letter", async () => {
    const { html } = await taskLetter(letter);
    for (const s of [
      "8–12 %",
      "Тарифы доставки",
      "cargo_class",
      "Итого",
      "4,8 млн ₽",
      "82 %",
      "12 тыс. ₽",
      "88 тыс. ₽",
      "21 млн ₽",
      "−20 %",
      "26,4 млн ₽",
      "18,6 млн ₽",
      "График — в Metobe.",
    ]) {
      expect(html).toContain(s);
    }
  });

  it("keep their figures in the text part", async () => {
    const { text } = await taskLetter(letter);
    for (const s of [
      "8–12 %",
      "46 шт.",
      "Ещё 40 строк",
      "+6,7 %",
      "82 %",
      "Альфа-Опт",
      "21 млн ₽",
      "Берёзка",
      "+34 %",
      "26,4 млн ₽",
      "18,6 млн ₽",
    ]) {
      expect(text).toContain(s);
    }
  });
});
