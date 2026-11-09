"use client";

import { cn } from "@metobe/ui/lib/utils";
import { BookUser, CalendarClock, Sun, SquarePen } from "lucide-react";
import { createContext, use, useEffect, useState } from "react";

import { CHATS } from "./data";

// Общее для P16 (страница «Память») и P17 (план на день): приложение вокруг — боковая панель с «Сегодня», «Новым
// чатом», «Задачами» и «Памятью», на телефоне — кадр 390 px; строка-уведомление внизу с «Вернуть»; ручки прототипа.
// Движение — как в прототипах задач: ease-out (0.23, 1, 0.32, 1), появление 200 мс, нажатие 0.97.

export const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
export const ENTER = `animate-in fade-in slide-in-from-bottom-1 duration-200 ${EASE} motion-reduce:slide-in-from-bottom-0`;
export const PRESS = "transition-transform duration-160 ease-out active:scale-[0.97] motion-reduce:active:scale-100";
export const rise = (n: number) => ({ animationDelay: `${n * 40}ms`, animationFillMode: "both" as const });

export type Screen = "desktop" | "phone";
type Note = { text: string; undo?: () => void } | null;

interface Ctx {
  screen: Screen;
  setScreen: (s: Screen) => void;
  /** Ручки конкретного прототипа: строка → значение, в адресе тем же ключом. */
  knobs: Record<string, string>;
  setKnob: (key: string, value: string) => void;
  note: Note;
  say: (text: string, undo?: () => void) => void;
}

const Proto = createContext<Ctx>(null as never);

const setParam = (key: string, value: string | null) => {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.history.replaceState(null, "", url);
};

export const ProtoProvider = ({ children, defaults }: { children: React.ReactNode; defaults: Record<string, string> }) => {
  const [screen, setScreenState] = useState<Screen>("desktop");
  const [knobs, setKnobs] = useState(defaults);
  const [note, setNote] = useState<Note>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("sz") === "phone") setScreenState("phone");
    setKnobs((k) => Object.fromEntries(Object.entries(k).map(([key, v]) => [key, q.get(key) ?? v])));
  }, []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);
  return (
    <Proto
      value={{
        knobs,
        note,
        say: (text, undo) => setNote({ text, undo }),
        screen,
        setKnob: (key, value) => {
          setKnobs((k) => ({ ...k, [key]: value }));
          setParam(key, value);
        },
        setScreen: (s) => {
          setScreenState(s);
          setParam("sz", s === "phone" ? "phone" : null);
        },
      }}
    >
      {children}
    </Proto>
  );
};

export const useProto = () => use(Proto);
export const usePhone = () => useProto().screen === "phone";

const Chip = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    aria-pressed={active}
    className={cn("rounded-full px-2.5 py-1 transition-colors duration-150", active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85")}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

/** Ручки в листе «Параметры»: экран и свои — `[ключ, подпись, [[значение, подпись]…]]`. */
export const Params = ({ rows }: { rows: [string, string, [string, string][]][] }) => {
  const { screen, setScreen, knobs, setKnob } = useProto();
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span>экран</span>
        <div className="flex gap-1">
          <Chip active={screen === "desktop"} onClick={() => setScreen("desktop")}>компьютер</Chip>
          <Chip active={screen === "phone"} onClick={() => setScreen("phone")}>телефон</Chip>
        </div>
      </div>
      {rows.map(([key, label, options]) => (
        <div className="flex items-center justify-between gap-4" key={key}>
          <span>{label}</span>
          <div className="flex gap-1">
            {options.map(([value, text]) => (
              <Chip active={knobs[key] === value} key={value} onClick={() => setKnob(key, value)}>{text}</Chip>
            ))}
          </div>
        </div>
      ))}
    </>
  );
};

// ── Приложение вокруг ────────────────────────────────────────────────────────────────────────────────────────────────

export type Area = "today" | "chat" | "memory";

const NAV: { id: Area | "tasks"; label: string; icon: typeof Sun }[] = [
  { icon: Sun, id: "today", label: "Сегодня" },
  { icon: SquarePen, id: "chat", label: "Новый чат" },
  { icon: CalendarClock, id: "tasks", label: "Задачи" },
  { icon: BookUser, id: "memory", label: "Память" },
];

const Sidebar = ({ area, badge }: { area: Area; badge?: number }) => (
  <aside className="bg-sidebar text-sidebar-foreground flex w-60 shrink-0 flex-col gap-4 border-r p-2 text-sm">
    <div className="flex flex-col gap-0.5">
      {/* «Сегодня» — только у раунда 1 «Сегодня», где план был отдельной страницей. */}
      {NAV.filter((x) => x.id !== "today" || area === "today").map(({ id, label, icon: Icon }) => (
        <span className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", area === id && "bg-sidebar-accent font-medium")} key={id}>
          <Icon className="size-4" />
          <span className="flex-1">{label}</span>
          {id === "today" && badge ? <span className="text-muted-foreground text-xs tabular-nums">{badge}</span> : null}
        </span>
      ))}
    </div>
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground px-2 pb-1 text-xs">Чаты</span>
      {CHATS.map((c) => (
        <span className="text-muted-foreground truncate rounded-md px-2 py-1.5" key={c}>
          {c}
        </span>
      ))}
    </div>
  </aside>
);

const Toast = () => {
  const { note, say } = useProto();
  if (!note) return null;
  return (
    <div className={cn("bg-foreground text-background absolute bottom-6 left-1/2 z-50 flex max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-xs", !note.undo && "pr-4", ENTER)} role="status">
      <span>{note.text}</span>
      {note.undo && (
        <button
          className={cn("rounded-full bg-white/15 px-2.5 py-1 font-medium hover:bg-white/25", PRESS)}
          onClick={() => {
            note.undo?.();
            say("Возвращено");
          }}
          type="button"
        >
          Вернуть
        </button>
      )}
    </div>
  );
};

/** Компьютер — боковая панель и страница; телефон — кадр 390 px со строкой заголовка. */
export const Shell = ({ title, area, badge, children }: { title: string; area: Area; badge?: number; children: React.ReactNode }) => {
  const phone = usePhone();
  if (phone) {
    return (
      <div className="bg-muted/40 flex min-h-dvh justify-center py-8">
        <div className="bg-background relative flex h-[812px] w-[390px] flex-col overflow-hidden rounded-[2.5rem] border pt-6 shadow-xl">
          <div className="flex h-12 shrink-0 items-center border-b px-5 text-sm font-medium">{title}</div>
          <div className="@container relative flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none]">{children}</div>
          <Toast />
        </div>
      </div>
    );
  }
  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <Sidebar area={area} badge={badge} />
      <main className="relative min-w-0 flex-1">
        <div className="@container flex h-full flex-col overflow-y-auto">{children}</div>
        <Toast />
      </main>
    </div>
  );
};

/** Показывать только после гидрации: варианты читают адрес и размер окна. */
export const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};
