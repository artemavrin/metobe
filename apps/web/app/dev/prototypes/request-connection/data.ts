import type { ChatMessage } from "@metobe/contracts/chat";
import type { ModelLabel } from "@metobe/core/chat";

import { SERVERS, type Server } from "../my-connections/data";

// P8 · «Подключите X, чтобы продолжить»: the model needs a per-user server the user has no account on. What the card
// has is what `request_connection` would really carry — the catalog item (title, logo, auth kind, header name, tool
// count) and the model's one line on why this answer needs it. One server per way of signing in.

export type Scenario = {
  server: Server;
  question: string;
  /** The model's line: what it needs the service for in this answer. */
  reason: string;
  /** The answer that carries on once the service is connected. */
  answer: string;
  /** The tool the answer calls first — shown as a step of the work. */
  tool: string;
};

const byId = (id: string) => {
  const s = SERVERS.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};

export const SCENARIOS: Scenario[] = [
  {
    answer:
      "На этапе «Согласование» у вас **4 сделки**, дольше недели стоят две:\n\n- «Поставка стеллажей, ООО Кедр» — 12 дней, 1 840 000 ₽\n- «Сервисный договор, АО Вега» — 9 дней, 420 000 ₽\n\nПо обеим последний комментарий — от юриста, ждут правок в договоре.",
    question: "Какие мои сделки зависли на этапе «Согласование»?",
    reason: "Сделки и их этапы лежат в Битрикс24 — нужен ваш вход, чтобы их посмотреть.",
    server: byId("bitrix"),
    tool: "crm_deal_list",
  },
  {
    answer:
      "Остаток по счёту 51 на 27 сентября — **3 412 580 ₽**. За неделю ушло 1,2 млн: основное — зарплата 25-го и аренда склада.",
    question: "Сколько денег на расчётном счёте на сегодня?",
    reason: "Остатки по счетам — в КАСКАДе, а у вас пока нет своего токена к нему.",
    server: byId("kaskad"),
    tool: "balance_get",
  },
  {
    answer:
      "Паллет с артикулом **СТ-1180** на складе 14, все в зоне B: 9 — в ячейках B-12…B-16, 5 — в приёмке, ещё не размещены.",
    question: "Сколько паллет СТ-1180 сейчас на складе?",
    reason: "Остатки по артикулам отдаёт «Склад» — нужен ваш ключ доступа к нему.",
    server: byId("stock"),
    tool: "stock_by_sku",
  },
  {
    answer:
      "В `sever-group/portal` открыто **3 пулл-реквеста** на вас: два ждут ревью больше двух дней — «Экспорт отчётов в XLSX» и «Фильтр по складам».",
    question: "Какие пулл-реквесты ждут моего ревью?",
    reason: "Пулл-реквесты — в GitHub, нужно войти, чтобы увидеть те, что ждут вас.",
    server: byId("github"),
    tool: "list_pull_requests",
  },
];

export const MODEL: ModelLabel = {
  id: "00000000-0000-4000-8000-000000000001",
  providerLogo: null,
  providerTitle: "Anthropic",
  title: "Claude Sonnet 5",
};

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

export const questionOf = (s: Scenario): ChatMessage => ({
  id: `q-${s.server.id}`,
  metadata: { createdAt: at(1) },
  parts: [{ text: s.question, type: "text" }],
  role: "user",
});

/** The answer before the card: it reasoned, found it needs the service, and waits. */
export const pausedOf = (s: Scenario): ChatMessage => ({
  id: `a-${s.server.id}`,
  metadata: { createdAt: at(1), modelId: MODEL.id, reasoningMs: 2100 },
  parts: [
    {
      state: "done",
      text: `Пользователь спрашивает о данных из ${s.server.title}. Личного подключения к нему нет — попрошу подключиться, потом продолжу.`,
      type: "reasoning",
    },
  ],
  role: "assistant",
});

/** The answer carried on: the words so far. */
export const carriedOf = (s: Scenario, words: number): ChatMessage => ({
  id: `c-${s.server.id}`,
  metadata: { createdAt: at(0), modelId: MODEL.id },
  parts: [{ text: s.answer.split(" ").slice(0, words).join(" "), type: "text" }],
  role: "assistant",
});
