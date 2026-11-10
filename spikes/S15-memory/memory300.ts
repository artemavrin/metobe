// S15 «300 карточек»: a memory as it grows — 300 cards and 200 open promises around the few S13 cases are about.
// Namesakes, people sharing a surname, alike roles and alike company names; none of them changes who a S13 case is
// about: no other Андрей, Ольга, Игорь, Марина, Павел, Наталья or Светлана, no other Ковалёв, Седов, Ланьшин or
// Петров, no other buyer, carrier, chief accountant or equipment supplier. Deterministic.

import type { MemoryEntity, MemoryRecord } from "../../packages/core/src/memory.ts";

export const NOW = new Date("2026-11-09T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const MEN = ["Алексей", "Дмитрий", "Сергей", "Михаил", "Николай", "Владимир", "Евгений", "Роман", "Максим", "Константин", "Олег", "Виктор", "Артём", "Денис", "Кирилл", "Григорий", "Тимур", "Вадим", "Леонид", "Фёдор"];
const WOMEN = ["Елена", "Анна", "Мария", "Татьяна", "Ирина", "Екатерина", "Юлия", "Ксения", "Дарья", "Анастасия", "Вера", "Нина", "Людмила", "Галина", "Полина", "Алина", "Валерия", "Софья", "Евгения", "Зоя"];
// Male forms; «Смирнов», «Белов» and «Орлов» share a surname with a S13 card on purpose.
const SURNAMES = ["Иванов", "Кузнецов", "Попов", "Соколов", "Лебедев", "Козлов", "Новиков", "Морозов", "Волков", "Соловьёв", "Васильев", "Зайцев", "Семёнов", "Голубев", "Виноградов", "Богданов", "Воробьёв", "Михайлов", "Беляев", "Тарасов", "Белоусов", "Комаров", "Смирнов", "Белов", "Орлов"];
const TWINS = new Set(["Смирнов", "Белов", "Орлов"]);
const ORGS = ["ООО «Сигма»", "«Омега-Трейд»", "«Ромашка»", "«Гамма-Строй»", "«Дельта-Логистик»", "«Альфа-Строй»", "ООО «Меридиан»", "«Северный ветер»", "«Техносила-М»", "«Фабрика окон»", "АО «Прогресс»", "«Кондитер»", "«Бета-Софт»", "«Горизонт»", "ООО «Ладога»", "«Пионер-Сервис»", "«Стройресурс»", "«Капитал-Банк»", "«Зелёный город»", "«Медиа-Плюс»", "ООО «Кварц»", "«Аркада»", "«Телеком-Центр»", "«ПромТех»", "«Уютный дом»", "«Экспресс-Курьер»", "«Восток-Агро»", "«Линия»", "ООО «Факел»", "«Норд-Инжиниринг»", "«Сфера»", "«Тандем»", "«Регион-Снаб»", "«Каскад-Мебель»", "«Полиграф-Центр»", "«Атлант»", "«Квадрат»", "«Вертикаль»", "«Город-Сити»", "«Мастерская идей»", "«Электро-Монтаж»", "«Транзит»", "«Оптима»", "«Центр-Право»", "«Спектр»"];
const ORG_ROLES = ["клиент", "поставщик мебели", "арендодатель офиса", "банк", "подрядчик по ремонту", "поставщик канцелярии", "клиент по рознице", "партнёр по маркетингу", "поставщик серверов", "юридическая фирма", "курьерская служба", "поставщик кофе"];
const POSITIONS = ["менеджер по продажам", "юрист", "бухгалтер", "инженер", "логист", "аналитик", "маркетолог", "директор", "кладовщик", "секретарь", "HR-менеджер", "тестировщик", "разработчик", "дизайнер", "менеджер проекта"];
const PROJECTS = ["«CRM 3.0»", "«Переезд офиса»", "«Бюджет 2027»", "«Сайт компании»", "«Мобильное приложение»", "«Склад-Восток»", "«Новый прайс-лист»", "«Аудит 2026»", "«Обучение продавцов»", "«Ребрендинг»", "«Портал поставщиков»", "«Выставка в марте»", "«Онлайн-касса»", "«Корпоратив»", "«Отчётность МСФО»"];
const THINGS = ["счёт на оплату", "смету по ремонту", "отчёт за октябрь", "график отпусков", "коммерческое предложение", "макет баннера", "расчёт доставки", "список участников", "доверенность", "техническое задание"];

const female = (surname: string) => (surname.endsWith("ий") ? `${surname.slice(0, -2)}ая` : `${surname}а`);

const entity = (id: string, kind: MemoryEntity["kind"], name: string, role: string | null): MemoryEntity => ({
  aliases: [],
  createdAt: daysAgo(90),
  id,
  kind,
  name,
  role,
  updatedAt: daysAgo(90),
});

/** 240 people, 45 organizations, 15 projects: ids f1…f300. */
export const fillerCards = (): MemoryEntity[] => {
  const cards: MemoryEntity[] = [];
  for (let i = 0; i < 240; i++) {
    const woman = i % 2 === 1;
    const first = (woman ? WOMEN : MEN)[(i * 13 + Math.floor(i / 40)) % 20] as string;
    const pick = SURNAMES[(i * 17 + 3) % SURNAMES.length] as string;
    // A S13 surname only for a woman: «Елена Смирнова» beside «Андрей Смирнов», never a second Смирнов.
    const surname = !woman && TWINS.has(pick) ? (SURNAMES[i % 20] as string) : pick;
    const position = POSITIONS[i % POSITIONS.length] as string;
    const where = i % 6 === 0 ? "в моей команде" : `в ${ORGS[(i * 5) % ORGS.length]}`;
    cards.push(entity(`f${cards.length + 1}`, "person", `${first} ${woman ? female(surname) : surname}`, `${position} ${where}`));
  }
  for (const [i, org] of ORGS.entries()) {
    cards.push(entity(`f${cards.length + 1}`, "org", org, ORG_ROLES[i % ORG_ROLES.length] as string));
  }
  for (const project of PROJECTS) {
    cards.push(entity(`f${cards.length + 1}`, "project", project, "проект компании"));
  }
  return cards;
};

export const SELF = entity("user", "self", "Я", null);

const record = (id: string, over: Partial<MemoryRecord> & Pick<MemoryRecord, "kind" | "text">): MemoryRecord => ({
  closedByWrite: null,
  deletedAt: null,
  doneAt: null,
  dueAt: null,
  entities: [],
  givenAt: null,
  id,
  important: false,
  occurredAt: null,
  occurredPrecision: null,
  recordedAt: daysAgo(60),
  role: null,
  rule: null,
  status: null,
  supersededAt: null,
  supersededBy: null,
  validFrom: null,
  validTo: null,
  writeId: null,
  ...over,
});

/** An open promise between two cards, given `ago` days back. */
export const promise = (
  id: string,
  text: string,
  debtor: string,
  creditor: string,
  { ago = 45, due = null as Date | null, status = "open" as "open" | "unconfirmed" } = {}
) =>
  record(id, {
    dueAt: due,
    entities: [
      { entityId: debtor, role: "debtor" },
      { entityId: creditor, role: "creditor" },
    ],
    givenAt: daysAgo(ago),
    kind: "commitment",
    recordedAt: daysAgo(ago),
    status,
    text,
  });

/** 200 open promises between the user and the people of the filler, a tenth of them given this month. */
export const fillerPromises = (people: MemoryEntity[]): MemoryRecord[] =>
  Array.from({ length: 200 }, (_, i) => {
    const who = people[(i * 37) % 240] as MemoryEntity;
    const thing = THINGS[i % THINGS.length] as string;
    const due = i % 3 === 0 ? null : new Date(NOW.getTime() + ((i % 40) - 10) * 86_400_000);
    const ago = i % 10 === 0 ? 7 + (i % 20) : 35 + (i % 60);
    return i % 2 === 0
      ? promise(`p${i + 1}`, `${who.name} пришлёт ${thing}`, who.id, "user", { ago, due })
      : promise(`p${i + 1}`, `Отправить ${thing}: ${who.name}`, "user", who.id, { ago, due });
  });
