// P31 · данные прототипа «Защита данных». Только то, что вернёт шлюз: метка, тип, исходное значение, число скрытого,
// имя модели и признак локального источника. Метки — в формате шлюза: люди — `Персона_Женщина_7f3a` в падеже фразы,
// остальное — `[[PHONE_a91c02]]`. Организации по умолчанию не скрываются.

export type Kind = "person" | "phone" | "email" | "document" | "address" | "account" | "org";

/** Значение, которое шлюз заменил: метка в том виде, как её получила модель (в падеже), и исходный текст. */
export interface Hidden {
  /** Метка в начальной форме — один ключ на значение, по нему считаем и строим легенду. */
  id: string;
  kind: Kind;
  /** Как метка стоит в этом месте текста: «Персоне_Женщине_7f3a». */
  masked: string;
  original: string;
}

export type Piece = string | Hidden;

export interface Model {
  name: string;
  local: boolean;
}

export const CLOUD: Model = { local: false, name: "Claude Sonnet 5.5" };
export const LOCAL: Model = { local: true, name: "gpt-oss-20b" };

// ── Маскирование для поля ввода и песочницы ─────────────────────────────────────────────────────────────────────────
// Подмена шлюза: люди — по словарю известных форм (настоящий шлюз находит их моделью NER), остальное — по образцу.

const OLGA = "Персона_Женщина_7f3a";
const ILYA = "Персона_Мужчина_14e4";

const PEOPLE: [string, string, string][] = [
  ["Ольга Смирнова", OLGA, "Персона_Женщина_7f3a"],
  ["Ольги Смирновой", OLGA, "Персоны_Женщины_7f3a"],
  ["Ольге Смирновой", OLGA, "Персоне_Женщине_7f3a"],
  ["Ольгу Смирнову", OLGA, "Персону_Женщину_7f3a"],
  ["Ольгой Смирновой", OLGA, "Персоной_Женщиной_7f3a"],
  ["Илья Кузнецов", ILYA, "Персона_Мужчина_14e4"],
  ["Ильи Кузнецова", ILYA, "Персоны_Мужчины_14e4"],
  ["Илье Кузнецову", ILYA, "Персоне_Мужчине_14e4"],
  ["Илью Кузнецова", ILYA, "Персону_Мужчину_14e4"],
  ["Ильёй Кузнецовым", ILYA, "Персоной_Мужчиной_14e4"],
];

const ORGS = ["ООО «Северный ветер»", "ООО «Полюс»"];

const KNOWN: Record<string, string> = {
  "+7 916 555-01-23": "a91c02",
  "+7 925 555-47-80": "d27b54",
  "o.smirnova@example.com": "3b7e11",
  "4510 555123": "c40d9e",
  "г. Самара, ул. Садовая, д. 12": "5e2f10",
  "40702810555000012345": "88aa01",
};

const TAG: Record<Exclude<Kind, "person" | "org">, string> = {
  account: "BANK_ACCOUNT",
  address: "ADDRESS",
  document: "ID_DOCUMENT",
  email: "EMAIL",
  phone: "PHONE",
};

