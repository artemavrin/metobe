import { describe, expect, it } from "vitest";

import { taskLetter } from "./task-letter";
import type { TaskLetterProps } from "./task-letter";

const letter: TaskLetterProps = {
  blocks: [
    { text: "Изменились цены у двух товаров:", type: "p" },
    {
      head: ["Товар", "Было", "Стало"],
      right: [1, 2],
      rows: [
        ["Кофемашина капсульная", "24 990 ₽", "22 490 ₽"],
        ["Фильтр-кувшин", "1 290 ₽", "1 390 ₽"],
      ],
      type: "table",
    },
  ],
  button: {
    href: "https://metobe.example.ru/tasks/prices",
    label: "Открыть задачу",
  },
  heading: "Цены изменились у 2 товаров из 16",
  kind: "result",
  label: "Новый итог",
  locale: "ru",
  off: {
    href: "https://metobe.example.ru/tasks/prices?notify=off",
    label: "Отключить для этой задачи",
  },
  preview: "Кофемашина капсульная подешевела на 10 %.",
  task: {
    color: "#4a3aa7",
    meta: "По понедельникам в 10:00 · запуск пн, 30 ноя, 10:00",
    name: "Цены конкурентов",
  },
  why: "Письмо пришло, потому что для задачи «Цены конкурентов» включены уведомления на почту.",
};

describe("a letter from a task", () => {
  it("holds the task, what happened, the result and the button", async () => {
    const { html } = await taskLetter(letter);
    expect(html).toContain('lang="ru"');
    expect(html).toContain(letter.task.name);
    expect(html).toContain(letter.heading);
    expect(html).toContain("Кофемашина капсульная");
    expect(html).toContain(`href="${letter.button.href}"`);
    expect(html).toContain(`href="${letter.off.href}"`);
  });

  it("gives the result, the button's link and the way to turn it off in the text part", async () => {
    const { text } = await taskLetter(letter);
    expect(text.startsWith("Metobe")).toBe(true);
    expect(text).toContain(letter.heading);
    expect(text).toContain("22 490 ₽");
    expect(text).toContain(letter.button.href);
    expect(text).toContain(letter.off.href);
  });

  it("draws key figures when the result was a widget", async () => {
    const { html } = await taskLetter({
      ...letter,
      blocks: [
        {
          items: [
            {
              change: "+6,7 % к прошлой неделе",
              label: "Выручка",
              value: "4,8 млн ₽",
            },
          ],
          type: "figures",
        },
      ],
      more: "Графики — в Metobe.",
    });
    expect(html).toContain("4,8 млн ₽");
    expect(html).toContain("+6,7 % к прошлой неделе");
    expect(html).toContain("Графики — в Metobe.");
  });
});
