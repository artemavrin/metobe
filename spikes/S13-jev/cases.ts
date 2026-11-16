// Russian memory decisions with known answers (D39, S13). `undefined` in a label means «ambiguous, not scored».
// Today in every state is Monday 2026-11-09.

export const TODAY = "понедельник, 9 ноября 2026";

/** The chat before a message, as the app passes it: the person's earlier message, then the answer. */
export const exchange = (b: { user?: string; assistant?: string } = {}) => [
  ...(b.user ? [{ role: "user" as const, text: b.user }] : []),
  ...(b.assistant ? [{ role: "assistant" as const, text: b.assistant }] : []),
];

export type Direction =
  | "user_owes"
  | "owed_to_user"
  | "between_others"
  | "none";
export type Precision = "day" | "week" | "month" | "none";

export interface GateCase {
  text: string;
  remember: boolean;
  fact?: boolean;
  event?: boolean;
  commitment?: boolean;
  rule?: boolean;
  direction?: Direction;
  precision?: Precision;
}

// Gate: is there anything to remember, and what kind.
export const gate: GateCase[] = [
  { text: "Андрей пообещал мне закончить API к пятнице.", remember: true, fact: false, commitment: true, rule: false, direction: "owed_to_user", precision: "day" },
  { text: "Я обещал Марине прислать отзыв на её презентацию до среды.", remember: true, fact: false, commitment: true, rule: false, direction: "user_owes", precision: "day" },
  { text: "Во вторник отправили ООО «Вектор» коммерческое предложение, ждём ответа.", remember: true, event: true, rule: false, precision: "day" },
  { text: "Игорь теперь руководит отделом продаж.", remember: true, fact: true, commitment: false, rule: false, direction: "none" },
  { text: "Проект «Склад 2.0» перешёл в тестирование.", remember: true, fact: true, commitment: false, rule: false, direction: "none" },
  { text: "Напоминай мне про встречи один на один с каждым из моей команды раз в две недели.", remember: true, fact: false, event: false, commitment: false, rule: true },
  { text: "Если контрагент не отвечает больше пяти рабочих дней — подсвечивай это в плане.", remember: true, fact: false, event: false, commitment: false, rule: true },
  { text: "Посчитай, сколько будет 15% от 240 тысяч.", remember: false, fact: false, event: false, commitment: false, rule: false, direction: "none", precision: "none" },
  { text: "Переведи на английский: «Мы рады сотрудничеству и ждём вашего ответа».", remember: false, fact: false, event: false, commitment: false, rule: false, direction: "none", precision: "none" },
  { text: "Спасибо, отлично!", remember: false, fact: false, event: false, commitment: false, rule: false, direction: "none", precision: "none" },
  { text: "Какая погода в Казани завтра?", remember: false, fact: false, event: false, commitment: false, rule: false, direction: "none" },
  { text: "Сделай таблицу расходов по месяцам из вложения.", remember: false, fact: false, event: false, commitment: false, rule: false, direction: "none", precision: "none" },
  { text: "Вчера созвонились с Ольгой из «Альфа-Логистики», договорились о пилоте на три месяца.", remember: true, event: true, rule: false, precision: "day" },
  { text: "У Марины в декабре начинается декретный отпуск.", remember: true, fact: true, rule: false, direction: "none", precision: "month" },
  { text: "Ольга любит, когда ей пишут коротко и по делу.", remember: true, fact: true, event: false, commitment: false, rule: false, direction: "none", precision: "none" },
  { text: "Игорь прислал смету вчера вечером.", remember: true, event: true, commitment: false, rule: false, precision: "day" },
  { text: "На днях виделся с Андреем, обсудили его развитие.", remember: true, event: true, commitment: false, rule: false, direction: "none", precision: "week" },
  { text: "В начале октября поставщик упаковки поднял цены на 8%.", remember: true, commitment: false, rule: false, direction: "none", precision: "month" },
  { text: "У Ольги день рождения 14 ноября.", remember: true, fact: true, event: false, commitment: false, rule: false, direction: "none", precision: "day" },
  { text: "Что ты знаешь про Андрея?", remember: false, fact: false, event: false, commitment: false, rule: false, direction: "none", precision: "none" },
  { text: "Мы с Мариной договорились, что я согласую бюджет до конца месяца.", remember: true, commitment: true, rule: false, direction: "user_owes" },
  { text: "Андрей опять не сдал отчёт вовремя.", remember: true, rule: false },
  { text: "«Вектор» подписал договор 3 ноября.", remember: true, event: true, commitment: false, rule: false, direction: "none", precision: "day" },
  { text: "Петров ушёл из компании в сентябре.", remember: true, commitment: false, rule: false, direction: "none", precision: "month" },
  { text: "Встречу с инвесторами перенесли на 20 ноября.", remember: true, rule: false, precision: "day" },
  { text: "Сделай мне план на неделю.", remember: false, fact: false, event: false, commitment: false, rule: false, direction: "none" },
  { text: "Запомни: я не пью кофе после обеда.", remember: true, fact: true, event: false, commitment: false, rule: false, direction: "none", precision: "none" },
  { text: "Раз в месяц хочу проверять дебиторскую задолженность.", remember: true, fact: false, event: false, commitment: false, rule: true },
  { text: "Ок, понял.", remember: false, fact: false, event: false, commitment: false, rule: false, direction: "none", precision: "none" },
  { text: "Ольга обещала прислать договор, но так и не прислала.", remember: true, commitment: true, rule: false, direction: "owed_to_user" },
  { text: "Сколько токенов съел вчерашний чат?", remember: false, fact: false, event: false, commitment: false, rule: false, direction: "none" },
  { text: "Марина попросила меня подписать её заявление на отпуск до пятницы.", remember: true, commitment: true, rule: false, direction: "user_owes", precision: "day" },
  { text: "Андрей обещал Игорю помочь с миграцией базы.", remember: true, commitment: true, rule: false, direction: "between_others", precision: "none" },
  { text: "Что значит EBITDA?", remember: false, fact: false, event: false, commitment: false, rule: false, direction: "none", precision: "none" },
  { text: "Наш главный бухгалтер — Светлана Петровна.", remember: true, fact: true, event: false, commitment: false, rule: false, direction: "none", precision: "none" },
  { text: "Напиши вежливый отказ поставщику, который предложил слишком высокую цену.", remember: false, fact: false, commitment: false, rule: false, direction: "none", precision: "none" },
];

