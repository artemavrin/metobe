import type { ModelLabel } from "@metobe/core/chat";

// The first agent: what a person writes, what the model makes of it (a draft), and the dates the server counts from
// the schedule (ARCH §16.1: the model proposes the schedule, the server counts the next runs). Neutral examples
// («Нейтральные примеры»): any company's mail, prices and monthly report.

export const MODEL: ModelLabel = {
  id: "00000000-0000-4000-8000-000000000001",
  providerLogo: null,
  providerTitle: "Anthropic",
  title: "Claude Sonnet 5.5",
};

/** The prototype's «now»: Tuesday afternoon, so «tomorrow» and «next Monday» read naturally. */
export const NOW = new Date(2026, 10, 3, 14, 20);

export type Freq = "daily" | "weekdays" | "weekly" | "monthly";

export interface Schedule {
  freq: Freq;
  hour: number;
  minute: number;
  /** For `weekly`: 0 — Sunday … 6 — Saturday. */
  weekday: number;
}

export type ToolIcon = "mail" | "globe" | "page" | "crm";

export interface Tool {
  id: string;
  name: string;
  icon: ToolIcon;
  /** The name in the instrumental case, for the sentence: «пользуется почтой». */
  instr: string;
  /** A per-user service the person has not signed in to yet. */
  signIn?: boolean;
}

export interface Draft {
  name: string;
  /** What it does, one or two sentences — the agent's instructions as the person will read them. */
  does: string;
  schedule: Schedule;
  tools: Tool[];
  /** What the model could not guess and must ask: here, which sites. */
  sites: string[] | null;
  push: boolean;
  email: boolean;
  /** «Молчать, если нечего сказать» — `notify_policy = if_new`. */
  quiet: boolean;
  /** What the person added in words after the draft («ещё: …»). */
  notes: string[];
}

export const EXAMPLES = [
  { label: "Важные письма за ночь", text: "Каждое утро в будни присылай письма за ночь, которым нужен мой ответ" },
  { label: "Цены конкурентов", text: "По понедельникам проверяй цены у конкурентов и пиши, если что-то изменилось" },
  { label: "Отчёт за месяц", text: "В последний день месяца собирай отчёт по продажам из CRM и присылай мне на почту" },
];

const MAIL: Tool = { icon: "mail", id: "mail", instr: "почтой", name: "Почта", signIn: true };
const SEARCH: Tool = { icon: "globe", id: "search", instr: "поиском в интернете", name: "Поиск в интернете" };
const PAGES: Tool = { icon: "page", id: "pages", instr: "чтением страниц", name: "Чтение страниц" };
const CRM: Tool = { icon: "crm", id: "crm", instr: "CRM", name: "CRM" };

export const scheduleOf = (text: string, fallbackHour: number): Schedule => {
  const t = text.toLowerCase();
  const time = /в (\d{1,2})(?::(\d{2}))?(?!\d)/u.exec(t);
  const hour = time ? Math.min(23, Number(time[1])) : fallbackHour;
  const minute = time?.[2] ? Math.min(59, Number(time[2])) : 0;
  if (/будн/u.test(t)) return { freq: "weekdays", hour, minute, weekday: 1 };
  if (/месяц/u.test(t)) return { freq: "monthly", hour, minute, weekday: 1 };
  const day = ["воскрес", "понедельн", "вторн", "сред", "четверг", "пятниц", "суббот"].findIndex((d) => t.includes(d));
  if (day >= 0) return { freq: "weekly", hour, minute, weekday: day };
  return { freq: "daily", hour, minute, weekday: 1 };
};

/** What the model would make of the request: a guess by its words, enough for the prototype. */
export const draftFrom = (text: string): Draft => {
  const t = text.toLowerCase();
  const base = { email: /почт/u.test(t) && !/письм/u.test(t), notes: [], push: false, quiet: true, sites: null };
  if (/письм|почт.*ответ/u.test(t)) {
    return {
      ...base,
      does: "Смотрит почту за ночь и присылает короткий список писем, которым нужен ваш ответ. Рассылки и уведомления пропускает.",
      email: false,
      name: "Важные письма за ночь",
      push: true,
      schedule: scheduleOf(text, 9),
      tools: [MAIL],
    };
  }
  if (/цен|конкурент|сайт/u.test(t)) {
    return {
      ...base,
      does: "Открывает страницы конкурентов, сравнивает цены с прошлой неделей и пишет, что изменилось и насколько.",
      name: "Цены конкурентов",
      schedule: scheduleOf(text, 10),
      sites: [],
      tools: [SEARCH, PAGES],
    };
  }
  if (/отч[её]т|продаж/u.test(t)) {
    return {
      ...base,
      does: "Собирает продажи за месяц из CRM: выручку, число сделок и сравнение с прошлым месяцем — таблицей и коротким выводом.",
      email: true,
      name: "Отчёт по продажам за месяц",
      quiet: false,
      schedule: scheduleOf(text, 18),
      tools: [CRM],
    };
  }
  const words = text.trim().replace(/[.!?]+$/u, "").split(/\s+/u);
  const name = words.slice(0, 4).join(" ");
  return {
    ...base,
    does: text.trim().replace(/^./u, (c) => c.toUpperCase()),
    name: name.replace(/^./u, (c) => c.toUpperCase()) + (words.length > 4 ? "…" : ""),
    schedule: scheduleOf(text, 9),
    tools: [SEARCH],
  };
};

