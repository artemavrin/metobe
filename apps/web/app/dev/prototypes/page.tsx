import { Badge } from "@metobe/ui/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@metobe/ui/components/reui/frame";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@metobe/ui/components/item";
import { ChevronRight, LayoutDashboard, PanelsTopLeft, Rocket, Server } from "lucide-react";
import Link from "next/link";

type Entry = {
  href: string;
  title: string;
  description: string;
  icon: typeof Rocket;
  status: "выбрано" | "выбираем" | "витрина";
};

const GROUPS: { title: string; description: string; entries: Entry[] }[] = [
  {
    description: "Первый вход, провайдеры, модели и прокси — M2",
    entries: [
      {
        description: "Готово: «Шаги» в карточке «Колода», финал — конфетти «Залп». Рядом — ярлыки на шаг «Модели» и финал.",
        href: "/dev/prototypes/onboarding",
        icon: Rocket,
        status: "выбрано",
        title: "Онбординг",
      },
      {
        description: "Внутри режима настроек. Источники (кто даёт доступ) и провайдеры (кто сделал модель, логотипы в чате) — два раздела; рядом прошлые варианты.",
        href: "/dev/prototypes/providers",
        icon: Server,
        status: "выбираем",
        title: "Источники, провайдеры и модели",
      },
    ],
    title: "P7 · Провайдеры и модели",
  },
  {
    description: "Где живут чат, агенты и все настройки",
    entries: [
      {
        description: "Выбрано: «Режимы» — чат с лёгким сайдбаром, настройки отдельным режимом (⌘, / Esc). «Классика» и «Две зоны» — для сравнения.",
        href: "/dev/prototypes/app-shell",
        icon: PanelsTopLeft,
        status: "выбрано",
        title: "App shell",
      },
    ],
    title: "Оболочка",
  },
  {
    description: "Все компоненты ReUI и shadcn в теме Metobe",
    entries: [
      {
        description: "Кнопки, бейджи, графики, таблица.",
        href: "/dev/showcase",
        icon: LayoutDashboard,
        status: "витрина",
        title: "Дизайн-система",
      },
    ],
    title: "Справочно",
  },
];

const STATUS_VARIANT = { витрина: "secondary", выбираем: "warning-light", выбрано: "success-light" } as const;

const PrototypesIndex = () => (
  <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Прототипы Metobe</h1>
      <p className="text-muted-foreground text-sm">
        Живут здесь, пока идёт разработка. Варианты внутри прототипа переключаются пилюлей внизу или клавишами 1–9.
      </p>
    </header>
    {GROUPS.map((group) => (
      <Frame key={group.title} stacked>
        <FrameHeader>
          <FrameTitle>{group.title}</FrameTitle>
          <FrameDescription>{group.description}</FrameDescription>
        </FrameHeader>
        <FramePanel className="p-1!">
          <ItemGroup className="gap-0!">
            {group.entries.map(({ href, title, description, icon: Icon, status }) => (
              <Item key={href} render={<Link href={href} />} size="sm">
                <ItemMedia>
                  <IconTile size="sm" variant="frame">
                    <Icon />
                  </IconTile>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{title}</ItemTitle>
                  <ItemDescription>{description}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Badge size="sm" variant={STATUS_VARIANT[status]}>
                    {status}
                  </Badge>
                  <ChevronRight className="text-muted-foreground size-4" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </FramePanel>
      </Frame>
    ))}
  </main>
);

export default PrototypesIndex;