// Which known card the message is about.
export const cards: Record<string, string> = {
  andrey_smirnov: "Андрей Смирнов — разработчик в моей команде, делает API для проекта «Склад 2.0»",
  andrey_kovalev: "Андрей Ковалёв — менеджер по закупкам в ООО «Вектор» (поставщик оборудования)",
  igor_belov: "Игорь Белов — руководитель отдела продаж",
  olga_li: "Ольга Ли — менеджер по работе с клиентами в «Альфа-Логистике»",
  marina_orlova: "Марина Орлова — дизайнер в моей команде",
  vector: "ООО «Вектор» — поставщик оборудования (организация)",
  alfa_logistics: "«Альфа-Логистика» — наш перевозчик (организация)",
  new: "Человек или организация, которых нет среди известных карточек",
  unclear: "Подходит больше одной карточки, по сообщению не понять, какая",
};

export const entity: { text: string; expected: string }[] = [
  { text: "Андрей из «Вектора» прислал новый прайс.", expected: "andrey_kovalev" },
  { text: "Андрей закоммитил исправление в складском API.", expected: "andrey_smirnov" },
  { text: "Андрей завтра в отпуске.", expected: "unclear" },
  { text: "Созвонились с Игорем по плану продаж на декабрь.", expected: "igor_belov" },
  { text: "Ольга прислала новые тарифы на перевозку.", expected: "olga_li" },
  { text: "Наталья из бухгалтерии просит подписать акт.", expected: "new" },
  { text: "Смирнов не успевает с API.", expected: "andrey_smirnov" },
  { text: "Марина нарисовала новые макеты главной страницы.", expected: "marina_orlova" },
  { text: "Ковалёв просит отсрочку платежа.", expected: "andrey_kovalev" },
  { text: "Новый разработчик Павел выходит в понедельник.", expected: "new" },
  { text: "Позвонил закупщик от поставщика оборудования, просит подтвердить заказ.", expected: "andrey_kovalev" },
  { text: "Наш перевозчик снова задержал машину на два дня.", expected: "alfa_logistics" },
  { text: "Андрей обещал закончить API к пятнице.", expected: "andrey_smirnov" },
];