// ── The schedule in words and its next runs ─────────────────────────────────────────────────────────────────────────

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const ON_DAYS = ["воскресеньям", "понедельникам", "вторникам", "средам", "четвергам", "пятницам", "субботам"];

export const clock = (s: Pick<Schedule, "hour" | "minute">) => `${s.hour}:${String(s.minute).padStart(2, "0")}`;

/** «по будням в 9:00». */
export const scheduleWords = (s: Schedule) => {
  const at = `в ${clock(s)}`;
  if (s.freq === "daily") return `каждый день ${at}`;
  if (s.freq === "weekdays") return `по будням ${at}`;
  if (s.freq === "weekly") return `по ${ON_DAYS[s.weekday]} ${at}`;
  return `в последний день месяца ${at}`;
};

const fits = (s: Schedule, d: Date) => {
  const wd = d.getDay();
  if (s.freq === "weekdays") return wd >= 1 && wd <= 5;
  if (s.freq === "weekly") return wd === s.weekday;
  if (s.freq === "monthly") return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getDate() === 1;
  return true;
};

/** The next `count` runs after now — what the server would count with cron-parser. */
export const nextRuns = (s: Schedule, count = 3) => {
  const runs: Date[] = [];
  const day = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  for (let i = 0; runs.length < count && i < 400; i += 1) {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate() + i, s.hour, s.minute);
    if (at > NOW && fits(s, at)) runs.push(at);
  }
  return runs;
};

/** «завтра, 9:00», «пн, 9 ноя, 10:00». */
export const runWords = (d: Date, withTime = true) => {
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime()) / 86_400_000
  );
  const time = withTime ? `, ${clock({ hour: d.getHours(), minute: d.getMinutes() })}` : "";
  if (days === 0) return `сегодня${time}`;
  if (days === 1) return `завтра${time}`;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${time}`;
};

/** «Первый запуск — завтра в 9:00». */
export const firstRun = (s: Schedule) => {
  const [first] = nextRuns(s, 1);
  return first ? `${runWords(first, false)} в ${clock(s)}` : "";
};

export const FREQS: { id: Freq; label: string }[] = [
  { id: "daily", label: "Каждый день" },
  { id: "weekdays", label: "По будням" },
  { id: "weekly", label: "Раз в неделю" },
  { id: "monthly", label: "Раз в месяц" },
];

export const WEEKDAY_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** A change said in words after the draft (variant «Разговор»): a new time, mail on, or a note kept as is. */
export const applyWords = (d: Draft, text: string): { draft: Draft; said: string } => {
  const t = text.toLowerCase();
  const time = /(?:в|на) (\d{1,2})(?::(\d{2}))?(?!\d)/u.exec(t);
  if (time) {
    const schedule = { ...d.schedule, hour: Math.min(23, Number(time[1])), minute: time[2] ? Math.min(59, Number(time[2])) : 0 };
    return { draft: { ...d, schedule }, said: `Перенёс на ${clock(schedule)}. Первый запуск — ${firstRun(schedule)}.` };
  }
  if (/почт/u.test(t)) {
    return { draft: { ...d, email: true }, said: "Добавил: копию каждого результата — на почту." };
  }
  if (/тих|молч|не пиши|без уведомл/u.test(t)) {
    return { draft: { ...d, push: false, quiet: true }, said: "Хорошо: без уведомлений, и молчит, если нечего сказать." };
  }
  return { draft: { ...d, notes: [...d.notes, text.trim()] }, said: "Учёл — это пойдёт в инструкции задачи." };
};

/** «shop-one.ru, shop-two.ru» → the list; anything that looks like a domain counts. */
export const sitesFrom = (text: string) =>
  text
    .split(/[\s,;]+/u)
    .map((s) => s.replace(/^https?:\/\//u, "").replace(/\/$/u, ""))
    .filter((s) => /\.[a-zа-я]{2,}$/iu.test(s));

export const CHATS = ["План весенней рассылки", "Письмо поставщику о сроках", "Сравнить тарифы связи", "Итоги квартала коротко"];
