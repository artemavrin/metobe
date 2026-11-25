// Моки организаций, мест и тарифов (D48, ORGS-PLAN) — общие для прототипов P35–P38. Все цены, лимиты и стоимости
// ответов здесь ВЫДУМАНЫ для прототипа: настоящие значения задаёт суперюзер в настройках, в публичный репозиторий
// они не попадают. Организации и люди — вымышленные.

export type TariffId = "basic" | "pro" | "max";

export const TARIFF_IDS: TariffId[] = ["basic", "pro", "max"];

export interface TariffModel {
  id: string;
  /** Входит в тариф. */
  on: boolean;
}

export interface Tariff {
  id: TariffId;
  name: string;
  /** Цена места в месяц, в валюте тарифа. */
  price: number;
  currency: "RUB" | "USD";
  /** Ставка НДС, %. */
  vat: number;
  /** НДС в цене или сверху. */
  vatMode: "inside" | "above";
  /** Лимит на неделю, в валюте тарифа. */
  week: number;
  /** Лимит на 5 часов; `null` — окна нет, только неделя. */
  fiveHours: number | null;
  models: TariffModel[];
  /** Модель по умолчанию — основная, от неё считается «×N». */
  defaultModel: string;
  tasks: { count: number | null; every: "day" | "hour" | "15min" };
  mailMemory: boolean;
  fast: boolean;
  early: boolean;
  archived: boolean;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  /** Средний ответ этой установки, в рублях по курсу платформы (выдумано). */
  perAnswer: number;
  /** Есть ли у модели цена: без цены в тариф не включить. */
  priced: boolean;
  /** Быстрая версия модели (вдвое дороже). */
  fast?: boolean;
}

export const MODELS: Model[] = [
  { id: "flash", name: "Gemini Flash", perAnswer: 0.3, priced: true, provider: "Google" },
  { id: "mini", name: "GPT mini", perAnswer: 1.2, priced: true, provider: "OpenAI" },
  { id: "gemini-pro", name: "Gemini 4 Pro", perAnswer: 2.5, priced: true, provider: "Google" },
  { id: "sol", name: "GPT Sol", perAnswer: 3, priced: true, provider: "OpenAI" },
  { id: "sonnet", name: "Claude Sonnet", perAnswer: 4, priced: true, provider: "Anthropic" },
  { id: "opus", name: "Claude Opus", perAnswer: 8, priced: true, provider: "Anthropic" },
  { id: "local", name: "Локальная 8B", perAnswer: 0, priced: false, provider: "Своя" },
];

export const modelById = (id: string) => MODELS.find((m) => m.id === id) ?? MODELS[0];

const on = (ids: string[]): TariffModel[] => MODELS.map((m) => ({ id: m.id, on: ids.includes(m.id) }));

/** Про вдвое дороже Обычного, Макс — вчетверо (решено 2026-11-24); сами числа выдуманы. */
export const TARIFFS: Tariff[] = [
  {
    archived: false,
    currency: "RUB",
    defaultModel: "flash",
    early: false,
    fast: false,
    fiveHours: 50,
    id: "basic",
    mailMemory: false,
    models: on(["flash", "mini"]),
    name: "Обычный",
    price: 1000,
    tasks: { count: 3, every: "day" },
    vat: 22,
    vatMode: "inside",
    week: 150,
  },
  {
    archived: false,
    currency: "RUB",
    defaultModel: "gemini-pro",
    early: false,
    fast: false,
    fiveHours: 100,
    id: "pro",
    mailMemory: true,
    models: on(["flash", "mini", "gemini-pro", "sol", "sonnet"]),
    name: "Про",
    price: 2000,
    tasks: { count: 20, every: "hour" },
    vat: 22,
    vatMode: "inside",
    week: 300,
  },
  {
    archived: false,
    currency: "RUB",
    defaultModel: "sonnet",
    early: true,
    fast: true,
    fiveHours: null,
    id: "max",
    mailMemory: true,
    models: on(["flash", "mini", "gemini-pro", "sol", "sonnet", "opus"]),
    name: "Макс",
    price: 4000,
    tasks: { count: null, every: "15min" },
    vat: 22,
    vatMode: "inside",
    week: 600,
  },
];

export const tariffById = (id: TariffId) => TARIFFS.find((t) => t.id === id) ?? TARIFFS[0];

/** Расходы на серверы в месяц на одно место (выдумано) — для «Неделя в ноль» и прогноза. */
export const SERVERS_PER_SEAT = 150;

/** Цена без НДС. */
export const net = (t: Pick<Tariff, "price" | "vat" | "vatMode">) => (t.vatMode === "inside" ? t.price / (1 + t.vat / 100) : t.price);

