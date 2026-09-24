"use client";

// Direction «Режимы»: the chat keeps a light floating sidebar; settings are a separate admin mode with its own layout.
import { Button } from "@purr/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import { Kbd } from "@purr/ui/components/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@purr/ui/components/sidebar";
import { cn } from "@purr/ui/lib/utils";
import { ArrowLeft, Search, Settings, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";

import { NO_AUTOFILL } from "../_p7/shared";
import { AccountMenu, ChatHome, ChatThread, SettingsPage, SoonPage, UserAvatar } from "./content";
import { AREAS, CHAT_GROUPS, CHATS, SETTINGS, type SettingsSection, USER } from "./data";

type ChatView = { id?: string } | { area: "agents" | "inbox" };

/** `start` and `providers` let other prototypes open the shell right in settings with their own providers page. */
type Pages = Partial<Record<SettingsSection, React.ReactNode>>;

export const ShellModes = ({
  start = "chat",
  providers,
  pages,
}: { start?: "chat" | "settings"; providers?: React.ReactNode; pages?: Pages } = {}) => {
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
  ) : (
    <SettingsMode onBack={() => setMode("chat")} onSection={setSection} pages={{ providers, ...pages }} section={section} />
  );
};

const ChatMode = ({ chat, onChat, onSettings }: { chat: ChatView; onChat: (c: ChatView) => void; onSettings: () => void }) => (
  <SidebarProvider className="animate-in fade-in duration-200 ease-out">
    <Sidebar variant="floating">
      <SidebarHeader>
        <div className="flex h-8 items-center px-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs">P</span>
            Purr
          </span>
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
        <Button aria-label="Настройки" onClick={onSettings} size="icon" title="Настройки (⌘,)" variant="ghost">
          <Settings />
        </Button>
      </SidebarFooter>
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
  const groups = SETTINGS.map((g) => ({ ...g, items: g.items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q.toLowerCase())) })).filter(
    (g) => g.items.length
  );
  return (
    <div className="bg-muted/30 animate-in fade-in slide-in-from-bottom-2 flex h-dvh flex-col duration-200 ease-out">
      <header className="bg-background flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button onClick={onBack} size="sm" variant="ghost">
          <ArrowLeft /> Чат
        </Button>
        <span className="bg-border h-5 w-px" />
        <span className="text-sm font-semibold">Настройки</span>
        <span className="text-muted-foreground hidden text-xs md:inline">
          <Kbd>Esc</Kbd> — вернуться
        </span>
        <div className="ml-auto flex items-center gap-3">
          <InputGroup className="w-72">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput {...NO_AUTOFILL} onChange={(e) => setQ(e.target.value)} placeholder="Найти настройку" value={q} />
          </InputGroup>
          <UserAvatar className="size-8" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="bg-background flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r p-3">
          {groups.map((g) => (
            <div className="flex flex-col gap-0.5" key={g.title}>
              <span className="text-muted-foreground px-2 pb-1 text-xs font-medium">{g.title}</span>
              {g.items.map((item) => (
                <button
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-150 ease-out [&_svg]:size-4",
                    section === item.id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                  key={item.id}
                  onClick={() => onSection(item.id)}
                  type="button"
                >
                  <item.icon /> {item.label}
                </button>
              ))}
            </div>
          ))}
          {!groups.length && <p className="text-muted-foreground px-2 text-sm">Ничего не нашлось</p>}
        </nav>
        <main className="bg-background min-w-0 flex-1 overflow-y-auto" key={section}>
          {pages?.[section] ?? <SettingsPage section={section} />}
        </main>
      </div>
    </div>
  );
};
