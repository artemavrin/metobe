// What 0.6.0 brings, as a person reads it: what they can do now, in their words, not the commits. The pictures are
// neutral demos (round 1 had screenshots of the dev data — removed). `admin` — only admins see the item.

export const RELEASE = { date: "3 ноября", version: "v0.6.0" };

export interface Change {
  id: string;
  title: string;
  /** A word or two: the star's name on the cover. */
  short?: string;
  text: string;
  /** Has a picture (round 1: which demo stands for it); without one the change goes to «И ещё». */
  shot?: string;
  admin?: boolean;
}

export const CHANGES: Change[] = [
  {
    id: "share",
    short: "Поделиться",
    shot: "share",
    text: "Включите доступ по ссылке — коллега увидит чат целиком и всё, что вы допишете потом. Ссылка открывается только внутри Metobe, а продолжить разговор коллега сможет в своей копии.",
    title: "Чат можно отправить коллеге",
  },
  {
    id: "ask",
    short: "Уточнение",
    shot: "ask",
    text: "Если ответ зависит от того, что знаете только вы — период, получатель письма, нужный отчёт, — модель сначала спросит. Выберите вариант, напишите свой или оставьте выбор ей.",
    title: "Модель переспросит, а не угадает",
  },
  {
    id: "map",
    short: "Карта чата",
    shot: "map",
    text: "Слева от длинного чата — полоска, по штриху на каждый вопрос. Наведите — увидите вопрос и начало ответа, щёлкните — перейдёте к нему.",
    title: "У длинного чата есть карта",
  },
  {
    id: "welcome",
    short: "Приветствие",
    shot: "new-chat",
    text: "Новый чат встречает по времени суток и с фразой дня. А если зажать мышь на пустом месте — увидите сами.",
    title: "Каждый день — новое приветствие",
  },
  {
    id: "end",
    short: "Вывод",
    text: "Даже после долгой работы с данными ответ заканчивается выводом, а не тишиной",
    title: "Ответ не обрывается",
  },
  { id: "header",
    short: "Шапка", text: "Название чата меняется щелчком прямо в шапке", title: "Шапка чата" },
  { id: "sidebar",
    short: "Панель", text: "Новый чат открывается карандашом рядом с логотипом, а сам логотип ведёт на главную", title: "Боковая панель" },
  {
    admin: true,
    id: "instructions",
    text: "У MCP-сервера можно задать инструкцию, которую видит только модель: с чего начинать и что предлагать самой",
    title: "Инструкция для модели",
  },
  {
    admin: true,
    id: "local",
    text: "Источники на своём железе (localhost, частная сеть, .local) сами отмечаются как локальные",
    title: "Локальные источники",
  },
];
