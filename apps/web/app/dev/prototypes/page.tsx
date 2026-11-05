"use client";

import { Badge } from "@metobe/ui/components/reui/badge";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import { Input } from "@metobe/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@metobe/ui/components/toggle-group";
import {
  Bot,
  CalendarClock,
  ChartColumn,
  Inbox,
  Check,
  Gauge,
  CircleUserRound,
  ChevronRight,
  Columns3,
  Command,
  ListChecks,
  MessageCircleQuestion,
  MessageSquare,
  PanelsTopLeft,
  Plug,
  Rocket,
  Search,
  Server,
  SlidersHorizontal,
  UserRound,
  LayoutDashboard,
  LogIn,
  Mail,
  Unplug,
  Paperclip,
  Pencil,
  PencilLine,
  RefreshCw,
  ScrollText,
  Gift,
  FoldVertical,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

// Every prototype of the project in one list: what is chosen (and which variant), what is still being chosen, and
// the reference pages. Prototypes are never deleted after the choice — this list is where the choice is written down.
// To add one: an entry below with its area, and — once picked — `chosen` naming the variant.

type Status = "chosen" | "open" | "paused" | "dropped" | "reference";
type Area = "start" | "settings" | "chat" | "tasks" | "reference";

interface Entry {
  href: string;
  title: string;
  /** One line: what is being drawn. */
  about: string;
  icon: LucideIcon;
  status: Status;
  area: Area;
  /** The variant that was picked and went into the product. */
  chosen?: string;
}

const AREAS: Record<Area, string> = {
  start: "Вход и первый запуск",
  settings: "Настройки и аккаунт",
  chat: "Чат",
  tasks: "Задачи",
  reference: "Справочно",
};

const ENTRIES: Entry[] = [
  { about: "Вход по коду и ссылке из письма", area: "start", chosen: "«· срез»", href: "/dev/prototypes/login", icon: LogIn, status: "chosen", title: "Страница входа" },
  { about: "Письмо с кодом и ссылкой (React Email): код крупно, кнопка, записка или запрос в контексте; клиент светлый и тёмный, ru и en, текстовая часть", area: "start", chosen: "«Код»", href: "/dev/prototypes/sign-in-letter", icon: Mail, status: "chosen", title: "Письмо со входом" },
  { about: "Первый вход: подключение источника и модели", area: "start", chosen: "«Шаги», финал «Залп»", href: "/dev/prototypes/onboarding", icon: Rocket, status: "chosen", title: "Онбординг" },
  { about: "Источники, провайдеры и модели: список и деталь", area: "settings", chosen: "«Погружение»", href: "/dev/prototypes/providers", icon: Server, status: "chosen", title: "Источники, провайдеры и модели" },
  { about: "Возможности, цены и сведения о модели", area: "settings", chosen: "Плавающая панель с вкладками", href: "/dev/prototypes/model-editor", icon: SlidersHorizontal, status: "chosen", title: "Редактор модели" },
  { about: "Меню и списки разделов, шапка, телефон", area: "settings", chosen: "«Погружение»", href: "/dev/prototypes/settings-layout", icon: Columns3, status: "chosen", title: "Раскладка настроек" },
  { about: "Личные учётные данные к серверам с инструментами", area: "settings", chosen: "«Погружение · 2»", href: "/dev/prototypes/my-connections", icon: Plug, status: "chosen", title: "Мои подключения" },
  { about: "Профиль, персонализация, сеансы и данные под общей шапкой", area: "settings", chosen: "«Сплошная»", href: "/dev/prototypes/account", icon: UserRound, status: "chosen", title: "Аккаунт" },
  { about: "Что открывается из строки с аватаром внизу боковой панели: тема, язык, переходы, выход", area: "chat", chosen: "«В одну строку»", href: "/dev/prototypes/account-menu", icon: CircleUserRound, status: "chosen", title: "Меню аккаунта" },
  { about: "Чем ограничить высоту ленты шагов: окно, каждый шаг, одна строка или полоса и сцена", area: "chat", chosen: "«Каждый шаг»", href: "/dev/prototypes/activity-height", icon: ListChecks, status: "chosen", title: "Высота ленты" },
  { about: "Файл в композере и в сообщении: полка, колода, лоток, чипы в строке или стопка", area: "chat", chosen: "«Полка»", href: "/dev/prototypes/attachments", icon: Paperclip, status: "chosen", title: "Вложения в чате" },
  { about: "Правка отправленного сообщения вместе с файлами: на месте, в композере, с последствиями или в окне", area: "chat", chosen: "«На месте», «+» открывает выбор файлов сразу", href: "/dev/prototypes/edit-message", icon: Pencil, status: "chosen", title: "Правка сообщения" },
  { about: "Что модель делает, пока отвечает: шаги, подтверждение, итог; лента, строка или панель", area: "chat", chosen: "«Лента», без рамки и «Остановить»", href: "/dev/prototypes/activity", icon: ListChecks, status: "chosen", title: "Активность ответа" },
  { about: "Чат с лёгким боковым меню; настройки отдельным режимом", area: "chat", chosen: "«Режимы»", href: "/dev/prototypes/app-shell", icon: PanelsTopLeft, status: "chosen", title: "Оболочка приложения" },
  { about: "Поле ввода и выбор модели", area: "chat", chosen: "«Избранное + палитра»", href: "/dev/prototypes/composer", icon: MessageSquare, status: "chosen", title: "Поле ввода и выбор модели" },
  { about: "Вход в MCP-сервер своим логином и паролем, токеном или ключом: шапка сервиса, отдельная страница входа или связка Metobe ↔ сервис; ошибки, проверка, телефон", area: "chat", chosen: "«Вход»: под заголовком описание от админа, без причины от модели", href: "/dev/prototypes/mcp-sign-in", icon: LogIn, status: "chosen", title: "Вход в MCP-сервер" },
  { about: "Модель спрашивает то, что знает только пользователь (период, кому писать), по образцу AskUserQuestion из Claude: вопросы на месте поля ввода, чипы вопросов, свой вариант, проверка перед отправкой; раунд 1 (карточка, кнопки) — /ask-user/round-1", area: "chat", chosen: "«Как у Claude», чипы вопросов — степпер ReUI", href: "/dev/prototypes/ask-user", icon: MessageCircleQuestion, status: "chosen", title: "Вопрос от модели" },
  { about: "Просьба подключить сервис прямо в ответе", area: "chat", chosen: "«Плашка»", href: "/dev/prototypes/request-connection", icon: Unplug, status: "chosen", title: "Запрос подключения из чата" },
  { about: "Падающие звёзды по Animata Shooting Stars: звездопад, редкие, окно, к вопросу, отскок от поля ввода. Пасхалка: зажать 1 с на пустом месте — звёзды летят в курсор, заряд (звезда, созвездие, вихрь, сгусток, чёрная дыра), отпустить — фейерверк; чёрная дыра на максимуме 5 с съедает страницу, за горизонтом — экран про отдых. Раунд 3 — /new-chat/round-3", area: "chat", chosen: "«Отскок»; пасхалка — чёрная дыра и экран за горизонтом", href: "/dev/prototypes/new-chat/round-4", icon: Sparkles, status: "chosen", title: "Фон нового чата: звёзды" },
  { about: "Что под экраном нового чата: точечная сетка, которая чувствует курсор; свет в цвете времени суток, стекающий к полю ввода, пока печатаешь; линии от «Начать с» в поле ввода. Параметры: время суток, меньше движения. Ни один не взяли — дальше звёзды, раунд 4", area: "chat", href: "/dev/prototypes/new-chat/round-3", icon: Sparkles, status: "dropped", title: "Фон нового чата" },
  { about: "По ReUI ai-chat-3: приветствие, «Начать с», «Продолжить»; иллюстрация сверху, сбоку, слева от приветствия, без неё или только в первом чате. Первый раунд — /new-chat/round-1", area: "chat", href: "/dev/prototypes/new-chat", icon: Sparkles, chosen: "«Без картинки»; картинка — в первом чате", status: "chosen", title: "Экран нового чата" },
  { about: "Палитра ⌘K: перейти в чат по названию или словам, в раздел настроек, выполнить действие; окно, окно с превью или поиск в боковой панели", area: "chat", href: "/dev/prototypes/command-palette", icon: Command, chosen: "«В сайдбаре»", status: "chosen", title: "Палитра ⌘K" },
  { about: "Статистика в ответе: числа, динамика, прогресс к цели, доли, разброс, рейтинг; плитки, лента или полоса", area: "chat", chosen: "«Полоса»", href: "/dev/prototypes/metrics", icon: Gauge, status: "chosen", title: "Показатели в ответе" },
  { about: "Ещё формы показателей: кто вырос и упал, Парето / ABC, выбросы, воронка, состав (кольцо или полоса) — по два вида каждой", area: "chat", chosen: "«Кто вырос», «Парето», «Выбросы», «Состав»; воронку не взяли", href: "/dev/prototypes/metrics-forms", icon: Gauge, status: "chosen", title: "Показатели: ещё формы" },
  { about: "Графики evilcharts (ECharts) на наших данных и цветах темы: площадь, линия, столбцы, радар, круговая; как их рисует ответ — /evilcharts/in-answer", area: "reference", href: "/dev/prototypes/evilcharts", icon: LayoutDashboard, status: "reference", title: "Графики evilcharts" },
  { about: "D37 · сжать длинный чат итогом служебной модели: как предложить (тихая строка, карточка с цифрами, чип над полем ввода), как идёт сжатие и как итог выглядит в ленте; вернуть как было", area: "chat", chosen: "«Карточка»", href: "/dev/prototypes/compact", icon: FoldVertical, status: "chosen", title: "Сжатие чата" },
  { about: "Что нового после обновления: окно-тур поверх чата, «Больше не показывать»; раунд 2 — вместо скриншотов сам продукт: потрогать, посмотреть, как его нажимает курсор, или рисунок идеи. Раунд 1 со скриншотами (журнал, тур, оглавление) — /whats-new/round-1", area: "chat", chosen: "«Смотреть»", href: "/dev/prototypes/whats-new", icon: Gift, status: "chosen", title: "Что нового" },
  { about: "Обновление Metobe из приложения: что нового, «сейчас» или «ночью», шаги на сервере, откат, история с копиями базы — и что видит человек в чате", area: "settings", chosen: "«Карточка»", href: "/dev/prototypes/updates", icon: RefreshCw, status: "chosen", title: "О системе: обновления" },
  { about: "Расходы по моделям, людям и дням с графиками; две валюты рядом, без суммы: как у Vercel, обзор с плитками, сводка «кто на чём» или отчёт одним столбцом", area: "settings", chosen: "«Обзор», на телефоне — без мини-графиков в плитках и рейтинги вкладками", href: "/dev/prototypes/usage", icon: ChartColumn, status: "chosen", title: "Расходы" },
  { about: "Лицо агента — «Юнит», настольный робот в Hairline: глаза ведут, голова догоняет курсор, моргает, ^ ^ при наведении; цвет агента — свет глаз на тёмном экране, лампа и полоска. Раунд с «Бобом», «Котиком» и «Роботом» отвергнут. Заменён конвейером в /first-agent: это задачи, не агенты (D38)", area: "tasks", href: "/dev/prototypes/agent-face", icon: Bot, status: "dropped", title: "Лицо агента" },
  { about: "P11 · первая задача (не «агент» — только запуски по расписанию, D38), раунд 3 «В чате»: композер подсвечивает части задачи цветом, Hairline-конвейер (шаг ленты — запуск) загорается цветом задачи: лампа и луч сканера, полоска на итогах, недостающее модель спрашивает тут же, в конце — название и свой цвет. Раунды 1–2 — /first-agent/round-1, /first-agent/round-2", area: "tasks", chosen: "Раунд 3 «В чате», фигура — конвейер", href: "/dev/prototypes/first-agent", icon: CalendarClock, status: "chosen", title: "Первая задача" },
  { about: "P12 · итоги задачи в её чате, раунд 2: свежий запуск сверху, история ниже; итог — обычный ответ модели (таблица цен, список писем, сводка продаж с показателями); «Последний итог» с прошлыми под спойлером, «Лента» или «Журнал»", area: "tasks", chosen: "«Последний итог»: прошлые запуски под спойлером", href: "/dev/prototypes/task-results", icon: ScrollText, status: "chosen", title: "Итоги задачи" },
  { about: "P15 · изменение задачи словами (D28): модель предлагает «было → стало», применяет человек; где появляется предложение — над последним итогом, в боковой панели или в карточке задачи; тестовый запуск, «Вернуть как было»", area: "tasks", chosen: "«Карточка задачи»: изменение в её строках; строки «Создана» внизу нет", href: "/dev/prototypes/task-edit", icon: PencilLine, status: "chosen", title: "Изменение задачи" },
  { about: "P13 · список задач, страница «Задачи»: имя и расписание, итог последнего запуска, следующий запуск, выключатель; строками, карточками или по вниманию (нужно действие, новые итоги, остальные, выключенные); без задач — «Что поручить?» из P11", area: "tasks", chosen: "«По вниманию · 2»: разбор групп прямо в списке", href: "/dev/prototypes/tasks-list", icon: ListChecks, status: "chosen", title: "Список задач" },
  { about: "P13 · до D38, ещё «агенты» · раунд 3: агенты как чаты, агент держит страницу «что сейчас» или сводка всех итогов; фраза с нажимаемыми кусками, «Ждут вас», уведомление с кнопкой. Раунды 1 и 2 — /agents/round-1, /agents/round-2. Заменён новым «Списком задач» (/tasks-list)", area: "tasks", href: "/dev/prototypes/agents", icon: Bot, status: "dropped", title: "Список задач: раунды 1–3" },
  { about: "P12 · до D38, ещё «агенты» · входящие агентов: сводки, вопросы, сбои и подтверждения в одном списке — лентой, как почта или сначала решения. Отдельных входящих нет: итоги приходят в чат задачи (/task-results)", area: "tasks", href: "/dev/prototypes/inbox", icon: Inbox, status: "dropped", title: "Входящие задач" },
  { about: "Компоненты ReUI и shadcn в теме Metobe", area: "reference", href: "/dev/showcase", icon: LayoutDashboard, status: "reference", title: "Дизайн-система" },
];

const STATUS: Record<Status, { label: string; variant: "success-light" | "warning-light" | "secondary" }> = {
  chosen: { label: "Выбрано", variant: "success-light" },
  open: { label: "Выбираем", variant: "warning-light" },
  paused: { label: "Отложено", variant: "secondary" },
  dropped: { label: "Не взяли", variant: "secondary" },
  reference: { label: "Справочно", variant: "secondary" },
};

type Filter = "all" | Status;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "open", label: "Выбираем" },
  { id: "chosen", label: "Выбрано" },
  { id: "paused", label: "Отложено" },
  { id: "dropped", label: "Не взяли" },
  { id: "reference", label: "Справочно" },
];

