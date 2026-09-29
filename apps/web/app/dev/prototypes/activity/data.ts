// P4 · «Активность ответа»: что модель делает, пока отвечает. Шаги только те, что у нас есть: мысли, веб-поиск, чтение
// страницы, вызов тула сервера MCP, письмо. У каждого шага — его время; токены известны только по окончании ответа.

export type StepKind = "think" | "search" | "tools" | "fetch" | "tool" | "mail";
export type StepState = "running" | "done" | "waiting" | "error" | "denied" | "stopped";

export type Step = {
  id: string;
  kind: StepKind;
  /** Сколько шаг идёт, мс. */
  ms: number;
  /** think: то, что модель пишет себе. */
  text?: string;
  /** search (the web) and tools (a big server's tools looked for): what was asked; `results` — what was found */
  query?: string;
  results?: { title: string; host: string }[];
  /** fetch */
  url?: string;
  title?: string;
  /** tool: префикс сервера, имя тула, аргументы и то, что он вернул. */
  server?: string;
  tool?: string;
  args?: [string, string][];
  rows?: [string, string][];
  /** tool: what went in as JSON, and what came back as text — the long form, as the chat shows a call. */
  input?: string;
  output?: string;
  /** mail: письмо, которое ждёт разрешения. */
  mail?: { to: string; subject: string; body: string };
  approval?: boolean;
  /** Шаг закончился ошибкой: причина и что делать. */
  fail?: { reason: string; hint: string; /** A button to fix it, when there is somewhere to go. */ action?: string };
};

export type Scenario = {
  id: string;
  label: string;
  question: string;
  steps: Step[];
  answer: string;
  answerDenied?: string;
  answerFailed?: string;
  tokens: number;
};

const STOCK: Step = {
  args: [
    ["склад", "Калуга"],
    ["номенклатура", "Стул Ergo"],
  ],
  id: "stock",
  kind: "tool",
  ms: 1600,
  rows: [
    ["Стул Ergo, чёрный", "14 шт."],
    ["Стул Ergo, серый", "3 шт."],
  ],
  server: "1С",
  tool: "get_stock",
};

const THINK_1: Step = {
  id: "t1",
  kind: "think",
  ms: 1800,
  text: "Нужны две вещи: остаток на складе в Калуге и срок ближайшей поставки. Остаток возьму из 1С, срок поищу в открытых источниках: у поставщика на сайте бывает график отгрузок.",
};

const SEARCH: Step = {
  id: "s1",
  kind: "search",
  ms: 2100,
  query: "Ergo Office сроки поставки стульев",
  results: [
    { host: "ergo-office.ru", title: "Доставка и сроки — Ergo Office" },
    { host: "ergo-office.ru", title: "Как заказать оптом" },
    { host: "mebel-vestnik.ru", title: "Складская программа на 2026 год" },
  ],
};

const FETCH: Step = {
  id: "f1",
  kind: "fetch",
  ms: 1500,
  title: "Доставка и сроки — Ergo Office",
  url: "https://ergo-office.ru/delivery",
};

const THINK_2: Step = {
  id: "t2",
  kind: "think",
  ms: 1200,
  text: "Серых осталось три, при обычном спросе это примерно на неделю. По графику поставщика ближайшая отгрузка в Калугу — 8 октября.",
};

const MAIL: Step = {
  approval: true,
  id: "m1",
  kind: "mail",
  mail: {
    body: "Здравствуйте! По складу в Калуге осталось три серых стула Ergo. Просим включить в ближайшую отгрузку 40 штук. Спасибо.\n\nАнна Смирнова",
    subject: "Срочный дозаказ: стул Ergo, серый",
    to: "snab@ergo-office.ru",
  },
  ms: 1400,
};

const ANSWER =
  "В Калуге осталось 14 чёрных и 3 серых стула Ergo. Трёх серых хватит примерно на неделю. По графику поставщика ближайшая отгрузка в Калугу — 8 октября, поэтому серые лучше дозаказать сейчас.";

const QUESTION = "Сколько у нас осталось стульев Ergo на складе в Калуге и когда ждать поставку?";

const WAREHOUSES: [string, string][] = [
  ["Москва", "21 шт."],
  ["Тула", "0 шт."],
  ["Рязань", "8 шт."],
  ["Смоленск", "5 шт."],
];


const META_ERROR =
  "Объект метаданных не найден: РегистрНакопления.Продажи. Полное имя пишется как \"Справочник.Абоненты\", \"Документ.Заказ\", \"РегистрНакопления.Продажи\". Список доступных объектов — list_metadata.";

const metaCall = (n: number, detail: string, search?: string): Step => ({
  args: [["fullName", "РегистрНакопления.Продажи"]],
  fail: {
    hint: "Список доступных объектов — list_metadata.",
    reason: META_ERROR,
  },
  id: `h-m${n}`,
  input: JSON.stringify(
    {
      detail,
      fullName: "РегистрНакопления.Продажи",
      include: ["virtualTables", "dataPeriod"],
      search: search ?? "продажи",
    },
    null,
    2
  ),
  kind: "tool",
  ms: 800,
  output: META_ERROR,
  server: "1С",
  tool: "describe_metadata",
});