// Open commitments and which of them a message closes.
export const commitments: Record<string, string> = {
  c1: "Игорь Белов должен мне смету по проекту «Склад 2.0», срок 12 ноября",
  c2: "Я должен Марине Орловой отзыв на её презентацию, срок 11 ноября",
  c3: "ООО «Вектор» должно ответить на наше коммерческое предложение",
  c4: "Андрей Смирнов должен закончить API к 13 ноября",
  c5: "Ольга Ли из «Альфа-Логистики» должна прислать подписанный договор",
};

export const closing: { text: string; closes: string[] }[] = [
  { text: "Игорь прислал смету вчера вечером.", closes: ["c1"] },
  { text: "Отправил Марине комментарии по презентации.", closes: ["c2"] },
  { text: "«Вектор» ответил: готовы работать по нашей цене.", closes: ["c3"] },
  { text: "Андрей говорит, что API будет готов только к следующей среде.", closes: [] },
  { text: "Ольга прислала скан подписанного договора, а Игорь пока молчит.", closes: ["c5"] },
  { text: "Игорь прислал черновик сметы, но без раздела по оборудованию — доделает к четвергу.", closes: [] },
  { text: "Сегодня закрыли всё: смету от Игоря получили, отзыв Марине я отправил.", closes: ["c1", "c2"] },
  { text: "«Вектор» так и не ответил.", closes: [] },
  { text: "API выкатили в прод, Андрей молодец.", closes: ["c4"] },
  { text: "Обсудили с Ольгой цены на перевозку в декабре.", closes: [] },
];

// How a new statement relates to the current fact.
export const relations: Record<string, string> = {
  replaces: "Новое состояние: текущий факт перестаёт быть верным с этого момента",
  history: "Прошлое состояние: верно было раньше, текущий факт не меняет",
  correction: "Исправление ошибки: текущий факт был записан неверно",
  addition: "Другой факт о том же: текущий не затрагивает",
};

export const temporal: { current: string; text: string; expected: string }[] = [
  { current: "Проект «Склад 2.0»: этап — тестирование (с 2 ноября)", text: "В сентябре «Склад 2.0» был на этапе дизайна.", expected: "history" },
  { current: "Проект «Склад 2.0»: этап — тестирование (с 2 ноября)", text: "«Склад 2.0» вышел в продакшен.", expected: "replaces" },
  { current: "Игорь Белов — руководитель отдела продаж (с 1 марта)", text: "Игорь с понедельника возглавляет коммерческий департамент.", expected: "replaces" },
  { current: "Встреча с Андреем Смирновым: среда, 4 ноября", text: "Ошибся: встреча с Андреем была в четверг, а не в среду.", expected: "correction" },
  { current: "Марина Орлова — дизайнер в моей команде", text: "Марина любит работать по утрам.", expected: "addition" },
  { current: "Ольга Ли — менеджер в «Альфа-Логистике»", text: "До прошлого года Ольга работала в «Векторе».", expected: "history" },
  { current: "Срок сметы от Игоря: 12 ноября", text: "Игорь попросил перенести смету на 15 ноября, я согласился.", expected: "replaces" },
  { current: "Срок сметы от Игоря: 12 ноября", text: "Нет, срок по смете был 13-е, я неправильно записал.", expected: "correction" },
  { current: "Андрей Смирнов — разработчик в моей команде", text: "Андрей Смирнов увлекается бегом.", expected: "addition" },
  { current: "Поставщик упаковки: 120 ₽ за коробку (с 1 октября)", text: "Летом коробка у поставщика упаковки стоила 110 ₽.", expected: "history" },
];
