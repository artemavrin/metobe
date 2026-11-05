// Одна задача после создания и её запуски. Задача та же, что в /first-agent: «Цены конкурентов», по понедельникам в 10:00,
// поиском и чтением страниц двух сайтов. Что пришло из последнего запуска — ручка прототипа: первый запуск (сравнивать
// не с чем), изменения, «нового нет», сбой. Перед последним — запуски, которые были до него.

export type Outcome = "baseline" | "changes" | "quiet" | "failed";

export interface Run {
  id: string;
  /** Когда: «пн, 30 ноя, 10:00». */
  at: string;
  /** Короткий день для свёрнутых строк: «30 ноя». */
  day: string;
  took: string;
  outcome: Outcome;
  /** Итог одной строкой — то, что видно, не раскрывая. */
  summary: string;
  /** Итог целиком, markdown. У «нового нет» его нет: сказать нечего. */
  text?: string;
}

export const TASK = {
  color: "var(--chart-7)",
  created: "3 ноя",
  name: "Цены конкурентов",
  schedule: "По понедельникам в 10:00",
  sites: "shop-one.ru, shop-two.ru",
  tools: ["Поиск в интернете", "Чтение страниц"],
  /** Что человек написал, когда задачу настраивали. */
  asked: "Проверяй цены у конкурентов на их сайтах и пиши, если что-то изменилось",
};

/** Остальные задачи в боковой панели: у одной есть итог, который ещё не открывали. */
export const OTHER_TASKS = [{ color: "var(--chart-2)", name: "Письма, которым нужен ответ", unread: true }];

const RUN: Record<Outcome, Omit<Run, "id" | "at" | "day">> = {
  baseline: {
    outcome: "baseline",
    summary: "Запомнил цены 16 товаров — сравнивать начну со следующего раза",
    text:
      "Первый запуск — сравнивать пока не с чем. Запомнил текущие цены **16 товаров**: 9 на shop-one.ru и 7 на shop-two.ru.\n\n" +
      "Со следующего запуска пишу, только если что-то изменится.",
    took: "2 мин 10 с",
  },
  changes: {
    outcome: "changes",
    summary: "Цены изменились у 2 товаров из 16",
    text:
      "Изменились цены у двух товаров:\n\n" +
      "| Товар | Сайт | Было | Стало |\n| --- | --- | ---: | ---: |\n" +
      "| Кофемашина капсульная | shop-one.ru | 24 990 ₽ | 22 490 ₽ (−10 %) |\n" +
      "| Фильтр-кувшин | shop-two.ru | 1 290 ₽ | 1 390 ₽ (+8 %) |\n\n" +
      "Остальные 14 — без изменений.",
    took: "1 мин 40 с",
  },
  failed: {
    outcome: "failed",
    summary: "shop-two.ru не открылся — проверил только shop-one.ru",
    text:
      "**shop-two.ru не ответил** — три попытки, ошибка 503, поэтому его 7 товаров не проверены. На shop-one.ru все 9 цен прежние.\n\n" +
      "Попробую снова в следующий запуск, или прогоните сейчас.",
    took: "3 мин 05 с",
  },
  quiet: { outcome: "quiet", summary: "Нового нет: цены 16 товаров прежние", took: "1 мин 35 с" },
};

const DAYS = [
  ["пн, 9 ноя, 10:00", "9 ноя"],
  ["пн, 16 ноя, 10:00", "16 ноя"],
  ["пн, 23 ноя, 10:00", "23 ноя"],
  ["пн, 30 ноя, 10:00", "30 ноя"],
] as const;
const NEXT = ["пн, 16 ноя, 10:00", "пн, 7 дек, 10:00"] as const;

/** Последний запуск — `last`; «первый» — он же единственный. */
export const runsFor = (last: Outcome): { runs: Run[]; next: string } => {
  const plan: Outcome[] =
    last === "baseline" ? ["baseline"] : last === "failed" ? ["baseline", "quiet", "changes", "failed"] : ["baseline", "quiet", "quiet", last];
  return {
    next: last === "baseline" ? NEXT[0] : NEXT[1],
    runs: plan.map((o, i) => ({ ...RUN[o], at: DAYS[i]?.[0] ?? "", day: DAYS[i]?.[1] ?? "", id: `run-${i}` })),
  };
};

export const LAST: { id: Outcome; label: string }[] = [
  { id: "baseline", label: "первый" },
  { id: "changes", label: "изменения" },
  { id: "quiet", label: "нового нет" },
  { id: "failed", label: "сбой" },
];
