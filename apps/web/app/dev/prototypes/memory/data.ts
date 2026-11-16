// Память и план на день (D39, P16–P17): что Metobe помнит о работе одного человека. Сегодня — понедельник,
// 9 ноября 2026. Люди и организации вымышленные, такие же, как в наборе S13.

export type EntityKind = "person" | "org" | "project";

export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  /** Короткая строка под именем — последний факт о роли. */
  role: string;
}

export const ENTITIES: Entity[] = [
  { id: "olga", kind: "person", name: "Ольга Ли", role: "Менеджер по работе с клиентами, «Альфа-Логистика»" },
  { id: "andrey", kind: "person", name: "Андрей Смирнов", role: "Разработчик в вашей команде" },
  { id: "marina", kind: "person", name: "Марина Орлова", role: "Дизайнер в вашей команде" },
  { id: "igor", kind: "person", name: "Игорь Белов", role: "Руководитель отдела продаж" },
  { id: "kovalev", kind: "person", name: "Андрей Ковалёв", role: "Менеджер по закупкам, ООО «Вектор»" },
  { id: "svetlana", kind: "person", name: "Светлана Петровна", role: "Главный бухгалтер" },
  { id: "vector", kind: "org", name: "ООО «Вектор»", role: "Поставщик оборудования" },
  { id: "alfa", kind: "org", name: "«Альфа-Логистика»", role: "Перевозчик" },
  { id: "pack", kind: "org", name: "Поставщик упаковки", role: "Без названия" },
  { id: "sklad", kind: "project", name: "«Склад 2.0»", role: "Этап — тестирование" },
];

export const entity = (id: string) => ENTITIES.find((e) => e.id === id) as Entity;

/** Откуда запись: чат и день, когда её занесли. */
export interface Source {
  chat: string;
  said: string;
  recorded: string;
}

export interface Commitment {
  id: string;
  /** Кто должен и кому; `me` — сам человек. */
  debtor: string;
  creditor: string;
  what: string;
  given: string;
  due?: string;
  status: "open" | "done";
  source: Source;
}

export const COMMITMENTS: Commitment[] = [
  { creditor: "me", debtor: "olga", given: "28 окт", id: "c-olga", source: { chat: "Договор с перевозчиком", recorded: "28 окт", said: "Ольга обещала прислать подписанный договор на этой неделе" }, status: "open", what: "Прислать подписанный договор" },
  { creditor: "me", debtor: "vector", given: "3 ноя", id: "c-vector", source: { chat: "Закупка оборудования", recorded: "3 ноя", said: "Отправили «Вектору» коммерческое предложение, ждём ответа" }, status: "open", what: "Ответить на коммерческое предложение" },
  { creditor: "marina", debtor: "me", due: "ср, 11 ноя", given: "6 ноя", id: "c-marina", source: { chat: "Презентация для клиента", recorded: "6 ноя", said: "Я обещал Марине прислать отзыв на её презентацию до среды" }, status: "open", what: "Отзыв на презентацию" },
  { creditor: "me", debtor: "andrey", due: "пт, 13 ноя", given: "5 ноя", id: "c-andrey", source: { chat: "Планёрка", recorded: "5 ноя", said: "Андрей пообещал закончить API к пятнице" }, status: "open", what: "Закончить API для «Склада 2.0»" },
  { creditor: "me", debtor: "kovalev", due: "вт, 17 ноя", given: "3 ноя", id: "c-kovalev", source: { chat: "Закупка оборудования", recorded: "9 ноя", said: "В прошлый вторник Ковалёв сказал, что отгрузка будет через две недели" }, status: "open", what: "Отгрузка оборудования" },
  { creditor: "marina", debtor: "me", due: "30 ноя", given: "4 ноя", id: "c-budget", source: { chat: "Бюджет на декабрь", recorded: "4 ноя", said: "Мы с Мариной договорились, что я согласую бюджет до конца месяца" }, status: "open", what: "Согласовать бюджет" },
  { creditor: "igor", debtor: "andrey", given: "2 ноя", id: "c-migration", source: { chat: "Планёрка", recorded: "2 ноя", said: "Андрей обещал Игорю помочь с миграцией базы" }, status: "open", what: "Помочь с миграцией базы" },
  { creditor: "me", debtor: "igor", given: "3 ноя", id: "c-estimate", source: { chat: "Смета по складу", recorded: "8 ноя", said: "Игорь прислал смету вчера вечером" }, status: "done", what: "Смета по «Складу 2.0»" },
];