/** Шесть знаков из значения — как HMAC шлюза: то же значение даёт ту же метку. */
const shortHash = (value: string) => {
  let h = 5381;
  for (const ch of value) h = (h * 33 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h.toString(16).padStart(8, "0").slice(-6);
};

const escape = (s: string) => s.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const PATTERNS: [Exclude<Kind, "person" | "org">, string][] = [
  ["email", String.raw`[\w.+-]+@[\w-]+\.[\w.]+[a-z]`],
  ["phone", String.raw`\+7[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}`],
  ["account", String.raw`\b\d{20}\b`],
  ["document", String.raw`\b\d{4}\s\d{6}\b`],
  ["address", String.raw`(?:г\.\s[А-ЯЁ][а-яё-]+,\s)?ул\.\s[А-ЯЁ][а-яё-]+,\sд\.\s\d+[а-я]?`],
];

const RULE = new RegExp(
  [
    ...PEOPLE.map(([form]) => `(${escape(form)})`),
    ...PATTERNS.map(([, p]) => `(${p})`),
    ...ORGS.map((o) => `(${escape(o)})`),
  ].join("|"),
  "gu"
);

export interface Masked {
  pieces: Piece[];
  /** Найдено, но оставлено открытым по настройкам (организации). */
  kept: { kind: Kind; value: string }[];
}

/** Текст → куски: обычный текст и скрытые значения. `keep` — типы, которые по настройкам остаются открытыми. */
export const mask = (text: string, keep: Kind[] = ["org"]): Masked => {
  const pieces: Piece[] = [];
  const kept: Masked["kept"] = [];
  let last = 0;
  for (const m of text.matchAll(RULE)) {
    const at = m.index ?? 0;
    const value = m[0];
    const group = m.slice(1).findIndex(Boolean);
    let hidden: Hidden | null = null;
    if (group < PEOPLE.length) {
      const [, id, masked] = PEOPLE[group] as [string, string, string];
      hidden = { id, kind: "person", masked, original: value };
    } else if (group < PEOPLE.length + PATTERNS.length) {
      const [kind] = PATTERNS[group - PEOPLE.length] as [Exclude<Kind, "person" | "org">, string];
      const id = `[[${TAG[kind]}_${KNOWN[value] ?? shortHash(value)}]]`;
      hidden = { id, kind, masked: id, original: value };
    } else {
      kept.push({ kind: "org", value });
    }
    if (hidden && keep.includes(hidden.kind)) {
      kept.push({ kind: hidden.kind, value });
      hidden = null;
    }
    if (!hidden) continue;
    if (at > last) pieces.push(text.slice(last, at));
    pieces.push(hidden);
    last = at + value.length;
  }
  if (last < text.length) pieces.push(text.slice(last));
  return { kept, pieces };
};

/** Разные скрытые значения куска текста — по метке. */
export const uniqueHidden = (pieces: Piece[]) => {
  const seen = new Map<string, Hidden>();
  for (const p of pieces) if (typeof p !== "string" && !seen.has(p.id)) seen.set(p.id, p);
  return [...seen.values()];
};

/** Русское число: 1 значение, 2 значения, 5 значений. */
export const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
};

const WORDS: Record<Exclude<Kind, "org">, [string, string, string]> = {
  account: ["счёт", "счёта", "счетов"],
  address: ["адрес", "адреса", "адресов"],
  document: ["документ", "документа", "документов"],
  email: ["почта", "почты", "почт"],
  person: ["имя", "имени", "имён"],
  phone: ["телефон", "телефона", "телефонов"],
};

/** «2 имени, телефон» — что скрыто, по типам, в порядке появления. */
export const hiddenSummary = (hidden: Hidden[]) => {
  const counts = new Map<Exclude<Kind, "org">, number>();
  for (const h of hidden) {
    if (h.kind === "org") continue;
    counts.set(h.kind, (counts.get(h.kind) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, n]) => (n === 1 ? WORDS[k][0] : `${n} ${plural(n, WORDS[k])}`)).join(", ");
};

export const valuesWord = (n: number) => `${n} ${plural(n, ["значение", "значения", "значений"])}`;

// ── Сцена «Ответ» ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const QUESTION =
  "Подготовь письмо поставщику: Ольга Смирнова просит перенести поставку на 25 ноября. Её контакты: +7 916 555-01-23, o.smirnova@example.com. Копию — Илье Кузнецову.";

export const ATTACHMENT = "график-поставок.xlsx";

/** Ответ модели до восстановления — так он пришёл из внешней модели. */
export const RAW_ANSWER =
  "Тема: перенос поставки на 25 ноября\nДобрый день!\nПо просьбе Персоны_Женщины_7f3a переносим поставку на 25 ноября. Если дата не подходит, свяжитесь с ней по телефону [[PHONE_a91c02]] или по почте [[EMAIL_3b7e11]].\nКопия письма — Персоне_Мужчине_14e4.";

