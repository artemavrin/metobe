// S15 part 6 «types» (D42): cards of the person's own types — a bus, a contract, a pet. Can the decision model sort a
// mention the writer found into a type: one of the built-in ones, one the person already has (by other words too:
// «машина 305» is a bus), a new one, or nothing worth a card («ноутбук», «отчёт»)? Before any code: if it cannot, the
// design changes. Decision-1 only, through the Gateway. About 40 mentions × RUNS, well under $0.05.
//
//   pnpm types            RUNS=3 by default; SHOW=1 prints every answer

import { createGateway } from "@ai-sdk/gateway";
import { experimental_evaluate as evaluate } from "ai";

import { sourceKey } from "../S13-jev/keys.ts";

const MODEL = process.env.GATE_MODEL ?? "microsoft/microsoft-decision-1";
const RUNS = Number(process.env.RUNS ?? 3);
const SHOW = Boolean(process.env.SHOW);

/** The person's own types so far, each with a few of its cards — as the app would show them. */
const OWN = {
  bus: "автобус — карточки: «Автобус 412», «118», «ЛиАЗ 233»",
  contract: "договор — карточки: «Договор № 31 с „Вектором“», «Контракт 08/26»",
  site: "стройка — карточки: «Стройка на Лесной, 14», «ЖК „Северный“»",
};

const CRITERIA = {
  person: "A person, by name or by what they are to the user",
  org: "A company, an institution, a sole trader — another organization",
  project: "A project: work with a goal and an end, named",
  group: "A group of people: a team, a department",
  ...OWN,
  new: "A particular named or numbered thing the user will come back to, of a kind that is none of the above: a new type of card",
  none: "Not worth a card: a thing mentioned in passing, without a name or number of its own, or a kind in general, not a particular one",
} as const;
type Type = keyof typeof CRITERIA;

const QUESTIONS = {
  card: {
    instructions:
      "Is the mention a particular thing with a name or a number of its own — one the user could ask about again later by that name — and not a thing in general or one mentioned in passing?",
    type: "boolean",
  },
  type: {
    criteria: CRITERIA,
    instructions:
      "What type of card is the mention? A type the user already has fits only when the mention is one more thing of exactly that kind, whatever word the message uses for it. A thing that is merely related to a type (a route is not a bus, a licence is not a contract, a shop or a flat is not a building site) is a new type. An animal is not a person.",
    type: "choice",
  },
} as const;

interface Case {
  text: string;
  mention: string;
  expect: Type;
  /** Not among the examples the question names: does the rule hold on what it was not written for? */
  held?: boolean;
}