const Row = ({ entry }: { entry: Entry }) => {
  const { icon: Icon } = entry;
  return (
    <Link
      className="hover:bg-muted/60 flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-150"
      href={entry.href}
    >
      <IconTile size="sm" variant="frame">
        <Icon />
      </IconTile>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{entry.title}</span>
        <span className="text-muted-foreground truncate text-xs">{entry.about}</span>
      </span>
      {entry.chosen ? (
        <Badge className="max-w-44 shrink-0" size="sm" variant="success-light">
          <Check className="size-3 shrink-0" />
          <span className="truncate">{entry.chosen}</span>
        </Badge>
      ) : (
        <Badge size="sm" variant={STATUS[entry.status].variant}>
          {STATUS[entry.status].label}
        </Badge>
      )}
      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
    </Link>
  );
};

const Group = ({ title, entries }: { title: string; entries: Entry[] }) =>
  entries.length === 0 ? null : (
    <section className="flex flex-col gap-1">
      <h2 className="text-muted-foreground px-2.5 text-[11px] font-medium tracking-wide uppercase">
        {title} <span className="tabular-nums">· {entries.length}</span>
      </h2>
      <div className="flex flex-col">
        {entries.map((e) => (
          <Row entry={e} key={e.href} />
        ))}
      </div>
    </section>
  );

