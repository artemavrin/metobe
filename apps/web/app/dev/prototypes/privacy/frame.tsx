"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Menu, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { usePhone as usePhoneKnob } from "../memory/frame";

// Рамка P31: чат или настройки вокруг сцены. Телефон — узкое окно (настоящие 390 px) или `sz=phone` на компьютере:
// тогда кадр 390 px. Шторки рисуются поверх всего окна — в кадре они шире кадра, смотреть телефон лучше в узком окне.

const useNarrow = () => {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return narrow;
};

/** Телефон: узкое окно или ручка «экран». */
export const usePhone = () => {
  const knob = usePhoneKnob();
  const narrow = useNarrow();
  return knob || narrow;
};

/** Кадр 390 px на компьютере, всё окно — в узком окне. */
const PhoneBody = ({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) => {
  const narrow = useNarrow();
  const inner = (
    <>
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4 text-sm font-medium">
        <Menu className="text-muted-foreground size-4" />
        <span className="flex-1 truncate">{title}</span>
        <SquarePen className="text-muted-foreground size-4" />
      </div>
      <div className="@container relative flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none]">{children}</div>
      {footer && <div className="shrink-0 px-3 pt-1 pb-3">{footer}</div>}
    </>
  );
  if (narrow) return <div className="bg-background text-foreground flex h-dvh flex-col">{inner}</div>;
  return (
    <div className="bg-muted/40 flex min-h-dvh justify-center py-8">
      <div className="bg-background text-foreground relative flex h-[812px] w-[390px] flex-col overflow-hidden rounded-[2.5rem] border pt-6 shadow-xl">
        {inner}
      </div>
    </div>
  );
};

const CHATS = ["Письмо поставщику", "Отчёт по продажам за октябрь", "План закупок на декабрь", "Сверка с бухгалтерией"];

/** Чат: боковая панель со списком, колонка сообщений, поле ввода снизу. */
export const ChatShell = ({ children, composer }: { children: ReactNode; composer?: ReactNode }) => {
  const phone = usePhone();
  if (phone) {
    return (
      <PhoneBody footer={composer} title={CHATS[0] as string}>
        <div className="flex flex-col gap-6 px-4 py-5">{children}</div>
      </PhoneBody>
    );
  }
  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside className="bg-sidebar text-sidebar-foreground flex w-60 shrink-0 flex-col gap-4 border-r p-2 text-sm">
        <span className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <SquarePen className="size-4" />
          Новый чат
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground px-2 pb-1 text-xs">Чаты</span>
          {CHATS.map((c, i) => (
            <span className={cn("truncate rounded-md px-2 py-1.5", i === 0 ? "bg-sidebar-accent font-medium" : "text-muted-foreground")} key={c}>
              {c}
            </span>
          ))}
        </div>
      </aside>
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="@container flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pt-20 pb-10">{children}</div>
        </div>
        {composer && <div className="mx-auto w-full max-w-3xl shrink-0 px-6 pb-4">{composer}</div>}
      </main>
    </div>
  );
};

const SETTINGS_MENU = ["Пользователи", "Модели", "Источники", "Поиск в интернете", "Защита данных", "Хранилище", "О системе"];

/** Окно настроек: меню слева, экран справа; на телефоне — строка заголовка. */
export const SettingsWindow = ({ children }: { children: ReactNode }) => {
  const phone = usePhone();
  if (phone) return <PhoneBody title="Защита данных">{children}</PhoneBody>;
  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside className="bg-sidebar text-sidebar-foreground flex w-60 shrink-0 flex-col gap-1 border-r p-2 text-sm">
        <span className="text-muted-foreground px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase">Администрирование</span>
        {SETTINGS_MENU.map((item) => (
          <span
            className={cn("rounded-md px-2 py-1.5", item === "Защита данных" ? "bg-sidebar-accent font-medium" : "text-muted-foreground")}
            key={item}
          >
            {item}
          </span>
        ))}
      </aside>
      <main className="@container min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};

/** Сообщение человека — пузырь справа. */
export const UserBubble = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col items-end gap-1.5">
    <div className="bg-muted max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6">{children}</div>
  </div>
);