const toolsSearch = (n: number, query: string, found: string[]): Step => ({
  id: `h-q${n}`,
  kind: "tools",
  ms: 700,
  query,
  results: found.map((title) => ({ host: "1С", title })),
});

export const SCENARIOS: Scenario[] = [
  {
    answer: ANSWER,
    id: "plain",
    label: "Обычный",
    question: QUESTION,
    steps: [THINK_1, STOCK, SEARCH, FETCH, THINK_2],
    tokens: 5240,
  },
  {
    answer: `${ANSWER} Письмо поставщику отправлено.`,
    answerDenied: `${ANSWER} Письмо поставщику не отправлено: черновик остался выше.`,
    id: "approval",
    label: "Подтверждение",
    question: QUESTION,
    steps: [THINK_1, STOCK, SEARCH, FETCH, THINK_2, MAIL],
    tokens: 6120,
  },
  {
    answer: ANSWER,
    answerFailed:
      "Остаток из 1С получить не удалось: сервер отклонил ключ. По графику поставщика ближайшая отгрузка в Калугу — 8 октября. Переподключите 1С — и я проверю остаток.",
    id: "error",
    label: "Ошибка",
    question: QUESTION,
    steps: [
      THINK_1,
      {
        ...STOCK,
        fail: {
          action: "Подключения",
          hint: "Переподключите сервер в разделе «Подключения» — тогда остаток можно будет проверить.",
          reason: "Сервер «1С» отклонил ключ: он отозван.",
        },
        ms: 900,
        rows: undefined,
      },
      SEARCH,
      FETCH,
      THINK_2,
    ],
    tokens: 4380,
  },
  {
    answer:
      "Свободные серые стулья Ergo: Калуга — 3, Москва — 21, Тула — 0, Рязань — 8, Смоленск — 5. Ближайшая отгрузка поставщика — 8 октября, на этот день в Калуге обещают дождь без сильного ветра, так что задержек быть не должно. Из Москвы можно перебросить на Калугу 15 штук уже сегодня.",
    id: "long",
    label: "Длинный",
    question: "Где сейчас свободные серые стулья Ergo, и не сорвётся ли поставка 8 октября?",
    steps: [
      {
        id: "l-t1",
        kind: "think",
        ms: 1500,
        text: "Нужно свести остатки по всем складам и понять, дойдёт ли отгрузка 8 октября. Остатки — по каждому складу из 1С, график — на сайте поставщика, погоду — отдельным запросом.",
      },
      { ...STOCK, id: "l-s1", ms: 800 },
      ...WAREHOUSES.map(
        ([city, count], i): Step => ({
          ...STOCK,
          args: [
            ["склад", city],
            ["номенклатура", "Стул Ergo"],
          ],
          id: `l-s${i + 2}`,
          ms: 800,
          rows: [["Стул Ergo, серый", count]],
        })
      ),
      { ...SEARCH, id: "l-q1", ms: 1700 },
      { ...FETCH, id: "l-f1", ms: 1200 },
      {
        ...FETCH,
        id: "l-f2",
        ms: 1300,
        title: "Как заказать оптом",
        url: "https://ergo-office.ru/wholesale",
      },
      {
        ...FETCH,
        id: "l-f3",
        ms: 1100,
        title: "Складская программа на 2026 год",
        url: "https://mebel-vestnik.ru/sklad-2026",
      },
      {
        args: [
          ["город", "Калуга"],
          ["дата", "8 октября"],
        ],
        id: "l-w1",
        kind: "tool",
        ms: 900,
        rows: [["8 октября", "+9 °C, дождь, ветер 4 м/с"]],
        server: "Погода",
        tool: "forecast",
      },
      { ...THINK_2, id: "l-t2", ms: 1100 },
    ],
    tokens: 11_840,
  },
  {
    answer:
      "Метаданные получить не удалось: объект «РегистрНакопления.Продажи» в базе не найден. Могу вывести список доступных объектов — скажите, если нужно.",
    id: "heavy",
    label: "Тяжёлый",
    question: "Проанализируй продажи по управлению торговлей за квартал",
    steps: [
      {
        id: "h-t1",
        kind: "think",
        ms: 1300,
        text: "Нужно найти в 1С регистр продаж и понять его состав. Сначала поищу инструменты сервера, потом запрошу метаданные регистра.",
      },
      toolsSearch(1, "Управление торговлей анализ", []),
      toolsSearch(2, "Управление торговлей отчёт", []),
      toolsSearch(3, "Управление торговлей анализ продаж", []),
      toolsSearch(4, "Управление торговлей отчёт по продажам", [
        "describe_metadata",
        "list_metadata",
        "query_register",
        "get_report",
        "run_query",
      ]),
      metaCall(1, "full"),
      metaCall(2, "brief"),
      metaCall(3, "full", "продажи"),
      metaCall(4, "brief", "продажи по месяцам"),
      metaCall(5, "full", "квартал"),
      metaCall(6, "brief", "оборот"),
      {
        id: "h-t2",
        kind: "think",
        ms: 900,
        text: "Регистр не находится ни под каким именем. Не буду гадать: скажу об этом и предложу список объектов.",
      },
    ],
    answerFailed:
      "Метаданные получить не удалось: объект «РегистрНакопления.Продажи» в базе не найден. Могу вывести список доступных объектов — скажите, если нужно.",
    tokens: 12_400,
  },
];
