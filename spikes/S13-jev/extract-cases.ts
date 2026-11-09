// Second stage of memory writing (D39, S13 part 2): what the service model should record from one message.
// Today is Monday 2026-11-09, Europe/Moscow. Refs: "user", a card id, or "new" for someone not in the cards.

export const TODAY_ISO = "2026-11-09";
export const TODAY_TEXT = "понедельник, 9 ноября 2026 года";
export const TIMEZONE = "Europe/Moscow";

export const knownCards: Record<string, string> = {
  andrey_smirnov: "Андрей Смирнов — человек: разработчик в моей команде, делает API для проекта «Склад 2.0»",
  andrey_kovalev: "Андрей Ковалёв — человек: менеджер по закупкам в ООО «Вектор»",
  igor_belov: "Игорь Белов — человек: руководитель отдела продаж",
  olga_li: "Ольга Ли — человек: менеджер по работе с клиентами в «Альфа-Логистике»",
  marina_orlova: "Марина Орлова — человек: дизайнер в моей команде",
  vector: "ООО «Вектор» — организация: поставщик оборудования",
  alfa_logistics: "«Альфа-Логистика» — организация: наш перевозчик",
  sklad: "«Склад 2.0» — проект: новая складская система",
};

export type Kind = "fact" | "event" | "commitment" | "rule";
export type When =
  | { date: string; precision: "day" }
  | { month: string; precision: "month" }
  | { from: string; to: string; precision: "week" };

export interface Expect {
  kind: Kind | Kind[];
  /** Refs that must be the subject (fact, rule) or among the participants (event). "new" = a new entity. */
  about?: string[];
  debtor?: string | string[];
  creditor?: string;
  /** When it happened / became true (fact, event) or when the promise was made (commitment). */
  when?: When;
  due?: When;
  intervalDays?: number[];
}

export interface ExtractCase {
  text: string;
  expect: Expect[];
}

const day = (date: string): When => ({ date, precision: "day" });
const month = (m: string): When => ({ month: m, precision: "month" });

export const extractCases: ExtractCase[] = [
  { text: "Андрей пообещал мне закончить API к пятнице.", expect: [{ kind: "commitment", debtor: "andrey_smirnov", creditor: "user", due: day("2026-11-13") }] },
  { text: "Я обещал Марине прислать отзыв на её презентацию до среды.", expect: [{ kind: "commitment", debtor: "user", creditor: "marina_orlova", due: day("2026-11-11") }] },
  { text: "Во вторник отправили «Вектору» коммерческое предложение, ждём ответа.", expect: [
    { kind: "event", about: ["vector"], when: day("2026-11-03") },
    { kind: "commitment", debtor: "vector", creditor: "user" },
  ] },
  { text: "Игорь теперь руководит отделом продаж.", expect: [{ kind: ["fact", "event"], about: ["igor_belov"] }] },
  { text: "Проект «Склад 2.0» перешёл в тестирование.", expect: [{ kind: "fact", about: ["sklad"] }] },
  { text: "Напоминай мне про встречи один на один с каждым из моей команды раз в две недели.", expect: [{ kind: "rule", intervalDays: [14] }] },
  { text: "Если контрагент не отвечает больше пяти рабочих дней — подсвечивай это в плане.", expect: [{ kind: "rule", intervalDays: [5, 7] }] },
  { text: "Вчера созвонились с Ольгой из «Альфа-Логистики», договорились о пилоте на три месяца.", expect: [{ kind: "event", about: ["olga_li"], when: day("2026-11-08") }] },
  { text: "У Марины в декабре начинается декретный отпуск.", expect: [{ kind: ["fact", "event"], about: ["marina_orlova"], when: month("2026-12") }] },
  { text: "Ольга любит, когда ей пишут коротко и по делу.", expect: [{ kind: "fact", about: ["olga_li"] }] },
  { text: "Игорь прислал смету вчера вечером.", expect: [{ kind: "event", about: ["igor_belov"], when: day("2026-11-08") }] },
  { text: "На днях виделся с Андреем Смирновым, обсудили его развитие.", expect: [{ kind: "event", about: ["andrey_smirnov"], when: { from: "2026-11-02", to: "2026-11-08", precision: "week" } }] },
  { text: "В начале октября поставщик упаковки поднял цены на 8%.", expect: [{ kind: ["event", "fact"], about: ["new"], when: month("2026-10") }] },
  { text: "Мы с Мариной договорились, что я согласую бюджет до конца месяца.", expect: [{ kind: "commitment", debtor: "user", creditor: "marina_orlova", due: day("2026-11-30") }] },
  { text: "«Вектор» подписал договор 3 ноября.", expect: [{ kind: "event", about: ["vector"], when: day("2026-11-03") }] },
  { text: "Петров ушёл из компании в сентябре.", expect: [{ kind: ["event", "fact"], about: ["new"], when: month("2026-09") }] },
  { text: "Встречу с инвесторами перенесли на 20 ноября.", expect: [{ kind: "event", when: day("2026-11-20") }] },
  { text: "Ольга обещала прислать договор, но так и не прислала.", expect: [{ kind: "commitment", debtor: "olga_li", creditor: "user" }] },
  { text: "Марина попросила меня подписать её заявление на отпуск до пятницы.", expect: [{ kind: "commitment", debtor: "user", creditor: "marina_orlova", due: day("2026-11-13") }] },
  { text: "Андрей Смирнов обещал Игорю помочь с миграцией базы.", expect: [{ kind: "commitment", debtor: "andrey_smirnov", creditor: "igor_belov" }] },
  { text: "Наш главный бухгалтер — Светлана Петровна.", expect: [{ kind: "fact", about: ["new"] }] },
  { text: "В прошлый вторник Ковалёв сказал, что отгрузка будет через две недели.", expect: [
    { kind: "commitment", debtor: ["andrey_kovalev", "vector"], creditor: "user", when: day("2026-11-03"), due: day("2026-11-17") },
  ] },
  { text: "Позавчера Игорь сказал, что перешлёт контракт к 1 декабря.", expect: [
    { kind: "commitment", debtor: "igor_belov", creditor: "user", when: day("2026-11-07"), due: day("2026-12-01") },
  ] },
  { text: "Договорились с Ольгой созвониться через две недели.", expect: [{ kind: ["event", "commitment"], about: ["olga_li"], when: day("2026-11-23") }] },
  { text: "Марина в отпуске с 16 по 27 ноября.", expect: [{ kind: ["fact", "event"], about: ["marina_orlova"], when: day("2026-11-16") }] },
  { text: "Андрей Ковалёв в октябре перешёл из «Вектора» в «Альфа-Логистику».", expect: [{ kind: ["fact", "event"], about: ["andrey_kovalev"], when: month("2026-10") }] },
  { text: "Хочу видеться с Игорем раз в неделю.", expect: [{ kind: "rule", about: ["igor_belov"], intervalDays: [7] }] },
  { text: "Забыл сказать: в среду встречался с Андреем Смирновым один на один.", expect: [{ kind: "event", about: ["andrey_smirnov"], when: day("2026-11-04") }] },
  // Nothing to record: the stage must return no items.
  { text: "Посчитай, сколько будет 15% от 240 тысяч.", expect: [] },
  { text: "Сделай мне план на неделю.", expect: [] },
];