const OLGA_FORMS: Record<string, string> = {
  Персона_Женщина_7f3a: "Ольга Смирнова",
  Персоне_Женщине_7f3a: "Ольге Смирновой",
  Персоны_Женщины_7f3a: "Ольги Смирновой",
};
const ILYA_FORMS: Record<string, string> = {
  Персона_Мужчина_14e4: "Илья Кузнецов",
  Персоне_Мужчине_14e4: "Илье Кузнецову",
};
const SIMPLE: Record<string, [Kind, string]> = {
  "[[EMAIL_3b7e11]]": ["email", "o.smirnova@example.com"],
  "[[PHONE_a91c02]]": ["phone", "+7 916 555-01-23"],
};

/** Ответ модели → куски с метками (восстановление шлюза: метка в падеже → значение в том же падеже). */
export const unmaskAnswer = (raw: string): Piece[] => {
  const forms = [...Object.keys(OLGA_FORMS), ...Object.keys(ILYA_FORMS), ...Object.keys(SIMPLE)];
  const re = new RegExp(forms.map(escape).join("|"), "gu");
  const out: Piece[] = [];
  let last = 0;
  for (const m of raw.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(raw.slice(last, at));
    const t = m[0];
    if (OLGA_FORMS[t]) out.push({ id: OLGA, kind: "person", masked: t, original: OLGA_FORMS[t] });
    else if (ILYA_FORMS[t]) out.push({ id: ILYA, kind: "person", masked: t, original: ILYA_FORMS[t] });
    else {
      const [kind, original] = SIMPLE[t] as [Kind, string];
      out.push({ id: t, kind, masked: t, original });
    }
    last = at + t.length;
  }
  if (last < raw.length) out.push(raw.slice(last));
  return out;
};

// ── Сцена «Шаг» ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const TOOL_INPUT = { query: "Ольга Смирнова" };
export const TOOL_OUTPUT = {
  company: "ООО «Северный ветер»",
  email: "o.smirnova@example.com",
  name: "Ольга Смирнова",
  phone: "+7 916 555-01-23",
  position: "менеджер по закупкам",
};

// ── Песочница настроек ────────────────────────────────────────────────────────────────────────────────────────────────

export const SANDBOX =
  "Счёт для ООО «Северный ветер» на имя Ильи Кузнецова: р/с 40702810555000012345. Паспорт 4510 555123, адрес доставки: г. Самара, ул. Садовая, д. 12. Вопросы — Ольге Смирновой, +7 925 555-47-80.";

export const DRAFT =
  "Перешли Илье Кузнецову отчёт по продажам за октябрь и попроси Ольгу Смирнову перезвонить по номеру +7 916 555-01-23";

// ── Сцена «Лента»: у каждого сообщения свой взгляд модели ────────────────────────────────────────────────────────────

/** Обмен до этого: ничего не скрыто — значка у таких сообщений нет. */
export const PLAIN_ASK = "Собери продажи за октябрь по регионам.";
export const PLAIN_ANSWER = "Продажи за октябрь — 12,4 млн ₽, на 8 % больше сентября. Больше всего выросли Север и Урал.";

export const ASK =
  "Найди в CRM контакты Ольги Смирновой и подготовь письмо поставщику: она просит перенести поставку на 25 ноября. Копию — Илье Кузнецову.";

/** Куски как текст: `original` — как в чате, иначе как получила модель. */
export const plainText = (pieces: Piece[], original = true) =>
  pieces.map((p) => (typeof p === "string" ? p : original ? p.original : p.masked)).join("");

/** Текущий текст поля, разбитый по значениям, которые шлюз назвал скрытыми в прошлом ответе: чётные куски — текст. */
export const splitByValues = (text: string, values: string[]) => {
  if (values.length === 0) return [text];
  return text.split(new RegExp(`(${values.map(escape).join("|")})`, "gu"));
};