const cases: Case[] = [
  // One more of a type the person has, by its own word or another.
  { expect: "bus", mention: "Автобус 412", text: "Автобус 412 встал на ремонт до пятницы" },
  { expect: "bus", mention: "Машина 305", text: "Машина 305 вернулась с ТО, завтра выходит на линию" },
  { expect: "bus", mention: "ТС А118ВС", text: "ТС с госномером А118ВС выходит на маршрут завтра" },
  { expect: "bus", mention: "ПАЗ 207", text: "ПАЗ 207 списываем в декабре" },
  { expect: "bus", mention: "118-й", text: "118-й опять с течью масла, Игорь обещал посмотреть" },
  { expect: "contract", mention: "Договор № 45", text: "Договор № 45 с «Вектором» истекает 1 декабря" },
  { expect: "contract", mention: "Контракт 12/26", text: "Допсоглашение к контракту 12/26 подписали вчера" },
  { expect: "contract", mention: "Соглашение 78-П", text: "Соглашение о поставке 78-П надо продлить до конца года" },
  { expect: "site", mention: "Речная, 3", text: "Стройка на Речной, 3 отстаёт на две недели" },
  { expect: "site", mention: "ЖК «Южный»", text: "ЖК «Южный» сдаём в марте" },
  { expect: "site", mention: "Объект на Полевой", text: "На объекте на Полевой залили фундамент" },
  // The built-in types.
  { expect: "person", mention: "Павел Гуров", text: "Павел Гуров из «Вектора» обещал прислать прайс" },
  { expect: "person", mention: "водитель Семёнов", text: "Водитель Семёнов заболел, 412-й стоит" },
  { expect: "org", mention: "ООО «Стрела»", text: "ООО «Стрела» подняла цены на запчасти" },
  { expect: "org", mention: "ИП Сидоров", text: "ИП Сидоров привёз шины" },
  { expect: "project", mention: "«Склад 2.0»", text: "Запускаем «Склад 2.0» в январе" },
  { expect: "project", mention: "Внедрение CRM", text: "Внедрение CRM идёт по плану, этап настройки закончен" },
  { expect: "group", mention: "бухгалтерия", text: "Бухгалтерия просит акты до пятницы" },
  // A new type: a particular thing of a kind the person has no cards of.
  { expect: "new", mention: "Барсик", text: "Кота Барсика в четверг везу к ветеринару" },
  { expect: "new", mention: "Альма", text: "Собака Альма привита до мая" },
  { expect: "new", mention: "Сервер db-02", text: "Сервер db-02 надо обновить до конца месяца" },
  { expect: "new", mention: "Станок ЧПУ-3", text: "Станок ЧПУ-3 простаивает вторую неделю" },
  { expect: "new", mention: "Магазин на Ленина, 5", text: "Магазин на Ленина, 5 закрывается на ремонт с понедельника" },
  { expect: "new", mention: "Маршрут 17", text: "Маршрут 17 продлили до вокзала" },
  { expect: "new", mention: "Квартира на Садовой", text: "Квартира на Садовой сдаётся с декабря, жильцы съезжают 30-го" },
  { expect: "new", mention: "Склад № 3", text: "Склад № 3 на Южной переполнен, нужен вывоз" },
  { expect: "new", mention: "Домен metobe.example", text: "Домен metobe.example продлить до марта" },
  { expect: "new", mention: "Лицензия № 0456", text: "Лицензия на перевозки № 0456 истекает в феврале" },
  // Held out: related to a type the person has, and not named in the question's examples.
  { expect: "new", held: true, mention: "Остановка «Вокзал»", text: "Остановку «Вокзал» переносят на сто метров с понедельника" },
  { expect: "new", held: true, mention: "Счёт № 88", text: "Счёт № 88 от «Вектора» оплатить до пятницы" },
  { expect: "new", held: true, mention: "Гараж на Заводской", text: "В гараже на Заводской течёт крыша, нужен ремонт" },
  { expect: "new", held: true, mention: "Путевой лист 3391", text: "Путевой лист 3391 потеряли, надо восстановить" },
  { expect: "new", held: true, mention: "Офис на Мира, 10", text: "Офис на Мира, 10 переезжает на третий этаж в декабре" },
  { expect: "new", held: true, mention: "Акт № 12", text: "Акт № 12 подписали с замечаниями" },
  { expect: "new", held: true, mention: "Страховка ОСАГО ХХХ-0412", text: "Страховка ОСАГО ХХХ-0412 заканчивается 3 декабря" },
  { expect: "new", held: true, mention: "Попугай Кеша", text: "Попугаю Кеше нужен новый корм, заказать до выходных" },
  { expect: "bus", held: true, mention: "Борт 540", text: "Борт 540 сегодня на подмене на семнадцатом маршруте" },
  { expect: "contract", held: true, mention: "Договор аренды 5-А", text: "Договор аренды 5-А на гараж продлили на год" },
  { expect: "site", held: true, mention: "Площадка на Озёрной", text: "На площадке на Озёрной начали возводить третий этаж" },
  // Nothing worth a card.
  { expect: "none", mention: "ноутбук", text: "Купил новый ноутбук, завтра настрою" },
  { expect: "none", mention: "отчёт за октябрь", text: "Отчёт за октябрь отправил" },
  { expect: "none", mention: "встреча", text: "Встреча в четверг в 15:00" },
  { expect: "none", mention: "пицца", text: "Закажи пиццу на обед" },
  { expect: "none", mention: "автобус", text: "Нужен автобус на корпоратив в декабре" },
  { expect: "none", mention: "договор", text: "Подпишем какой-нибудь договор с подрядчиком на уборку" },
  { expect: "none", mention: "принтер", text: "Принтер опять зажевал бумагу" },
  { expect: "none", mention: "таблица", text: "Таблица в Excel не считается, посмотри формулу" },
  { expect: "none", mention: "такси", text: "Заказал такси в аэропорт на шесть утра" },
  { expect: "none", mention: "презентация", text: "Презентация готова, отправил Марине" },
  { expect: "none", mention: "один из автобусов", text: "Один из автобусов сегодня опоздал на двадцать минут" },
  { expect: "none", mention: "письмо", text: "Письмо от поставщика пришло, отвечу завтра" },
];

