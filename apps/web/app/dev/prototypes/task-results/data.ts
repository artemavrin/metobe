import type { ChatMessage } from "@metobe/contracts/chat";

import { MODEL } from "../first-agent/data";

// Три задачи с разными итогами — чтобы было видно, что итог запуска — это обычный ответ модели, как в чате: текст,
// таблица, список, виджет показателей. Отличается он только тем, что пришёл сам, по расписанию: у него дата, исход
// и сколько шёл запуск. Запуски — от нового к старому: свежий сверху, история ниже. Числа выдуманы для вида.

export type Outcome = "baseline" | "news" | "quiet" | "failed";

export interface Run {
  id: string;
  /** «пн, 30 ноя, 10:00». */
  at: string;
  /** «30 ноя» — для строк журнала. */
  day: string;
  took: string;
  outcome: Outcome;
  /** Итог одной строкой: для журнала и для уведомления. */
  summary: string;
  /** Ответ модели целиком. У «нового нет» его нет. */
  parts?: ChatMessage["parts"];
  /** Что сделать человеку после сбоя. */
  fix?: string;
}

export interface Task {
  id: string;
  name: string;
  color: string;
  schedule: string;
  next: string;
  created: string;
  /** Что человек написал, когда задачу настраивали. */
  asked: string;
  /** Новый итог, который ещё не открывали. */
  unread?: boolean;
  /** От нового к старому. */
  runs: Run[];
}

const text = (t: string): ChatMessage["parts"] => [{ text: t, type: "text" }];

// ── Цены конкурентов: таблица «было → стало», пустые запуски молчат ───────────────────────────────────────────────

const prices: Task = {
  asked: "Проверяй цены у конкурентов на их сайтах и пиши, если что-то изменилось",
  color: "var(--chart-7)",
  created: "3 ноя",
  id: "prices",
  name: "Цены конкурентов",
  next: "пн, 7 дек, 10:00",
  runs: [
    {
      at: "пн, 30 ноя, 10:00",
      day: "30 ноя",
      id: "p4",
      outcome: "news",
      parts: text(
        "Изменились цены у двух товаров:\n\n" +
          "| Товар | Сайт | Было | Стало |\n| --- | --- | ---: | ---: |\n" +
          "| Кофемашина капсульная | shop-one.ru | 24 990 ₽ | 22 490 ₽ (−10 %) |\n" +
          "| Фильтр-кувшин | shop-two.ru | 1 290 ₽ | 1 390 ₽ (+8 %) |\n\n" +
          "Остальные 14 — без изменений."
      ),
      summary: "Цены изменились у 2 товаров из 16",
      took: "1 мин 40 с",
    },
    { at: "пн, 23 ноя, 10:00", day: "23 ноя", id: "p3", outcome: "quiet", summary: "Цены 16 товаров не изменились", took: "1 мин 35 с" },
    { at: "пн, 16 ноя, 10:00", day: "16 ноя", id: "p2", outcome: "quiet", summary: "Цены 16 товаров не изменились", took: "1 мин 31 с" },
    {
      at: "пн, 9 ноя, 10:00",
      day: "9 ноя",
      id: "p1",
      outcome: "baseline",
      parts: text(
        "Первый запуск, сравнивать не с чем. Сохранены текущие цены **16 товаров**: 9 на shop-one.ru и 7 на shop-two.ru.\n\n" +
          "Дальше итог будет только при изменении цен."
      ),
      summary: "Сохранены цены 16 товаров для сравнения",
      took: "2 мин 10 с",
    },
  ],
  schedule: "По понедельникам в 10:00",
};

// ── Письма: список, по будням; последний запуск упал — вход в почту устарел ────────────────────────────────────────

const mail: Task = {
  asked: "По будням в 9 смотри почту и присылай письма, которым нужен мой ответ",
  color: "var(--chart-2)",
  created: "24 ноя",
  id: "mail",
  name: "Письма, которым нужен ответ",
  next: "вт, 1 дек, 9:00",
  runs: [
    {
      at: "пн, 30 ноя, 9:00",
      day: "30 ноя",
      fix: "Войти в почту",
      id: "m5",
      outcome: "failed",
      parts: text("**Нет доступа к почте:** срок входа истёк. Письма за 28–30 ноября не проверены.\n\nПосле входа запуск повторится."),
      summary: "Нет доступа к почте: срок входа истёк",
      took: "4 с",
    },
    {
      at: "пт, 27 ноя, 9:00",
      day: "27 ноя",
      id: "m4",
      outcome: "news",
      parts: text(
        "Ответа ждут три письма:\n\n" +
          "1. **Поставщик упаковки** — «Счёт за октябрь»: просит подтвердить сумму до пятницы.\n" +
          "2. **Клиент с сайта** — спрашивает, успеете ли доставить в Казань к 5 декабря.\n" +
          "3. **Бухгалтерия** — нужен подписанный акт сверки за квартал.\n\n" +
          "Ещё 11 писем — рассылки и уведомления, ответа не требуют."
      ),
      summary: "3 письма ждут ответа",
      took: "48 с",
    },
    { at: "чт, 26 ноя, 9:00", day: "26 ноя", id: "m3", outcome: "quiet", summary: "Писем, которым нужен ответ, нет", took: "31 с" },
    {
      at: "ср, 25 ноя, 9:00",
      day: "25 ноя",
      id: "m2",
      outcome: "news",
      parts: text("Ответа ждёт одно письмо:\n\n1. **Партнёр по выставке** — просит подтвердить участие и размер стенда до 1 декабря."),
      summary: "1 письмо ждёт ответа",
      took: "39 с",
    },
    { at: "вт, 24 ноя, 9:00", day: "24 ноя", id: "m1", outcome: "quiet", summary: "Писем, которым нужен ответ, нет", took: "27 с" },
  ],
  schedule: "По будням в 9:00",
  unread: true,
};

