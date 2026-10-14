"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@metobe/ui/components/command";
import { cn } from "@metobe/ui/lib/utils";
import {
  Cpu,
  MessageSquare,
  Monitor,
  Moon,
  Pin,
  Search,
  Settings,
  SquarePen,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useFormatter, useNow } from "next-intl";
import { createContext, use, useEffect, useMemo, useRef, useState } from "react";

import { SETTINGS_NAV } from "@/lib/settings-nav";

import { Picker } from "../_shared/picker";
import { around, matches } from "./data";
import type { Go, PaletteChat, PaletteSection } from "./data";

// P11 · «Палитра ⌘K». Three ways to jump anywhere from the chat: «Спотлайт» — a window in the middle with groups;
// «С превью» — the same, plus what the highlighted chat or section holds; «В сайдбаре» — no window: ⌘K goes into
// the sidebar's search and its results take the place of the chat list. Your own chats and sections; a pick only
// says where it would go. «Параметры»: computer or phone.

const ICONS = Object.fromEntries(SETTINGS_NAV.flatMap((g) => g.items.map((i) => [i.id, i.icon])));

interface Data {
  chats: PaletteChat[];
  sections: PaletteSection[];
}
interface Proto extends Data {
  phone: boolean;
  setPhone: (v: boolean) => void;
  last: string | null;
  go: Go;
}
const Ctx = createContext<Proto | null>(null);
const useProto = () => {
  const p = use(Ctx);
  if (!p) {
    throw new Error("outside the prototype");
  }
  return p;
};

/** ⌘K (Ctrl+K) anywhere toggles; the variant decides what opens. */
const useHotkey = (toggle: () => void) => {
  const ref = useRef(toggle);
  ref.current = toggle;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
};

// What the palette finds for a query: actions, chats (title and words), settings. An empty query offers the
// actions and the last chats — the usual reason to open it.
const ACTIONS = [
  { icon: SquarePen, id: "new", keys: "⇧⌘O", label: "Новый чат", words: "новый чат создать" },
  { icon: Cpu, id: "model", keys: "⌘/", label: "Выбрать модель", words: "модель сменить выбрать" },
  { icon: Settings, id: "settings", keys: "⌘,", label: "Настройки", words: "настройки параметры" },
  { icon: Sun, id: "light", label: "Светлая тема", words: "тема светлая" },
  { icon: Moon, id: "dark", label: "Тёмная тема", words: "тема тёмная темная" },
  { icon: Monitor, id: "system", label: "Тема как в системе", words: "тема системная авто" },
] as const;

const useResults = (query: string) => {
  const { chats, sections } = useProto();
  return useMemo(() => {
    const q = query.trim();
    const byRecent = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      actions: q ? ACTIONS.filter((a) => matches(q, a.label, a.words)) : ACTIONS.slice(0, 3),
      chats: q
        ? byRecent.filter((c) => matches(q, c.title, c.question, c.answer)).slice(0, 8)
        : [...byRecent.filter((c) => c.pinned), ...byRecent.filter((c) => !c.pinned)].slice(0, 6),
      sections: q ? sections.filter((s) => matches(q, s.label, s.hint, s.group)).slice(0, 6) : [],
    };
  }, [query, chats, sections]);
};

const When = ({ at }: { at: string }) => {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return <span>{format.relativeTime(new Date(at), now)}</span>;
};

