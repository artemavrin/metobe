import type { ChatMessage } from "@metobe/contracts/chat";
import type { ModelLabel } from "@metobe/core/chat";

// «Модель спрашивает»: the answer needs something only the user knows, so the model stops and asks — a client tool
// (`ask_user`, no `execute`) whose input is the questions and whose output is what the user picked, sent back with
// `addToolOutput`, as `request_connection` already is. What a card has is what that input would really carry: 1–3
// questions, each with its choices, one or several to pick, and whether a written answer is welcome.

export type Choice = { value: string; label: string; description?: string };

export type Question = {
  name: string;
  /** The chip over the question, as Claude's `header`: a word or two, ≤ 12 characters. */
  header: string;
  prompt: string;
  choices: Choice[];
  /** Several may be picked. */
  multiple?: boolean;
  /** A written answer is welcome — the placeholder of its field. */
  other?: string;
  /** May be left unanswered. */
  optional?: boolean;
};

/** What the user said to each question, as words: picked labels and the written answer. Empty — skipped. */
export type Answers = Record<string, string[]>;

export type Scenario = {
  id: string;
  /** The knob's name. */
  knob: string;
  ask: string;
  /** The model's one line before the question: why it asks. */
  lead: string;
  questions: Question[];
  /** The answer that carries on once asked. */
  answerOf: (a: Answers) => string;
  /** The answer when the user would not say: the model goes on with its best guess and says which. */
  guess: string;
};

const join = (xs: string[]) => xs.map((x) => x.toLowerCase()).join(", ");

export const SCENARIOS: Scenario[] = [
  {
    answerOf: (a) =>
      `Считаю за ${a.period?.[0] ?? "III квартал"}.\n\nВыручка — **48,2 млн ₽**, на 12% больше, чем кварталом раньше. Больше всего дал опт: 31,5 млн. Розница просела на 4% — в основном август.`,
    ask: "Собери отчёт по продажам за квартал",
    guess:
      "Беру III квартал — он закрыт, данные полные.\n\nВыручка — **48,2 млн ₽**, на 12% больше, чем кварталом раньше. Если нужен текущий — скажите.",
    id: "one",
    knob: "один вопрос",
    lead: "Уточню период, чтобы не считать лишнего.",
    questions: [
      {
        choices: [
          { description: "Закрыт, данные полные", label: "III квартал", value: "q3" },
          { description: "Идёт сейчас, данные до сегодня", label: "IV квартал", value: "q4" },
        ],
        header: "Квартал",
        name: "period",
        other: "Другой период…",
        prompt: "За какой квартал?",
      },
    ],
  },
  {
    answerOf: (a) =>
      `Черновик для групп: ${join(a.to ?? [])}.\n\n**Тема:** Склад переезжает 1 декабря\n\nЗдравствуйте! С 1 декабря отгрузки идут с нового склада. Сроки доставки не меняются, адрес самовывоза пришлём отдельным письмом за неделю.`,
    ask: "Напиши письмо клиентам о переезде склада",
    guess:
      "Пишу оптовым клиентам — переезд их касается сильнее всех.\n\n**Тема:** Склад переезжает 1 декабря\n\nЗдравствуйте! С 1 декабря отгрузки идут с нового склада…",
    id: "many",
    knob: "несколько",
    lead: "Тон и детали у разных групп разные — уточню, кому пишем.",
    questions: [
      {
        choices: [
          { description: "38 адресов", label: "Оптовые клиенты", value: "opt" },
          { description: "12 адресов", label: "Розничные точки", value: "retail" },
          { description: "21 адрес", label: "Поставщики", value: "vendors" },
        ],
        header: "Кому",
        multiple: true,
        name: "to",
        prompt: "Кому отправляем?",
      },
    ],
  },
  {
    answerOf: (a) => {
      const by = a.by?.[0];
      return `Строю выручку за ${(a.period?.[0] ?? "год").toLowerCase()}${by && by !== "Без разбивки" ? `, ${by.toLowerCase()}` : ""}.\n\nРост ровный, без провалов: с 13,1 млн в январе до 17,9 млн в октябре. Пик — сентябрь, 18,4 млн.`;
    },
    ask: "Построй график выручки",
    guess: "Строю выручку за последние 12 месяцев, без разбивки.\n\nРост ровный: с 13,1 млн в январе до 17,9 млн в октябре.",
    id: "two",
    knob: "два вопроса",
    lead: "Пара вопросов, чтобы график ответил на нужное.",
    questions: [
      {
        choices: [
          { label: "Год", value: "year" },
          { label: "Квартал", value: "quarter" },
          { label: "Месяц", value: "month" },
        ],
        header: "Период",
        name: "period",
        prompt: "За какой период?",
      },
      {
        choices: [
          { label: "По менеджерам", value: "managers" },
          { label: "По складам", value: "stores" },
          { label: "Без разбивки", value: "none" },
        ],
        header: "Разбивка",
        name: "by",
        optional: true,
        prompt: "Разбить по…",
      },
    ],
  },
];

/** A form's values as words: a choice's value becomes its label, anything else is the written answer. */
export const answersOf = (s: Scenario, form: FormData): Answers =>
  Object.fromEntries(
    s.questions.map((q) => [
      q.name,
      form
        .getAll(q.name)
        .map((v) => String(v).trim())
        .filter(Boolean)
        .map((v) => q.choices.find((c) => c.value === v)?.label ?? v),
    ])
  );

export const MODEL: ModelLabel = {
  id: "00000000-0000-4000-8000-000000000001",
  providerLogo: null,
  providerTitle: "Anthropic",
  title: "Claude Sonnet 5",
};

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

export const askOf = (s: Scenario): ChatMessage => ({
  id: `q-${s.id}`,
  metadata: { createdAt: at(1) },
  parts: [{ text: s.ask, type: "text" }],
  role: "user",
});

/** The answer before the card: it reasoned, found it lacks one thing, and says why it asks. */
export const pausedOf = (s: Scenario, text: string = s.lead): ChatMessage => ({
  id: `a-${s.id}`,
  metadata: { createdAt: at(1), modelId: MODEL.id, reasoningMs: 1400 },
  parts: [
    { state: "done", text: "Задача допускает несколько прочтений — спрошу, а не угадаю.", type: "reasoning" },
    { text, type: "text" },
  ],
  role: "assistant",
});

/** The answer carried on: the words so far. */
export const carriedOf = (s: Scenario, text: string, words: number): ChatMessage => ({
  id: `c-${s.id}`,
  metadata: { createdAt: at(0), modelId: MODEL.id },
  parts: [{ text: text.split(" ").slice(0, words).join(" "), type: "text" }],
  role: "assistant",
});

/** The user's reply as words, for a bubble or a folded card. */
export const replyOf = (s: Scenario, a: Answers) =>
  s.questions
    .map((q) => a[q.name] ?? [])
    .filter((xs) => xs.length > 0)
    .map((xs) => xs.join(", "))
    .join(" · ");