// ── Продажи за неделю: отчёт с виджетом показателей, пишет всегда ──────────────────────────────────────────────────

const WEEKS = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"];
const REVENUE = [3.9, 4.2, 4.0, 4.4, 4.1, 4.6, 4.5, 4.8].map((m) => Math.round(m * 1_000_000));

const metrics = (weeks: number) => {
  const series = WEEKS.slice(0, weeks).map((x, i) => ({ value: REVENUE[i] ?? 0, x }));
  const cur = series[series.length - 1]?.value ?? 0, prev = series[series.length - 2]?.value ?? 0;
  return {
    input: {
      items: [
        { field: "Сумма", form: "trend", label: "Выручка за неделю", unit: "₽", x: "Дата" },
        { field: "Сделка", form: "value", label: "Закрытых сделок" },
        { by: "Направление", field: "Сумма", form: "ranking", label: "Направления по выручке", unit: "₽" },
      ],
      title: "Продажи за неделю",
    },
    output: {
      items: [
        {
          aggregate: "sum",
          bucket: "week",
          delta: { change: Math.round(((cur - prev) / prev) * 1000) / 10, current: cur, from: WEEKS[weeks - 2] ?? "", good: "up", previous: prev, to: WEEKS[weeks - 1] ?? "" },
          field: "Сумма",
          form: "trend",
          label: "Выручка за неделю",
          series,
          unit: "₽",
          value: cur,
        },
        { aggregate: "count", field: "Сделка", form: "value", label: "Закрытых сделок", value: weeks === 8 ? 34 : 29 },
        {
          by: "Направление",
          field: "Сумма",
          form: "ranking",
          items: [
            { name: "Опт", value: Math.round(cur * 0.55) },
            { name: "Розница", value: Math.round(cur * 0.3) },
            { name: "Интернет-магазин", value: Math.round(cur * 0.15) },
          ],
          label: "Направления по выручке",
          unit: "₽",
          whole: cur,
        },
      ],
      rows: weeks === 8 ? 412 : 377,
    },
    state: "output-available",
    toolCallId: `metrics-${weeks}`,
    type: "tool-show_metrics",
  } as unknown as ChatMessage["parts"][number];
};

const sales: Task = {
  asked: "Каждый понедельник утром присылай сводку продаж за прошлую неделю из CRM",
  color: "var(--chart-4)",
  created: "10 ноя",
  id: "sales",
  name: "Продажи за неделю",
  next: "пн, 7 дек, 9:00",
  runs: [
    {
      at: "пн, 30 ноя, 9:00",
      day: "30 ноя",
      id: "s3",
      outcome: "news",
      parts: [
        ...text("Неделя 23–29 ноября: выручка **4,8 млн ₽**, на 6,7 % больше прошлой недели. Больше половины — опт; закрыто 34 сделки."),
        metrics(8),
      ],
      summary: "Выручка 4,8 млн ₽, +6,7 % к прошлой неделе",
      took: "22 с",
    },
    {
      at: "пн, 23 ноя, 9:00",
      day: "23 ноя",
      id: "s2",
      outcome: "news",
      parts: [...text("Неделя 16–22 ноября: выручка **4,5 млн ₽**, на 2 % меньше прошлой. Закрыто 29 сделок."), metrics(7)],
      summary: "Выручка 4,5 млн ₽, −2 % к прошлой неделе",
      took: "25 с",
    },
    {
      at: "пн, 16 ноя, 9:00",
      day: "16 ноя",
      fix: "Прогнать сейчас",
      id: "s1",
      outcome: "failed",
      parts: text("**CRM недоступна:** 3 попытки за 5 минут без ответа. Сводка за 9–15 ноября не собрана.\n\nСледующий запуск — пн, 23 ноя, 9:00."),
      summary: "CRM недоступна: сводка не собрана",
      took: "5 мин 02 с",
    },
  ],
  schedule: "По понедельникам в 9:00",
};

export const TASKS: Task[] = [prices, mail, sales];

export const asMessage = (run: Run): ChatMessage => ({
  id: run.id,
  metadata: { createdAt: "2026-11-30T07:00:00Z", modelId: MODEL.id },
  parts: run.parts ?? [],
  role: "assistant",
});