export interface Fact {
  id: string;
  about: string;
  text: string;
  /** С какого времени верно; пусто — неизвестно. */
  since?: string;
  /** До какого времени было верно — факт в истории. */
  until?: string;
  source: Source;
}

export const FACTS: Fact[] = [
  { about: "olga", id: "f1", source: { chat: "Договор с перевозчиком", recorded: "21 окт", said: "Ольга любит, когда ей пишут коротко и по делу" }, text: "Любит, когда пишут коротко и по делу" },
  { about: "olga", id: "f2", source: { chat: "Поздравления", recorded: "2 ноя", said: "У Ольги день рождения 14 ноября" }, text: "День рождения — 14 ноября" },
  { about: "olga", id: "f3", since: "2025", source: { chat: "Перевозчики", recorded: "15 сен", said: "До прошлого года Ольга работала в «Векторе»" }, text: "Работала в ООО «Вектор»", until: "2025" },
  { about: "andrey", id: "f4", source: { chat: "Команда", recorded: "1 сен", said: "Андрей Смирнов — разработчик, делает API для склада" }, text: "Делает API для «Склада 2.0»" },
  { about: "marina", id: "f5", since: "декабря", source: { chat: "Команда", recorded: "30 окт", said: "У Марины в декабре начинается декретный отпуск" }, text: "Декретный отпуск с декабря" },
  { about: "igor", id: "f6", since: "1 мар", source: { chat: "Команда", recorded: "1 мар", said: "Игорь теперь руководит отделом продаж" }, text: "Руководит отделом продаж" },
  { about: "sklad", id: "f7", since: "2 ноя", source: { chat: "Склад 2.0", recorded: "2 ноя", said: "Проект «Склад 2.0» перешёл в тестирование" }, text: "Этап — тестирование" },
  { about: "sklad", id: "f8", since: "сентября", source: { chat: "Склад 2.0", recorded: "9 ноя", said: "В сентябре «Склад 2.0» был на этапе дизайна" }, text: "Этап — дизайн", until: "2 ноя" },
  { about: "pack", id: "f9", since: "октября", source: { chat: "Упаковка", recorded: "12 окт", said: "В начале октября поставщик упаковки поднял цены на 8%" }, text: "Поднял цены на 8%" },
];

export interface Event {
  id: string;
  who: string[];
  text: string;
  /** Когда произошло. */
  on: string;
  source: Source;
}

export const EVENTS: Event[] = [
  { id: "e1", on: "8 ноя", source: { chat: "Перевозчики", recorded: "9 ноя", said: "Вчера созвонились с Ольгой, договорились о пилоте на три месяца" }, text: "Созвон: договорились о пилоте на три месяца", who: ["olga"] },
  { id: "e2", on: "8 ноя", source: { chat: "Смета по складу", recorded: "8 ноя", said: "Игорь прислал смету вчера вечером" }, text: "Прислал смету по «Складу 2.0»", who: ["igor"] },
  { id: "e3", on: "3 ноя", source: { chat: "Закупка оборудования", recorded: "3 ноя", said: "Отправили «Вектору» коммерческое предложение" }, text: "Отправлено коммерческое предложение", who: ["vector"] },
  { id: "e4", on: "3 ноя", source: { chat: "Договоры", recorded: "4 ноя", said: "«Вектор» подписал договор 3 ноября" }, text: "Подписан договор поставки", who: ["vector"] },
  { id: "e5", on: "20 окт", source: { chat: "Команда", recorded: "20 окт", said: "Сегодня был один на один с Андреем, обсудили его развитие" }, text: "Встреча один на один: развитие", who: ["andrey"] },
];

export interface Rule {
  id: string;
  text: string;
  source: Source;
}

