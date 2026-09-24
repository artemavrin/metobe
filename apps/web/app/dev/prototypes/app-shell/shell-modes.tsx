"use client";

// Direction «Режимы»: the chat keeps a light floating sidebar; settings are a separate admin mode with its own layout.
import { Button } from "@metobe/ui/components/button";
import { Kbd } from "@metobe/ui/components/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@metobe/ui/components/sidebar";
import { ArrowLeft, ChevronRight, Search, Settings, SquarePen } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { NO_AUTOFILL } from "../_p7/shared";
import { AccountMenu, ChatHome, ChatThread, SettingsPage, SoonPage, UserAvatar } from "./content";
import { AREAS, CHAT_GROUPS, CHATS, SETTINGS, type SettingsSection, USER } from "./data";

type ChatView = { id?: string } | { area: "agents" | "inbox" };

/** `start` and `providers` let other prototypes open the shell right in settings with their own providers page. */
type Pages = Partial<Record<SettingsSection, React.ReactNode>>;

/** What a custom settings layout gets from the shell. */
export type SettingsCtx = { section: SettingsSection; onSection: (s: SettingsSection) => void; onBack: () => void };

export const ShellModes = ({
  start = "chat",
  providers,
  pages,
  settings,
}: { start?: "chat" | "settings"; providers?: React.ReactNode; pages?: Pages; settings?: (ctx: SettingsCtx) => React.ReactNode } = {}) => {
  const [mode, setMode] = useState<"chat" | "settings">(start);
  const [chat, setChat] = useState<ChatView>({});
  const [section, setSection] = useState<SettingsSection>("providers");

  // ⌘, opens settings, Esc returns to the chat — settings are a place you visit, not where you live.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setMode("settings");
      } else if (e.key === "Escape" && !(e.target as HTMLElement).closest("[role=dialog],[role=menu]")) setMode("chat");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return mode === "chat" ? (
    <ChatMode chat={chat} onChat={setChat} onSettings={() => setMode("settings")} />
  ) : settings ? (
    settings({ onBack: () => setMode("chat"), onSection: setSection, section })
  ) : (
    <SettingsMode onBack={() => setMode("chat")} onSection={setSection} pages={{ providers, ...pages }} section={section} />
  );
};

const Brand = () => (
  <span className="flex items-center gap-2 text-sm font-semibold">
    <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs">M</span>
    Metobe
  </span>
);

/** The same account row in both modes: the shell stays one app, only the menu changes. */
export const AccountFooter = ({ onSettings, inSettings = false }: { onSettings: () => void; inSettings?: boolean }) => (
  <SidebarFooter className="flex-row items-center gap-1">
    <AccountMenu
      onSettings={onSettings}
      trigger={
        <SidebarMenuButton className="flex-1" size="lg">
          <UserAvatar className="size-8" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium">{USER.name}</span>
            <span className="text-muted-foreground truncate text-xs">{USER.role}</span>
          </span>
        </SidebarMenuButton>
      }
    />
    {!inSettings && (
      <Button aria-label="Настройки" onClick={onSettings} size="icon" title="Настройки (⌘,)" variant="ghost">
        <Settings />
      </Button>
    )}
  </SidebarFooter>
);

