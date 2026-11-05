import type { Outcome, Run } from "../task-results/data";
import { TASKS } from "../task-results/data";

// Список задач (P13): у человека три или семь задач в разных состояниях — новый итог, сбой, нового нет, выключена.
// Три первые — те же, что в /task-results и /task-edit, и открываются там; остальные только в списке. Сейчас — пн,
// 30 ноя, около 10:30. Тексты сухие: что было в последнем запуске и когда следующий.

export interface Item {
  id: string;
  name: string;
  color: string;
  schedule: string;
  /** Следующий запуск; у выключенной — нет. */
  next?: string;
  /** Последний запуск: итог одной строкой, ответ целиком (`parts`) и что сделать после сбоя (`fix`). */
  last: { day: string; outcome: Outcome; summary: string; parts?: Run["parts"]; fix?: string; id?: string };
  /** Итог запуска, который пройдёт после исправления сбоя. */
  fixed?: string;
  /** Итог, который ещё не открывали. */
  unread?: boolean;
  enabled: boolean;
  /** Страница задачи, если она есть в прототипах. */
  href?: string;
}

const fromTask = (id: string, unread = false): Item => {
  const t = TASKS.find((x) => x.id === id);
  if (!t) throw new Error(id);
  const r = t.runs[0];
  return {
    color: t.color,
    enabled: true,
    href: `/dev/prototypes/task-edit?v=3&task=${id}`,
    id,
    last: { day: r?.day ?? "", fix: r?.fix, id: r?.id, outcome: r?.outcome ?? "quiet", parts: r?.parts, summary: r?.summary ?? "" },
    name: t.name,
    next: t.next,
    schedule: t.schedule,
    unread,
    ...(id === "mail" && { fixed: "Ответа ждут 2 письма" }),
  };
};

const MORE: Item[] = [
  {
    color: "var(--chart-3)",
    enabled: true,
    id: "reviews",
    last: {
      day: "29 ноя",
      id: "rv1",
      outcome: "news",
      parts: [
        {
          text:
            "Два новых отзыва:\n\n" +
            "1. «Привезли на день раньше, всё целое» — 5 из 5, Яндекс Карты.\n" +
            "2. «Удобно оформлять заказ на сайте» — 5 из 5, 2ГИС.",
          type: "text",
        },
      ],
      summary: "2 новых отзыва, оба положительные",
    },
    name: "Отзывы о компании",
    next: "сегодня, 18:00",
    schedule: "Каждый день в 18:00",
    unread: true,
  },
  {
    color: "var(--chart-5)",
    enabled: true,
    id: "rates",
    last: { day: "30 ноя", outcome: "quiet", summary: "Курс изменился меньше чем на 1 %" },
    name: "Курс валют для прайса",
    next: "вт, 1 дек, 8:30",
    schedule: "По будням в 8:30",
  },
  {
    color: "var(--chart-6)",
    enabled: true,
    id: "news",
    last: { day: "30 ноя", outcome: "news", summary: "5 новостей, одна — об изменении тарифов доставки" },
    name: "Новости отрасли",
    next: "пн, 7 дек, 8:00",
    schedule: "По понедельникам в 8:00",
  },
  {
    color: "var(--chart-8)",
    enabled: false,
    id: "tracker",
    last: { day: "27 ноя", outcome: "news", summary: "4 задачи без исполнителя" },
    name: "Задачи без исполнителя",
    schedule: "По пятницам в 17:00",
  },
];

export const LISTS: Record<"0" | "3" | "7", Item[]> = {
  "0": [],
  "3": [fromTask("prices", true), fromTask("mail"), fromTask("sales")],
  "7": [fromTask("prices", true), fromTask("mail"), fromTask("sales"), ...MORE],
};

/** Порядок в списке: включённые по ближайшему запуску, выключенные — в конце. */
const ORDER = ["reviews", "rates", "mail", "news", "sales", "prices", "tracker"];
export const sorted = (items: Item[]) => [...items].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

/** Следующий запуск словами — от «сейчас» прототипа (пн, 30 ноя): «сегодня в 18:00», «завтра в 8:30», «пн, 7 дек в 8:00». */
export const when = (next: string) =>
  next.replace(/^сегодня, /u, "сегодня в ").replace(/^вт, 1 дек, /u, "завтра в ").replace(/, (\d{1,2}:\d{2})$/u, " в $1");

/** Номер дня итога («30 ноя» → 30): новые итоги идут от свежего к старому. Все даты прототипа — в ноябре. */
export const dayOf = (day: string) => Number.parseInt(day, 10) || 0;