/** «Неделя в ноль»: лимит, при котором место не уходит в минус (ORGS-PLAN §5.2). */
export const breakEvenWeek = (t: Pick<Tariff, "price" | "vat" | "vatMode">, servers = SERVERS_PER_SEAT) =>
  Math.floor(((net(t) - servers) * 7) / 30.4);

/** Сколько средних ответов модели в неделю даёт лимит тарифа. */
export const answersPerWeek = (week: number, m: Model) => (m.perAnswer > 0 ? Math.floor(week / m.perAnswer) : 0);

/** «×N к лимиту» относительно модели по умолчанию. */
export const multiplier = (m: Model, base: Model) => (base.perAnswer > 0 ? m.perAnswer / base.perAnswer : 1);

/** Пометка модели в тарифе: у основной её нет, остальные — «×N» относительно основной (как в P35). */
export const limitMark = (m: Model, base: Model) => (m.id === base.id ? "основная" : times(multiplier(m, base)));

/** Правило §5.3: ≥100 — основная, 25–99 — «дороже», меньше 25 — не входит. */
export const modelFit = (answers: number): "main" | "costly" | "out" => (answers >= 100 ? "main" : answers >= 25 ? "costly" : "out");

// ── Форматы ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const NBSP = " ";

export const money = (n: number, currency: "RUB" | "USD" = "RUB") =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: n < 100 && n % 1 !== 0 ? 1 : 0 }).format(n)}${NBSP}${currency === "RUB" ? "₽" : "$"}`;

export const pct = (n: number) => `${Math.round(n)}${NBSP}%`;

/** Процент лимита для людей (как в P35 и P37): целый, вниз, но при любом расходе не меньше 1 %. */
export const limitPct = (n: number) => (n <= 0 ? 0 : Math.max(1, Math.floor(n)));

export const times = (n: number) => `×${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n)}`;

/** Тон процента лимита — одинаковый во всех прототипах: до 80 % спокойно, с 80 % предупреждение, 100 % — упёрся. */
export const pctTone = (n: number): "ok" | "warn" | "full" => (n >= 100 ? "full" : n >= 80 ? "warn" : "ok");

// ── Организации ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type Seats = Record<TariffId, number>;

export type OrgStatus = "active" | "trial" | "off-unpaid" | "off-manual";

export interface Org {
  id: string;
  name: string;
  owner: { name: string; email: string };
  status: OrgStatus;
  /** Места на этот месяц. */
  seats: Seats;
  /** Занято сейчас: люди и приглашения без ответа. */
  used: Seats;
  /** Места на следующий месяц (задаёт владелец). */
  next: Seats;
  /** Доплаты этого месяца — пойдут в следующий счёт. */
  extras: { text: string; sum: number }[];
  /** Расход на модели с начала месяца, ₽. */
  spend: number;
  /** Сколько людей в этом месяце упирались в недельный лимит. */
  hitWeek: number;
  /** Договорная цена по тарифу. */
  customPrice?: Partial<Record<TariffId, number>>;
  trialUntil?: string;
  /** Оплачен ли счёт за декабрь (на 25 ноября). */
  paid: boolean;
  timezone: string;
  domains: string[];
  created: string;
}

const s = (basic: number, pro: number, max: number): Seats => ({ basic, max, pro });

export const ORGS: Org[] = [
  {
    created: "12 марта",
    customPrice: undefined,
    domains: ["severnyi-veter.example"],
    extras: [{ sum: 867, text: "2 Обычных с 18 ноября, 13 дней из 30" }],
    hitWeek: 2,
    id: "veter",
    name: "Северный ветер",
    next: s(8, 3, 1),
    owner: { email: "owner@severnyi-veter.example", name: "Ольга Белова" },
    paid: true,
    seats: s(10, 3, 1),
    spend: 2240,
    status: "active",
    timezone: "Москва",
    used: s(10, 3, 1),
  },
  {
    created: "2 апреля",
    customPrice: { basic: 900, pro: 1800 },
    domains: ["granit.example"],
    extras: [],
    hitWeek: 5,
    id: "verf",
    name: "Гранит Проект",
    next: s(30, 6, 2),
    owner: { email: "it@granit.example", name: "Павел Громов" },
    paid: false,
    seats: s(30, 6, 2),
    spend: 13080,
    status: "active",
    timezone: "Москва",
    used: s(28, 6, 2),
  },
  {
    created: "19 июня",
    domains: [],
    extras: [{ sum: 367, text: "Обычный → Про у 1 человека с 20 ноября, 11 дней из 30" }],
    hitWeek: 0,
    id: "sfera",
    name: "Студия Сфера",
    next: s(4, 2, 0),
    owner: { email: "hello@sfera.example", name: "Вера Лосева" },
    paid: false,
    seats: s(5, 2, 0),
    spend: 1140,
    status: "active",
    timezone: "Екатеринбург",
    used: s(4, 2, 0),
  },
  {
    created: "8 августа",
    domains: ["ladoga-log.example"],
    extras: [],
    hitWeek: 1,
    id: "ladoga",
    name: "Ладога Логистик",
    next: s(8, 1, 0),
    owner: { email: "admin@ladoga-log.example", name: "Сергей Яковлев" },
    paid: true,
    seats: s(8, 1, 0),
    spend: 1590,
    status: "active",
    timezone: "Москва",
    used: s(7, 1, 0),
  },
  {
    created: "1 ноября",
    domains: [],
    extras: [],
    hitWeek: 0,
    id: "arktur",
    name: "Арктур Медиа",
    next: s(6, 1, 0),
    owner: { email: "team@arktur.example", name: "Нина Зайцева" },
    paid: false,
    seats: s(6, 1, 0),
    spend: 500,
    status: "trial",
    timezone: "Москва",
    trialUntil: "15 декабря",
    used: s(3, 1, 0),
  },
  {
    created: "14 мая",
    domains: [],
    extras: [],
    hitWeek: 0,
    id: "belyi",
    name: "Белый лист",
    next: s(3, 0, 0),
    owner: { email: "office@belyi-list.example", name: "Константин Фролов" },
    paid: false,
    seats: s(3, 0, 0),
    spend: 0,
    status: "off-unpaid",
    timezone: "Новосибирск",
    used: s(3, 0, 0),
  },
  {
    created: "30 сентября",
    domains: ["teplyi-dom.example"],
    extras: [],
    hitWeek: 0,
    id: "teplyi",
    name: "Тёплый дом",
    next: s(10, 0, 0),
    owner: { email: "director@teplyi-dom.example", name: "Алла Медведева" },
    paid: false,
    seats: s(10, 0, 0),
    spend: 1870,
    status: "off-manual",
    timezone: "Москва",
    used: s(9, 0, 0),
  },
];

export const orgById = (id: string) => ORGS.find((o) => o.id === id) ?? ORGS[0];

export const seatTotal = (x: Seats) => x.basic + x.pro + x.max;

export const priceFor = (org: Org, t: TariffId) => org.customPrice?.[t] ?? tariffById(t).price;

/** Счёт за следующий месяц: места × цена + доплаты этого месяца; НДС в цене (ORGS-PLAN §6). */
export const invoiceFor = (org: Org) => {
  const lines = TARIFF_IDS.filter((t) => org.next[t] > 0).map((t) => ({
    sum: org.next[t] * priceFor(org, t),
    text: `${tariffById(t).name} × ${org.next[t]}`,
  }));
  const extras = org.extras.map((e) => ({ sum: e.sum, text: `Доплата: ${e.text}` }));
  const base = [...lines, ...extras].reduce((a, l) => a + l.sum, 0);
  const vat = Math.round((base * TARIFFS[0].vat) / (100 + TARIFFS[0].vat));
  return { base, extras, lines, total: base, vat };
};

/** Выручка этого месяца без НДС — для доли расхода на модели. */
export const revenueNow = (org: Org) => TARIFF_IDS.reduce((a, t) => a + org.seats[t] * priceFor(org, t), 0) / (1 + TARIFFS[0].vat / 100);

// ── Люди ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type PersonStatus = "active" | "invited" | "off-owner" | "off-platform";

export interface Person {
  id: string;
  name: string;
  email: string;
  org: string;
  tariff: TariffId;
  role: "owner" | "admin" | "member";
  /** Процент недели. */
  week: number;
  /** Процент окна 5 часов; у Макса окна нет. */
  five: number | null;
  /** Расход на модели с начала месяца, ₽. */
  spend: number;
  /** Сколько раз за месяц упирался в недельный лимит. */
  hits: number;
  lastSeen: string;
  status: PersonStatus;
}

const P = (
  org: string,
  name: string,
  login: string,
  tariff: TariffId,
  week: number,
  spend: number,
  lastSeen: string,
  extra: Partial<Person> = {}
): Person => ({
  email: `${login}@${orgById(org).domains[0] ?? `${org}.example`}`,
  five: tariff === "max" ? null : Math.min(100, Math.round(week * 0.7)),
  hits: week >= 100 ? 1 : 0,
  id: `${org}-${login}`,
  lastSeen,
  name,
  org,
  role: "member",
  spend,
  status: "active",
  tariff,
  week,
  ...extra,
});

export const PEOPLE: Person[] = [
  P("veter", "Ольга Белова", "o.belova", "max", 41, 1010, "сегодня", { role: "owner" }),
  P("veter", "Игорь Петров", "i.petrov", "pro", 100, 730, "сегодня", { five: 34, hits: 2 }),
  P("veter", "Анна Смирнова", "a.smirnova", "pro", 86, 410, "сегодня", { role: "admin" }),
  P("veter", "Мария Ким", "m.kim", "pro", 22, 190, "вчера"),
  P("veter", "Дмитрий Орлов", "d.orlov", "basic", 100, 310, "сегодня", { five: 18 }),
  P("veter", "Елена Соколова", "e.sokolova", "basic", 64, 200, "сегодня"),
  P("veter", "Артур Волков", "a.volkov", "basic", 48, 160, "сегодня"),
  P("veter", "Татьяна Новикова", "t.novikova", "basic", 31, 110, "вчера"),
  P("veter", "Роман Лебедев", "r.lebedev", "basic", 17, 70, "3 дня назад"),
  P("veter", "Светлана Егорова", "s.egorova", "basic", 9, 50, "неделю назад"),
  P("veter", "Кирилл Попов", "k.popov", "basic", 5, 20, "вчера"),
  P("veter", "Юлия Морозова", "y.morozova", "basic", 0, 0, "—", { five: 0, status: "invited" }),
  P("veter", "Глеб Тарасов", "g.tarasov", "basic", 72, 250, "сегодня"),
  P("veter", "Никита Беляев", "n.belyaev", "basic", 0, 0, "—", { five: 0, status: "invited" }),
  P("veter", "Лев Комаров", "l.komarov", "basic", 0, 0, "месяц назад", { five: 0, status: "off-owner" }),
  P("verf", "Павел Громов", "p.gromov", "max", 58, 1740, "сегодня", { role: "owner" }),
  P("verf", "Андрей Киселёв", "a.kiselev", "pro", 100, 1100, "сегодня", { hits: 3 }),
  P("verf", "Оксана Руденко", "o.rudenko", "basic", 92, 370, "сегодня"),
  P("verf", "Максим Зуев", "m.zuev", "basic", 100, 420, "сегодня", { hits: 2 }),
  P("verf", "Георгий Блинов", "g.blinov", "basic", 0, 0, "2 недели назад", { five: 0, status: "off-platform" }),
  P("sfera", "Вера Лосева", "v.loseva", "pro", 37, 310, "сегодня", { role: "owner" }),
  P("sfera", "Денис Сафронов", "d.safronov", "pro", 54, 370, "вчера"),
  P("sfera", "Алиса Котова", "a.kotova", "basic", 26, 80, "сегодня"),
  P("ladoga", "Сергей Яковлев", "s.yakovlev", "pro", 63, 470, "сегодня", { role: "owner" }),
  P("ladoga", "Инна Григорьева", "i.grigorieva", "basic", 100, 280, "сегодня"),
  P("arktur", "Нина Зайцева", "n.zaitseva", "pro", 28, 200, "сегодня", { role: "owner" }),
  P("arktur", "Олег Савин", "o.savin", "basic", 44, 130, "вчера"),
  P("belyi", "Константин Фролов", "k.frolov", "basic", 0, 0, "8 дней назад", { role: "owner" }),
  P("teplyi", "Алла Медведева", "a.medvedeva", "basic", 0, 0, "5 дней назад", { role: "owner" }),
];

export const peopleOf = (org: string) => PEOPLE.filter((p) => p.org === org);

// ── История мест и счета организации ─────────────────────────────────────────────────────────────────────────────────

export const SEAT_HISTORY: Record<string, { date: string; text: string }[]> = {
  veter: [
    { date: "20 ноября", text: "На декабрь: 8 Обычных, 3 Про, 1 Макс" },
    { date: "18 ноября", text: "+2 Обычных, доплата 867 ₽ в счёт за декабрь" },
    { date: "1 ноября", text: "Месяц начат: 8 Обычных, 3 Про, 1 Макс" },
  ],
};

export type BillStatus = "issued" | "paid" | "late";

export const PAST_BILLS = [
  { month: "Ноябрь", status: "paid" as BillStatus, sum: 19_800 },
  { month: "Октябрь", status: "paid" as BillStatus, sum: 18_900 },
  { month: "Сентябрь", status: "paid" as BillStatus, sum: 17_600 },
];

export const PERSON_STATUS: Record<PersonStatus, string> = {
  active: "Активен",
  invited: "Приглашён",
  "off-owner": "Отключён владельцем",
  "off-platform": "Отключён платформой",
};

export const ROLE_TEXT: Record<Person["role"], string> = { admin: "админ", member: "участник", owner: "владелец" };

export const TIMEZONES = ["Калининград", "Москва", "Самара", "Екатеринбург", "Омск", "Новосибирск", "Красноярск", "Иркутск", "Владивосток"];