export const RULES: Rule[] = [
  { id: "r1", source: { chat: "Команда", recorded: "1 сен", said: "Напоминай мне про встречи один на один с каждым из моей команды раз в две недели" }, text: "Встреча один на один с каждым из команды — раз в 2 недели" },
  { id: "r2", source: { chat: "Закупка оборудования", recorded: "3 ноя", said: "Если контрагент не отвечает больше пяти рабочих дней — подсвечивай это в плане" }, text: "Контрагент не отвечает 5 рабочих дней — показать в плане" },
];

/** Не записано: модель не уверена, о ком речь. */
export interface Draft {
  id: string;
  said: string;
  chat: string;
  question: string;
  options: { id: string; label: string }[];
}

export const DRAFTS: Draft[] = [
  { chat: "Планёрка", id: "d1", options: [{ id: "andrey", label: "Андрей Смирнов" }, { id: "kovalev", label: "Андрей Ковалёв" }], question: "Какой Андрей?", said: "Андрей завтра в отпуске" },
  { chat: "Перевозчики", id: "d2", options: [{ id: "new", label: "Новый человек" }, { id: "svetlana", label: "Светлана Петровна" }], question: "Кто такая Наталья из бухгалтерии?", said: "Наталья из бухгалтерии просит подписать акт" },
];

// ── План на день ─────────────────────────────────────────────────────────────────────────────────────────────────

export type PlanKind = "owed" | "waiting" | "mine" | "rhythm" | "date" | "soon";

export interface PlanItem {
  id: string;
  kind: PlanKind;
  /** Про кого: id сущности, у карточки берётся имя. */
  who: string;
  title: string;
  /** Почему пункт здесь: срок, сколько прошло, какое правило. */
  why: string;
  /** Главное действие: закрывает пункт. */
  done: string;
  /** Просьба для нового чата: «Написать» открывает чат с ней. */
  write?: string;
  source: Source;
  overdue?: boolean;
}

export const PLAN: PlanItem[] = [
  { done: "Получен", id: "p-olga", kind: "owed", overdue: true, source: COMMITMENTS[0]!.source, title: "Подписанный договор", who: "olga", why: "Обещала 28 октября — прошло 12 дней", write: "Напиши Ольге Ли короткое напоминание про подписанный договор" },
  { done: "Ответили", id: "p-vector", kind: "waiting", overdue: true, source: COMMITMENTS[1]!.source, title: "Ответ на коммерческое предложение", who: "vector", why: "Отправлено 3 ноября — 6 дней без ответа. Правило: 5 рабочих дней", write: "Напиши ООО «Вектор» вежливое письмо: ждём ответа на коммерческое предложение от 3 ноября" },
  { done: "Встретились", id: "p-andrey-1on1", kind: "rhythm", source: RULES[0]!.source, title: "Встреча один на один", who: "andrey", why: "Последняя — 20 октября, 20 дней назад. Правило: раз в 2 недели", write: "Предложи Андрею Смирнову время для встречи один на один на этой неделе" },
  { done: "Отправлен", id: "p-marina", kind: "mine", source: COMMITMENTS[2]!.source, title: "Ваш отзыв на презентацию", who: "marina", why: "Срок — среда, 11 ноября, через 2 дня" },
  { done: "Готов", id: "p-api", kind: "soon", source: COMMITMENTS[3]!.source, title: "API для «Склада 2.0»", who: "andrey", why: "Срок — пятница, 13 ноября" },
  { done: "Поздравили", id: "p-bday", kind: "date", source: FACTS[1]!.source, title: "День рождения", who: "olga", why: "Суббота, 14 ноября", write: "Напиши короткое поздравление с днём рождения для Ольги Ли" },
  { done: "Пришла", id: "p-ship", kind: "soon", source: COMMITMENTS[4]!.source, title: "Отгрузка оборудования", who: "kovalev", why: "Обещана к вторнику, 17 ноября" },
];

export const PLAN_SECTIONS: { id: string; title: string; kinds: PlanKind[] }[] = [
  { id: "late", kinds: ["owed", "waiting"], title: "Ждёте от других" },
  { id: "mine", kinds: ["mine"], title: "Ваши сроки" },
  { id: "people", kinds: ["rhythm", "date"], title: "Люди" },
  { id: "week", kinds: ["soon"], title: "На этой неделе" },
];

export const CHATS = ["Договор с перевозчиком", "Закупка оборудования", "Презентация для клиента", "Планёрка", "Смета по складу"];
