"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@metobe/ui/components/command";
import { Kbd } from "@metobe/ui/components/kbd";
import { SidebarInput, useSidebar } from "@metobe/ui/components/sidebar";
import { cn } from "@metobe/ui/lib/utils";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  MessageSquare,
  Monitor,
  Moon,
  Pin,
  Search,
  Settings,
  SquarePen,
  Sun,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { searchChatsAction } from "@/app/(app)/(chat)/actions";
import type { ChatItem } from "@/components/chat/chat-item";
import { useHotkeyLabel } from "@/lib/hotkey-label";
import { SETTINGS_NAV } from "@/lib/settings-nav";

// P11 «Палитра ⌘K», variant «В сайдбаре»: ⌘K goes into the sidebar's search, and while there is a query its results
// take the place of the chat list — chats by title at once and by what was said from the server, the settings
// sections this person may open, and a few actions. Esc clears it; the list comes back.

const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-lpignore": "true",
  spellCheck: false,
} as const;

interface Hit {
  id: string;
  title: string;
  snippet: string | null;
  pinned?: boolean;
}

/** Every word of the query, anywhere, in any case. */
const matches = (query: string, ...texts: string[]) => {
  const words = query.toLowerCase().split(/\s+/u).filter(Boolean);
  const hay = texts.join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
};

const THEMES = [
  { icon: Sun, id: "light" },
  { icon: Moon, id: "dark" },
  { icon: Monitor, id: "system" },
] as const;