const PrototypesIndex = () => {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = ENTRIES.filter(
    (e) =>
      (filter === "all" || e.status === filter) &&
      (!q || `${e.title} ${e.about} ${e.chosen ?? ""}`.toLowerCase().includes(q))
  );
  const count = (id: Filter) => (id === "all" ? ENTRIES.length : ENTRIES.filter((e) => e.status === id).length);
  // Everything still being chosen stands first, apart from the areas: it is what the next visit is for.
  const open = shown.filter((e) => e.status === "open");
  const rest = shown.filter((e) => e.status !== "open");
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Прототипы Metobe</h1>
        <p className="text-muted-foreground text-sm">
          Что выбрано и вошло в продукт, а что ещё выбираем. Варианты внутри прототипа переключаются пилюлей внизу или клавишами 1–9.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup onValueChange={(v) => v[0] && setFilter(v[0] as Filter)} spacing={0} value={[filter]} variant="outline">
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.id} value={f.id}>
              {f.label} <span className="text-muted-foreground ml-1 tabular-nums">{count(f.id)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="relative min-w-40 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input aria-label="Найти прототип" autoComplete="off" className="pl-8" onChange={(e) => setQuery(e.target.value)} placeholder="Найти прототип" value={query} />
        </div>
      </div>
      <Group entries={open} title="Выбираем сейчас" />
      {(Object.keys(AREAS) as Area[]).map((area) => (
        <Group entries={rest.filter((e) => e.area === area)} key={area} title={AREAS[area]} />
      ))}
      {shown.length === 0 && <p className="text-muted-foreground text-sm">Ничего не нашлось.</p>}
    </main>
  );
};

export default PrototypesIndex;
