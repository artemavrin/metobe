"use client";

import { Badge } from "@metobe/ui/components/reui/badge";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import { Input } from "@metobe/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@metobe/ui/components/toggle-group";
import {
  Check,
  CircleUserRound,
  ChevronRight,
  Columns3,
  ListChecks,
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
  Unplug,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

// Every prototype of the project in one list: what is chosen (and which variant), what is still being chosen, and
// the reference pages. Prototypes are never deleted after the choice — this list is where the choice is written down.
// To add one: an entry below with its area, and — once picked — `chosen` naming the variant.

type Status = "chosen" | "open" | "reference";
type Area = "start" | "settings" | "chat" | "reference";

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
  chat: "Чат",
  reference: "Справочно",
  settings: "Настройки и аккаунт",
  start: "Вход и первый запуск",
};

const ENTRIES: Entry[] = [
  { about: "Вход по коду и ссылке из письма", area: "start", chosen: "«· срез»", href: "/dev/prototypes/login", icon: LogIn, status: "chosen", title: "Страница входа" },
  { about: "Первый вход: подключение источника и модели", area: "start", chosen: "«Шаги», финал «Залп»", href: "/dev/prototypes/onboarding", icon: Rocket, status: "chosen", title: "Онбординг" },
  { about: "Источники, провайдеры и модели: список и деталь", area: "settings", chosen: "«Погружение»", href: "/dev/prototypes/providers", icon: Server, status: "chosen", title: "Источники, провайдеры и модели" },
  { about: "Возможности, цены и сведения о модели", area: "settings", chosen: "Плавающая панель с вкладками", href: "/dev/prototypes/model-editor", icon: SlidersHorizontal, status: "chosen", title: "Редактор модели" },
  { about: "Меню и списки разделов, шапка, телефон", area: "settings", chosen: "«Погружение»", href: "/dev/prototypes/settings-layout", icon: Columns3, status: "chosen", title: "Раскладка настроек" },
  { about: "Личные учётные данные к серверам с инструментами", area: "settings", chosen: "«Погружение · 2»", href: "/dev/prototypes/my-connections", icon: Plug, status: "chosen", title: "Мои подключения" },
  { about: "Профиль, персонализация, сеансы и данные под общей шапкой", area: "settings", chosen: "«Сплошная»", href: "/dev/prototypes/account", icon: UserRound, status: "chosen", title: "Аккаунт" },
  { about: "Что открывается из строки с аватаром внизу боковой панели: тема, язык, переходы, выход", area: "chat", chosen: "«В одну строку»", href: "/dev/prototypes/account-menu", icon: CircleUserRound, status: "chosen", title: "Меню аккаунта" },
  { about: "Чем ограничить высоту ленты шагов: окно, каждый шаг, одна строка или полоса и сцена", area: "chat", chosen: "«Каждый шаг»", href: "/dev/prototypes/activity-height", icon: ListChecks, status: "chosen", title: "Высота ленты" },
  { about: "Что модель делает, пока отвечает: шаги, подтверждение, итог; лента, строка или панель", area: "chat", chosen: "«Лента», без рамки и «Остановить»", href: "/dev/prototypes/activity", icon: ListChecks, status: "chosen", title: "Активность ответа" },
  { about: "Чат с лёгким боковым меню; настройки отдельным режимом", area: "chat", chosen: "«Режимы»", href: "/dev/prototypes/app-shell", icon: PanelsTopLeft, status: "chosen", title: "Оболочка приложения" },
  { about: "Поле ввода и выбор модели", area: "chat", chosen: "«Избранное + палитра»", href: "/dev/prototypes/composer", icon: MessageSquare, status: "chosen", title: "Поле ввода и выбор модели" },
  { about: "Просьба подключить сервис прямо в ответе", area: "chat", chosen: "«Плашка»", href: "/dev/prototypes/request-connection", icon: Unplug, status: "chosen", title: "Запрос подключения из чата" },
  { about: "Графики evilcharts (ECharts) на наших данных и цветах темы: площадь, линия, столбцы, радар, круговая", area: "reference", href: "/dev/prototypes/evilcharts", icon: LayoutDashboard, status: "reference", title: "Графики evilcharts" },
  { about: "Компоненты ReUI и shadcn в теме Metobe", area: "reference", href: "/dev/showcase", icon: LayoutDashboard, status: "reference", title: "Дизайн-система" },
];

const STATUS: Record<Status, { label: string; variant: "success-light" | "warning-light" | "secondary" }> = {
  chosen: { label: "Выбрано", variant: "success-light" },
  open: { label: "Выбираем", variant: "warning-light" },
  reference: { label: "Справочно", variant: "secondary" },
};

type Filter = "all" | Status;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "open", label: "Выбираем" },
  { id: "chosen", label: "Выбрано" },
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
