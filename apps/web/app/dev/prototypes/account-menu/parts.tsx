"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronsUpDown, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { createPortal } from "react-dom";

import { UserAvatar } from "@/components/user-avatar";

import { PERSON } from "../account/data";
import { useProto } from "./state";
import type { Lang } from "./state";

export const THEMES = [
  { icon: Sun, id: "light", label: "Светлая" },
  { icon: Moon, id: "dark", label: "Тёмная" },
  { icon: Monitor, id: "system", label: "Как в системе" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];

export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "ru", label: "Русский", short: "RU" },
  { id: "en", label: "English", short: "EN" },
];

export const useThemeChoice = () => {
  const { theme, setTheme } = useTheme();
  const current = (THEMES.find((t) => t.id === theme)?.id ?? "system") as ThemeId;
  return { current, set: (id: ThemeId) => setTheme(id) };
};

/** Три значка темы в одной пилюле: применяется сразу, без анимации перехода. */
export const ThemeButtons = ({ size = "size-7" }: { size?: string }) => {
  const { current, set } = useThemeChoice();
  return (
    <div className="bg-muted flex gap-0.5 rounded-lg p-0.5">
      {THEMES.map(({ id, icon: Icon, label }) => (
        <button
          aria-label={label}
          aria-pressed={current === id}
          className={cn(
            "text-muted-foreground grid place-items-center rounded-md active:scale-[0.95]",
            size,
            current === id ? "bg-background text-foreground shadow-xs" : "hover:text-foreground"
          )}
          key={id}
          onClick={() => set(id)}
          title={label}
          type="button"
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
};

/** Два языка в такой же пилюле, с их сокращениями. */
export const LangButtons = ({ size = "h-7 px-2.5" }: { size?: string }) => {
  const { lang, setLang } = useProto();
  return (
    <div className="bg-muted flex gap-0.5 rounded-lg p-0.5">
      {LANGS.map(({ id, label, short }) => (
        <button
          aria-label={label}
          aria-pressed={lang === id}
          className={cn(
            "text-muted-foreground rounded-md text-xs font-medium active:scale-[0.95]",
            size,
            lang === id ? "bg-background text-foreground shadow-xs" : "hover:text-foreground"
          )}
          key={id}
          onClick={() => setLang(id)}
          type="button"
        >
          {short}
        </button>
      ))}
    </div>
  );
};

/** Аватар и подпись: имя и то, что под ним. */
export const Who = ({ avatar = "size-9", sub }: { avatar?: string; sub: "email" | "role" }) => (
  <>
    <UserAvatar className={cn(avatar, "text-sm")} image={null} name={PERSON.name} />
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-sm font-medium">{PERSON.name}</span>
      <span className={cn("text-muted-foreground truncate text-xs", sub === "email" && "font-mono")}>
        {sub === "email" ? PERSON.email : PERSON.role}
      </span>
    </span>
  </>
);

/** Строка-триггер в панели: аватар с именем и ролью; в свёрнутой панели — один аватар. */
export const triggerClass = (collapsed: boolean) =>
  cn(
    "hover:bg-sidebar-accent data-popup-open:bg-sidebar-accent flex items-center rounded-lg text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
    collapsed ? "size-10 justify-center" : "w-full gap-2.5 p-2"
  );

export const TriggerFace = ({
  collapsed,
  sub = "role",
  chevron = false,
}: {
  collapsed: boolean;
  sub?: "email" | "role";
  chevron?: boolean;
}) =>
  collapsed ? (
    <UserAvatar className="size-8 text-xs" image={null} name={PERSON.name} />
  ) : (
    <>
      <Who avatar="size-8" sub={sub} />
      {chevron && <ChevronsUpDown className="text-muted-foreground ml-auto size-4 shrink-0" />}
    </>
  );

/**
 * Хозяин меню: на компьютере — всплывающая панель у триггера (над ним; у свёрнутой панели — справа); на телефоне —
 * шторка снизу внутри кадра телефона. Содержимое одно и то же, меняется только оболочка.
 */
export const MenuHost = ({
  collapsed,
  phone,
  face,
  width = "w-64",
  children,
}: {
  collapsed: boolean;
  phone: boolean;
  face: React.ReactNode;
  width?: string;
  children: (close: () => void) => React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  if (phone) {
    const frame = open ? document.querySelector("[data-phone-frame]") : null;
    return (
      <>
        <button className={triggerClass(false)} onClick={() => setOpen(true)} type="button">
          {face}
        </button>
        {frame &&
          createPortal(
            <div className="absolute inset-0 z-50 flex items-end">
              <button aria-label="Закрыть" className="absolute inset-0 bg-black/30" onClick={close} type="button" />
              <div className="bg-popover text-popover-foreground animate-in slide-in-from-bottom-6 fade-in-0 relative w-full rounded-t-2xl p-3 pb-6 shadow-lg duration-200">
                <div className="bg-muted-foreground/30 mx-auto mb-3 h-1 w-9 rounded-full" />
                {children(close)}
              </div>
            </div>,
            frame
          )}
      </>
    );
  }
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger render={<button className={triggerClass(collapsed)} type="button" />}>{face}</PopoverTrigger>
      <PopoverContent
        align={collapsed ? "end" : "start"}
        className={cn(width, "gap-0 p-1")}
        side={collapsed ? "right" : "top"}
        sideOffset={8}
      >
        {children(close)}
      </PopoverContent>
    </Popover>
  );
};

/** Строка меню: значок, подпись, справа — подсказка или сочетание клавиш. */
export const MenuRow = ({
  icon: Icon,
  children,
  end,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  end?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) => (
  <button
    className={cn(
      "hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden [&_svg]:size-4 [&_svg]:shrink-0",
      danger && "text-destructive"
    )}
    onClick={onClick}
    type="button"
  >
    <Icon />
    {children}
    {end && <span className="text-muted-foreground ml-auto text-xs">{end}</span>}
  </button>
);

export const Sep = () => <div className="bg-border -mx-1 my-1 h-px" />;