const Results = ({
  query,
  chats,
  admin,
  onDone,
  selected,
  onSelected,
  moved,
}: {
  query: string;
  chats: ChatItem[];
  admin: boolean;
  onDone: () => void;
  /** The highlighted row: the first one, until the arrows moved it (then it stays while it is there). */
  selected: string;
  onSelected: (value: string) => void;
  moved: boolean;
}) => {
  const t = useTranslations("chat.search");
  const ts = useTranslations("settings");
  const hk = useHotkeyLabel();
  const router = useRouter();
  const { setTheme } = useTheme();
  const q = query.trim();
  // The server's hits for what was said; the titles are found here at once.
  const [found, setFound] = useState<{ query: string; hits: Hit[] }>({
    hits: [],
    query: "",
  });
  useEffect(() => {
    if (!q) {
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const hits = await searchChatsAction(q);
      if (live) {
        setFound({ hits, query: q });
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);
  const hits = useMemo(() => {
    const byTitle: Hit[] = chats
      .filter((c) => matches(q, c.title))
      .map((c) => ({
        id: c.id,
        pinned: c.group === "pinned",
        snippet: null,
        title: c.title,
      }));
    const more =
      found.query === q
        ? found.hits.filter((h) => !byTitle.some((c) => c.id === h.id))
        : [];
    return [...byTitle, ...more].slice(0, 10);
  }, [chats, found, q]);
  const actions = [
    { icon: SquarePen, id: "new", label: t("newChat"), to: "/" },
    {
      icon: Settings,
      id: "settings",
      keys: hk("Mod+,"),
      label: t("settings"),
      to: "/settings",
    },
  ].filter((a) => matches(q, a.label));
  const themes = THEMES.filter((th) =>
    matches(q, t(`themes.${th.id}`), t("theme"))
  );
  const sections = SETTINGS_NAV.filter((g) => g.scope === "user" || admin)
    .flatMap((g) =>
      g.items.map((item) => ({
        group: ts(`groups.${g.key}`),
        hint: ts(`sections.${item.id}.hint`),
        icon: item.icon,
        id: item.id,
        label: ts(`sections.${item.id}.label`),
      }))
    )
    .filter((s) => matches(q, s.label, s.hint, s.group))
    .slice(0, 6);
  const go = (to: string) => {
    router.push(to);
    onDone();
  };
  // The input is ours, not cmdk's, so cmdk does not move its highlight as the rows change: the first row takes it.
  const values = [
    ...hits.map((h) => `chat:${h.id}`),
    ...sections.map((s) => `section:${s.id}`),
    ...actions.map((a) => `action:${a.id}`),
    ...themes.map((th) => `theme:${th.id}`),
  ];
  const first = values[0] ?? "";
  // Words found by the server come a moment later and go first: the highlight follows them unless the user moved it.
  const keep = moved && values.includes(selected);
  useEffect(() => {
    if (!keep) {
      onSelected(first);
    }
  }, [keep, first, onSelected]);
  return (
    <CommandList className="max-h-none min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <CommandEmpty>{t("nothing")}</CommandEmpty>
      {hits.length > 0 && (
        <CommandGroup heading={t("chats")}>
          {hits.map((h) => (
            <CommandItem
              key={h.id}
              onSelect={() => go(`/chat/${h.id}`)}
              value={`chat:${h.id}`}
            >
              {h.pinned ? <Pin /> : <MessageSquare />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{h.title}</span>
                {h.snippet && (
                  <span className="text-muted-foreground truncate text-xs">
                    {h.snippet}
                  </span>
                )}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {sections.length > 0 && (
        <CommandGroup heading={t("sections")}>
          {sections.map((s) => (
            <CommandItem
              key={s.id}
              onSelect={() => go(`/settings/${s.id}`)}
              value={`section:${s.id}`}
            >
              <s.icon /> <span className="truncate">{s.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {(actions.length > 0 || themes.length > 0) && (
        <CommandGroup heading={t("actions")}>
          {actions.map((a) => (
            <CommandItem
              key={a.id}
              onSelect={() => go(a.to)}
              value={`action:${a.id}`}
            >
              <a.icon /> {a.label}
              {a.keys && <CommandShortcut>{a.keys}</CommandShortcut>}
            </CommandItem>
          ))}
          {themes.map((th) => (
            <CommandItem
              key={th.id}
              onSelect={() => setTheme(th.id)}
              value={`theme:${th.id}`}
            >
              <th.icon /> {t(`themes.${th.id}`)}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </CommandList>
  );
};

/**
 * The search field under «Новый чат», and in place of `children` (the chat list) its results while there is a query.
 * ⌘K (Ctrl+K) from anywhere puts the cursor in it — on a phone it opens the sidebar first.
 */
export const SidebarSearch = ({
  chats,
  admin,
  children,
}: {
  chats: ChatItem[];
  admin: boolean;
  children: ReactNode;
}) => {
  const hk = useHotkeyLabel();
  const t = useTranslations("chat.search");
  const { isMobile, setOpenMobile } = useSidebar();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [moved, setMoved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useHotkey(
    "Mod+K",
    () => {
      if (isMobile) {
        setOpenMobile(true);
      }
      // The sheet mounts its field a moment later on a phone.
      requestAnimationFrame(() => input.current?.select());
    },
    { ignoreInputs: false }
  );
  const done = () => {
    setQuery("");
    input.current?.blur();
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const searching = Boolean(query.trim());
  // Only the field and its results are the palette: the chat list stays outside it, so Enter and the arrows there
  // keep working as they do (rename, open), untouched by the palette's keys.
  return (
    <>
      <Command
        className={cn(
          "rounded-none! bg-transparent p-0",
          searching ? "min-h-0 flex-1" : "h-auto shrink-0"
        )}
        onValueChange={setSelected}
        shouldFilter={false}
        value={selected}
      >
        <div className="bg-sidebar sticky top-0 z-10 px-2 pb-1">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
            <SidebarInput
              {...NO_AUTOFILL}
              aria-label={t("label")}
              className="pr-10 pl-8"
              onChange={(e) => {
                setQuery(e.target.value);
                setMoved(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  setMoved(true);
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setQuery("");
                  input.current?.blur();
                }
              }}
              placeholder={t("placeholder")}
              ref={input}
              value={query}
            />
            {!query && (
              <Kbd className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 md:inline-flex">
                {hk("Mod+K")}
              </Kbd>
            )}
          </div>
        </div>
        {searching && (
          <Results
            admin={admin}
            chats={chats}
            onDone={done}
            moved={moved}
            onSelected={setSelected}
            query={query}
            selected={selected}
          />
        )}
      </Command>
      {!searching && children}
    </>
  );
};