const gw = createGateway({ apiKey: sourceKey("gateway").key });

const ask = async (c: Case) => {
  const r = await evaluate({
    abortSignal: AbortSignal.timeout(60_000),
    maxRetries: 2,
    model: gw.evaluationModel(MODEL),
    providerOptions: { gateway: { zeroDataRetention: true } },
    questions: QUESTIONS,
    state: { mention: c.mention, message: c.text },
  });
  const type = r.answers.type;
  return {
    card: r.answers.card.probability,
    choice: type.choice as Type,
    cost: Number((r.providerMetadata?.gateway as { cost?: string } | undefined)?.cost ?? 0),
    p: type.probabilities?.[type.choice] ?? Number.NaN,
  };
};

const GROUPS: Record<string, (t: Type) => boolean> = {
  "свой тип, уже есть": (t) => t in OWN,
  встроенный: (t) => ["person", "org", "project", "group"].includes(t),
  "новый тип": (t) => t === "new",
  "не карточка": (t) => t === "none",
};

const HELD = Boolean(process.env.HELD);
const jobs = cases.filter((c) => !HELD || c.held).flatMap((c) => Array.from({ length: RUNS }, () => c));
const answers = await Promise.all(jobs.map((c) => ask(c).then((a) => ({ ...a, c }))));

for (const [name, of] of Object.entries(GROUPS)) {
  const rows = answers.filter((a) => of(a.c.expect));
  const right = rows.filter((a) => a.choice === a.c.expect);
  // A card where none is due, or none where one is: the mistakes a person would see.
  const cardWrong = rows.filter((a) => (a.choice === "none") !== (a.c.expect === "none"));
  console.log(`${name}: тип ${right.length}/${rows.length}, карточка/не карточка неверно ${cardWrong.length}`);
}
const total = answers.filter((a) => a.choice === a.c.expect).length;
// How the plain yes/no would do alone, at 0.5.
const byCard = answers.filter((a) => a.card >= 0.5 === (a.c.expect !== "none")).length;
const sure = answers.filter((a) => a.p >= 0.9);
console.log(
  `всего: тип ${total}/${answers.length}; вопрос «карточка?» отдельно ${byCard}/${answers.length}; уверенных (P ≥ 0,9) ${sure.length}, из них верно ${sure.filter((a) => a.choice === a.c.expect).length}; $${answers.reduce((s, a) => s + a.cost, 0).toFixed(4)}`
);
const misses = new Map<string, string[]>();
for (const a of answers) {
  if (SHOW || a.choice !== a.c.expect) {
    const key = `${a.c.expect.padEnd(8)} ${a.c.text}`;
    misses.set(key, [...(misses.get(key) ?? []), `${a.choice} ${a.p.toFixed(2)} (карточка ${a.card.toFixed(2)})`]);
  }
}
for (const [key, got] of misses) {
  console.log(`  ${key}\n      → ${got.join("; ")}`);
}