/** The rows: the same in every variant. `onPick` closes; the theme rows apply at once and stay. */
/** `narrow` — in the sidebar's column: no time beside a chat, the title takes the width. */
const Rows = ({ query, onPick, narrow: narrowColumn }: { query: string; onPick: () => void; narrow?: boolean }) => {
  const { go, phone } = useProto();
  // A phone is as narrow as the sidebar.
  const narrow = narrowColumn || phone;
  const { setTheme } = useTheme();
  const { actions, chats, sections } = useResults(query);
  const q = query.trim();
  return (
    <>
      <CommandEmpty>Ничего не нашлось — ни в чатах, ни в настройках</CommandEmpty>
      {actions.length > 0 && (
        <CommandGroup heading="Действия">
          {actions.map((a) => (
            <CommandItem
              key={a.id}
              onSelect={() => {
                if (a.id === "light" || a.id === "dark" || a.id === "system") {
                  setTheme(a.id);
                  return;
                }
                go(a.id === "new" ? "новый чат" : a.id === "model" ? "палитра моделей (⌘/)" : "/settings");
                onPick();
              }}
              value={`action:${a.id}`}
            >
              <a.icon /> {a.label}
              {"keys" in a && <CommandShortcut>{a.keys}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {chats.length > 0 && (
        <CommandGroup heading={q ? "Чаты" : "Недавние чаты"}>
          {chats.map((c) => {
            // A hit in the words, not the title: show where.
            const inWords = q && !matches(q, c.title);
            return (
              <CommandItem
                key={c.id}
                onSelect={() => {
                  go(`/chat/${c.id.slice(0, 8)}… «${c.title}»`);
                  onPick();
                }}
                value={`chat:${c.id}`}
              >
                {c.pinned ? <Pin /> : <MessageSquare />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{c.title}</span>
                  {inWords && (
                    <span className="text-muted-foreground truncate text-xs">
                      {around(matches(q, c.question) ? c.question : c.answer, q)}
                    </span>
                  )}
                </span>
                {!narrow && (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    <When at={c.updatedAt} />
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}
      {sections.length > 0 && (
        <CommandGroup heading="Настройки">
          {sections.map((s) => {
            const Icon = ICONS[s.id] ?? Settings;
            return (
              <CommandItem
                key={s.id}
                onSelect={() => {
                  go(`/settings/${s.id}`);
                  onPick();
                }}
                value={`section:${s.id}`}
              >
                <Icon /> {s.label}
                {!narrow && <span className="text-muted-foreground ml-auto truncate text-xs">{s.group}</span>}
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}
    </>
  );
};

// ——— the scene: the chat's sidebar with the real chats, a quiet thread on the right ———

const SidebarChats = () => {
  const { chats } = useProto();
  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2">
      <div className="text-sidebar-foreground/60 px-2 py-1.5 text-xs font-medium">Чаты</div>
      {chats.slice(0, 18).map((c) => (
        <div className="truncate rounded-md px-2 py-1.5 text-sm" key={c.id}>
          {c.title}
        </div>
      ))}
    </div>
  );
};

const Sidebar = ({ children }: { children?: React.ReactNode }) => (
  <aside className="bg-sidebar text-sidebar-foreground ring-sidebar-border flex w-64 shrink-0 flex-col rounded-lg shadow-sm ring-1">
    <div className="flex flex-col gap-1 p-2">
      <div className="flex h-8 items-center gap-2 px-1.5 text-sm font-semibold">
        <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs">
          M
        </span>
        Metobe
      </div>
      <div className="flex h-8 items-center gap-2 rounded-md px-2 text-sm">
        <SquarePen className="size-4" /> Новый чат
      </div>
    </div>
    {children ?? <SidebarChats />}
  </aside>
);

const Hint = () => (
  <div className="text-muted-foreground flex min-w-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-sm">
    <span>
      Нажмите <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">⌘K</kbd>
    </span>
  </div>
);

/** `onOpen` — a phone has no ⌘K: the window opens from a search button in the screen's header. */
const Frame = ({
  sidebar,
  onOpen,
  children,
}: {
  sidebar?: React.ReactNode;
  onOpen?: () => void;
  children?: React.ReactNode;
}) => {
  const { phone, last } = useProto();
  return (
    <div className={cn("bg-background relative flex h-dvh items-center justify-center overflow-hidden p-3", phone && "pb-20")}>
      {phone ? (
        <div className="ring-border bg-background relative flex h-[760px] max-h-[calc(100dvh-7rem)] w-[390px] flex-col overflow-hidden rounded-[2rem] ring-1">
          {onOpen && (
            <div className="flex h-14 shrink-0 items-center justify-end px-4 pt-2">
              <button
                aria-label="Поиск"
                className="hover:bg-muted flex size-9 items-center justify-center rounded-full"
                onClick={onOpen}
                type="button"
              >
                <Search className="size-4" />
              </button>
            </div>
          )}
          {sidebar ?? <Hint />}
          {children}
        </div>
      ) : (
        <div className="flex size-full gap-3">
          <Sidebar>{sidebar}</Sidebar>
          <Hint />
          {children}
        </div>
      )}
      {last && (
        <div className="bg-foreground text-background absolute bottom-20 left-1/2 max-w-[80vw] -translate-x-1/2 truncate rounded-full px-3 py-1.5 text-xs">
          Откроется: {last}
        </div>
      )}
    </div>
  );
};

/** A window over the scene: in the middle on a computer, a sheet from the bottom on a phone. */
const Overlay = ({ open, onClose, wide, children }: { open: boolean; onClose: () => void; wide?: boolean; children: React.ReactNode }) => {
  const { phone } = useProto();
  if (!open) {
    return null;
  }
  return (
    <div className={cn("z-50", phone ? "absolute inset-0" : "fixed inset-0")}>
      <button aria-label="Закрыть" className="animate-in fade-in absolute inset-0 bg-black/30 duration-150" onClick={onClose} type="button" />
      <div
        className={cn(
          "bg-popover ring-border absolute overflow-hidden shadow-2xl ring-1 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          phone
            ? "animate-in slide-in-from-bottom-4 inset-x-0 bottom-0 h-[85%] rounded-t-2xl"
            : cn("animate-in fade-in zoom-in-[0.98] top-[18%] left-1/2 -translate-x-1/2 rounded-xl", wide ? "w-[760px]" : "w-[560px]")
        )}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
};

// ——— variants ———

const Spotlight = () => {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  useHotkey(() => setOpen((o) => !o));
  return (
    <Frame onOpen={() => setOpen(true)}>
      <Overlay onClose={() => setOpen(false)} open={open}>
        <Command shouldFilter={false}>
          <CommandInput autoFocus onValueChange={setQuery} placeholder="Чат, раздел настроек или действие" value={query} />
          <CommandList className="max-h-[min(420px,60dvh)]">
            <Rows onPick={() => setOpen(false)} query={query} />
          </CommandList>
        </Command>
      </Overlay>
    </Frame>
  );
};

/** The highlighted row, told: a chat's first question and its last answer; a section's hint. */
const Preview = ({ value, query }: { value: string; query: string }) => {
  const { chats, sections } = useProto();
  const [kind, id] = value.split(":");
  if (kind === "chat") {
    const c = chats.find((x) => x.id === id);
    if (!c) {
      return null;
    }
    return (
      <div className="flex min-w-0 flex-col gap-3 p-4 text-sm">
        <div className="font-medium">{c.title}</div>
        <div className="text-muted-foreground text-xs">
          <When at={c.updatedAt} />
        </div>
        {c.question ? (
          <>
            <div className="bg-muted ml-auto max-w-[90%] rounded-2xl rounded-br-md px-3 py-2">{around(c.question, query, 160)}</div>
            {c.answer && <div className="text-muted-foreground line-clamp-6">{around(c.answer, query, 260)}</div>}
          </>
        ) : (
          <div className="text-muted-foreground text-xs">Старый чат: здесь видно только название.</div>
        )}
      </div>
    );
  }
  if (kind === "section") {
    const s = sections.find((x) => x.id === id);
    const Icon = (s && ICONS[s.id]) ?? Settings;
    return s ? (
      <div className="flex flex-col gap-2 p-4 text-sm">
        <Icon className="text-muted-foreground size-5" />
        <div className="font-medium">{s.label}</div>
        <div className="text-muted-foreground">{s.hint}</div>
        <div className="text-muted-foreground text-xs">{s.admin ? `Администрирование · ${s.group}` : s.group}</div>
      </div>
    ) : null;
  }
  return <div className="text-muted-foreground p-4 text-sm">Enter — выполнить</div>;
};

const WithPreview = () => {
  const { phone } = useProto();
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  useHotkey(() => setOpen((o) => !o));
  return (
    <Frame onOpen={() => setOpen(true)}>
      <Overlay onClose={() => setOpen(false)} open={open} wide>
        <Command onValueChange={setValue} shouldFilter={false} value={value}>
          <CommandInput autoFocus onValueChange={setQuery} placeholder="Чат, раздел настроек или действие" value={query} />
          <div className="flex min-h-0">
            <CommandList className={cn("max-h-[min(420px,60dvh)]", !phone && "w-[55%] shrink-0 border-r")}>
              <Rows onPick={() => setOpen(false)} query={query} />
            </CommandList>
            {/* On a phone there is no room beside the list: the preview is dropped, the list stays. */}
            {!phone && (
              <div className="min-w-0 flex-1 overflow-hidden">
                <Preview query={query} value={value} />
              </div>
            )}
          </div>
        </Command>
      </Overlay>
    </Frame>
  );
};

const InSidebar = () => {
  const { phone } = useProto();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useHotkey(() => input.current?.focus());
  useEffect(() => input.current?.focus(), []);
  const search = (
    <Command className="bg-transparent" shouldFilter={false}>
      <div className="px-2 pb-1">
        <label className="bg-background/60 ring-sidebar-border flex h-8 items-center gap-2 rounded-md px-2 text-sm ring-1">
          <Search className="text-muted-foreground size-3.5" />
          <CommandPrimitiveInput onChange={setQuery} ref={input} value={query} />
          {!query && <kbd className="text-muted-foreground font-mono text-[10px]">⌘K</kbd>}
        </label>
      </div>
      {query ? (
        <CommandList className="max-h-none min-h-0 flex-1 px-1">
          <Rows narrow onPick={() => setQuery("")} query={query} />
        </CommandList>
      ) : (
        <SidebarChats />
      )}
    </Command>
  );
  return <Frame sidebar={phone ? <div className="flex min-h-0 flex-1 flex-col pt-3">{search}</div> : search} />;
};

/** cmdk's own input without the bordered wrapper, so it sits in the sidebar's field. */
const CommandPrimitiveInput = ({
  value,
  onChange,
  ref,
}: {
  value: string;
  onChange: (v: string) => void;
  ref: React.Ref<HTMLInputElement>;
}) => (
  <input
    aria-label="Поиск"
    className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent outline-none"
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => {
      // The list below takes the arrows and Enter, as cmdk's own input would hand them.
      if (e.key === "Escape") {
        onChange("");
      }
    }}
    placeholder="Найти чат или настройку"
    ref={ref}
    value={value}
  />
);

const Params = () => {
  const { phone, setPhone } = useProto();
  return (
    <div className="flex items-center justify-between gap-4">
      <span>экран</span>
      <div className="flex gap-1">
        {[false, true].map((p) => (
          <button
            aria-pressed={phone === p}
            className={cn("rounded-full px-2.5 py-1", phone === p ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85")}
            key={String(p)}
            onClick={() => setPhone(p)}
            type="button"
          >
            {p ? "телефон" : "компьютер"}
          </button>
        ))}
      </div>
    </div>
  );
};

/** Only in the browser: the theme and the relative times are known there. */
const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

export const Prototype = ({ chats, sections }: Data) => {
  // `?phone=1` opens on the phone frame (for a link or a screenshot).
  const [phone, setPhone] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("phone") === "1"
  );
  const [last, setLast] = useState<string | null>(null);
  return (
    <Ctx value={{ chats, go: setLast, last, phone, sections, setPhone }}>
      <Mounted>
        <Picker
          params={<Params />}
          variants={[
            { Component: Spotlight, name: "Спотлайт" },
            { Component: WithPreview, name: "С превью" },
            { Component: InSidebar, name: "В сайдбаре" },
          ]}
        />
      </Mounted>
    </Ctx>
  );
};