const ChatMode = ({ chat, onChat, onSettings }: { chat: ChatView; onChat: (c: ChatView) => void; onSettings: () => void }) => (
  <SidebarProvider className="animate-in fade-in duration-200 ease-out">
    <Sidebar variant="floating">
      <SidebarHeader>
        <div className="flex h-8 items-center px-1">
          <Brand />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => onChat({})}>
              <SquarePen /> <span>Новый чат</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {AREAS.filter((a) => a.id !== "chat").map((a) => (
            <SidebarMenuItem key={a.id}>
              <SidebarMenuButton isActive={"area" in chat && chat.area === a.id} onClick={() => onChat({ area: a.id })}>
                <a.icon /> <span>{a.label}</span>
                <span className="text-muted-foreground ml-auto text-[11px]">скоро</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {CHAT_GROUPS.map((g) => (
          <SidebarGroup className="py-1" key={g}>
            <SidebarGroupLabel>{g}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {CHATS.filter((c) => c.group === g).map((c) => (
                  <SidebarMenuItem key={c.id}>
                    <SidebarMenuButton isActive={"id" in chat && chat.id === c.id} onClick={() => onChat({ id: c.id })}>
                      <span>{c.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <AccountFooter onSettings={onSettings} />
    </Sidebar>
    <SidebarInset className="min-h-0">
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        <SidebarTrigger />
      </header>
      <div className="flex min-h-0 flex-1 flex-col" key={JSON.stringify(chat)}>
        {"area" in chat ? <SoonPage title={chat.area === "agents" ? "Агенты" : "Входящие"} /> : chat.id ? <ChatThread id={chat.id} /> : <ChatHome />}
      </div>
    </SidebarInset>
  </SidebarProvider>
);

/**
 * The page frame of every settings screen: one width, one rhythm, one entrance. Screens render only their content,
 * so a new section can't drift wider or narrower than the rest.
 */
export const SettingsPageFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="animate-in fade-in slide-in-from-bottom-1.5 fill-mode-both mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-24 text-sm md:gap-8 md:px-10 md:pt-8 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:slide-in-from-bottom-0">
    {children}
  </div>
);

/** Top of the settings sidebar: back to the chat, Esc hint, search. */
export const SettingsTop = ({ onBack, q, setQ }: { onBack: () => void; q: string; setQ: (q: string) => void }) => (
  <SidebarHeader>
    <div className="flex h-8 items-center justify-between gap-2">
      <Button className="-ml-1" onClick={onBack} size="sm" variant="ghost">
        <ArrowLeft /> Чат
      </Button>
      <Kbd className="text-muted-foreground">Esc</Kbd>
    </div>
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
      <SidebarInput {...NO_AUTOFILL} className="pl-8" onChange={(e) => setQ(e.target.value)} placeholder="Найти настройку" value={q} />
    </div>
  </SidebarHeader>
);

/** The settings sections by group. `below` renders under a section item (e.g. its entries as a sub-menu). */
export const SettingsMenu = ({
  section,
  onSection,
  q,
  below,
  action,
  drills,
}: {
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  q: string;
  below?: (id: SettingsSection) => React.ReactNode;
  action?: (id: SettingsSection) => React.ReactNode;
  /** Items that open a list rather than a screen get a chevron. */
  drills?: (id: SettingsSection) => boolean;
}) => {
  const groups = SETTINGS.map((g) => ({ ...g, items: g.items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q.toLowerCase())) })).filter(
    (g) => g.items.length
  );
  return (
    <>
      {groups.map((g, i) => (
        <Fragment key={g.title}>
          {/* The user's own settings come first; the service's settings start under a divider (admins only). */}
          {g.scope === "admin" && groups[i - 1]?.scope !== "admin" && (
            <div className="px-4 pt-3 pb-1">
              <div className="border-sidebar-border border-t pt-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Администрирование</div>
            </div>
          )}
          <SidebarGroup className="py-1">
            <SidebarGroupLabel>{g.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton isActive={section === item.id} onClick={() => onSection(item.id)}>
                      <item.icon /> <span>{item.label}</span>
                      {drills?.(item.id) && <ChevronRight className="text-muted-foreground ml-auto size-3.5" />}
                    </SidebarMenuButton>
                    {action?.(item.id)}
                    {below?.(item.id)}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Fragment>
      ))}
      {!groups.length && <p className="text-muted-foreground px-4 py-2 text-sm">Ничего не нашлось</p>}
    </>
  );
};

const SettingsMode = ({
  section,
  onSection,
  onBack,
  pages,
}: {
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  onBack: () => void;
  pages?: Pages;
}) => {
  const [q, setQ] = useState("");
  return (
    <SidebarProvider className="animate-in fade-in duration-200 ease-out">
      <Sidebar variant="floating">
        <SettingsTop onBack={onBack} q={q} setQ={setQ} />
        <SidebarContent>
          <SettingsMenu onSection={onSection} q={q} section={section} />
        </SidebarContent>
        <AccountFooter inSettings onSettings={() => undefined} />
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-hidden">
        <main className="flex h-dvh min-h-0 min-w-0 flex-col overflow-y-auto" key={section}>
          {pages?.[section] ?? <SettingsPage section={section} />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};
