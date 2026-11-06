import type { ChatMessage } from "@metobe/contracts/chat";

import type { ModelLabel } from "@metobe/core/chat";

// A long chat, neutral (docs/RELEASE.md, «Нейтральные примеры»): planning a spring newsletter over a dozen questions —
// the kind of chat that grows heavy. And the summary a service model would write of it, in D37's sections.

export const MODEL: ModelLabel = {
  id: "00000000-0000-4000-8000-000000000001",
  providerLogo: null,
  providerTitle: "DeepSeek",
  title: "DeepSeek V4.1 Flash",
};

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const THREAD: [string, string][] = [
  ["Составь план весенней рассылки для клиентов", "Три письма за две недели: анонс, подборка и напоминание. Ниже — темы, дни отправки и короткий текст каждого."],
  ["Какая открываемость была у прошлых рассылок?", "За 2026 год — 21–24 %. Лучше всего письма открывают во вторник с 9 до 11, хуже всего — в пятницу после обеда."],
  ["А какие темы писем сработали лучше?", "Короткие и с выгодой в первых словах: «Минус 15 % до пятницы» открыли на 4 пункта чаще, чем «Весенние новинки уже здесь»."],
  ["Сколько людей отписалось после серий писем?", "После третьего письма серии отписывается 1,2 %, после второго — 0,6 %. Четвёртое письмо удваивает отписки."],
  ["Сделай тексты всех трёх писем", "Готово: три письма на «вы», без восклицаний, по 90–120 слов. Главное — в первом абзаце, кнопка одна."],
  ["Сократи второе письмо вдвое", "Готово: 58 слов, подборка из трёх позиций вместо шести, кнопка «Смотреть подборку»."],
  ["Когда лучше отправлять каждое?", "Письмо 1 — вторник 18 марта, 9:30; письмо 2 — вторник 25 марта, 9:30; напоминание — вторник 1 апреля, 10:00."],
  ["Сведи всё в одну таблицу", "Таблица ниже: письмо, тема, дата и время, сегмент, кто отвечает. Итого три письма на 4 200 адресов."],
];

/** The chat as stored: the questions and the answers, oldest first. */
export const HISTORY: ChatMessage[] = THREAD.flatMap(([q, a], i) => [
  { id: `q${i}`, metadata: { createdAt: at(400 - i * 40) }, parts: [{ text: q, type: "text" }], role: "user" },
  {
    id: `a${i}`,
    metadata: { createdAt: at(398 - i * 40), modelId: MODEL.id },
    parts: [{ text: a, type: "text" }],
    role: "assistant",
  },
]);

/** What is asked after the chat was compacted: the model answers from the summary. */
export const AFTER: ChatMessage[] = [
  { id: "q-after", metadata: { createdAt: at(3) }, parts: [{ text: "Напомни, когда уходит второе письмо и какая у него тема?", type: "text" }], role: "user" },
  {
    id: "a-after",
    metadata: { createdAt: at(2), modelId: MODEL.id },
    parts: [{ text: "Во вторник, 25 марта, в 9:30. Тема — «Три вещи на весну: подборка до пятницы»; текст сокращён до 58 слов.", type: "text" }],
    role: "assistant",
  },
];

/** What the last answer cost, as the hint says it — by the run's input tokens a step, after the earlier results go. */
export const WEIGHT = { stepTokens: 68_000, tokensBefore: 412_000, tokensAfter: 3_100 };

/** The summary, in D37's sections; markdown as the product would store it. */
export const SUMMARY = `**Цель.** Подготовить весеннюю рассылку для клиентов: три письма за две недели.

**Что выяснили.**
- Открываемость прошлых рассылок за 2026 год — 21–24 %; лучше всего во вторник с 9 до 11.
- Темы с выгодой в первых словах открывают на 4 пункта чаще.
- Отписки: 0,6 % после второго письма, 1,2 % после третьего; четвёртое письмо их удваивает.

**Договорились.**
- Письмо 1 — 18 марта, 9:30; письмо 2 — 25 марта, 9:30, тема «Три вещи на весну: подборка до пятницы»; напоминание — 1 апреля, 10:00.
- Тексты на «вы», без восклицаний; второе письмо — 58 слов, подборка из трёх позиций.
- Адресов — 4 200, сводная таблица собрана.

**Как отвечать.** Коротко; сводное — таблицей.

**Открыто.** Утвердить картинку к первому письму.`;
