"use client";

// Direction «Две зоны»: an icon rail switches areas, a second panel shows that area's navigation.
import { Button } from "@purr/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import { Badge } from "@purr/ui/components/reui/badge";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@purr/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@purr/ui/components/tooltip";
import { cn } from "@purr/ui/lib/utils";
import { PanelLeft, Search, Settings, SquarePen } from "lucide-react";
import { useState } from "react";

import { NO_AUTOFILL } from "../_p7/shared";
import { AccountMenu, Screen, screenTitle, UserAvatar } from "./content";
import { AREAS, CHAT_GROUPS, CHATS, SETTINGS, type View } from "./data";

type Area = "chat" | "agents" | "inbox" | "settings";

const areaOf = (v: View): Area => v.kind;

const RailButton = ({ active, label, onClick, children, soon }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode; soon?: boolean }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          aria-label={label}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-xl transition-colors duration-150 ease-out [&_svg]:size-5",
            active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
          )}
          onClick={onClick}
          type="button"
        />
      }
    >
      {children}
      {soon && <span className="bg-muted-foreground/40 absolute top-1.5 right-1.5 size-1.5 rounded-full" />}
    </TooltipTrigger>
    <TooltipContent side="right">
      {label}
      {soon && " · скоро"}
    </TooltipContent>
  </Tooltip>
);

export const ShellRail = () => {
  const [view, setView] = useState<View>({ kind: "chat" });
  const [panel, setPanel] = useState(true);
  const [q, setQ] = useState("");
  const area = areaOf(view);
  const [crumb, page] = screenTitle(view);

  const go = (a: Area) => {
    setPanel(true);
    if (a === "settings") setView({ kind: "settings", section: view.kind === "settings" ? view.section : "providers" });
    else if (a === "chat") setView({ kind: "chat" });
    else setView({ kind: a });
  };

  return (
    <SidebarProvider className="h-dvh min-h-0">
      {/* Rail */}
      <nav className="bg-sidebar flex w-15 shrink-0 flex-col items-center gap-1 border-r py-3">
        <span className="bg-primary text-primary-foreground mb-3 flex size-9 items-center justify-center rounded-xl text-sm font-semibold">P</span>
        {AREAS.map((a) => (
          <RailButton active={area === a.id} key={a.id} label={a.label} onClick={() => go(a.id)} soon={"soon" in a}>
            <a.icon />
          </RailButton>
        ))}
        <div className="mt-auto flex flex-col items-center gap-2">
          <RailButton active={area === "settings"} label="Настройки" onClick={() => go("settings")}>
            <Settings />
          </RailButton>
          <AccountMenu
            onSettings={() => go("settings")}
            side="right"
            trigger={
              <button aria-label="Аккаунт" className="rounded-full" type="button">
                <UserAvatar className="size-8" />
              </button>
            }
          />
        </div>
      </nav>

      {/* Area panel */}
      {panel && (
        <aside className="bg-sidebar/50 animate-in fade-in slide-in-from-left-2 flex w-64 shrink-0 flex-col border-r duration-150 ease-out" key={area}>
          <div className="flex h-12 items-center justify-between px-3">
            <span className="text-sm font-semibold">{area === "settings" ? "Настройки" : AREAS.find((a) => a.id === area)?.label}</span>
            <Button aria-label="Скрыть панель" onClick={() => setPanel(false)} size="icon-sm" variant="ghost">
              <PanelLeft />
            </Button>
          </div>

          {area === "chat" && (
            <>
              <div className="flex flex-col gap-2 px-3 pb-2">
                <Button className="justify-start" onClick={() => setView({ kind: "chat" })} variant="outline">
                  <SquarePen /> Новый чат
                </Button>
                <InputGroup>
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput {...NO_AUTOFILL} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по чатам" value={q} />
                </InputGroup>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {CHAT_GROUPS.map((g) => {
                  const list = CHATS.filter((c) => c.group === g && c.title.toLowerCase().includes(q.toLowerCase()));
                  if (!list.length) return null;
                  return (
                    <SidebarGroup className="py-1" key={g}>
                      <SidebarGroupLabel>{g}</SidebarGroupLabel>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {list.map((c) => (
                            <SidebarMenuItem key={c.id}>
                              <SidebarMenuButton isActive={view.kind === "chat" && view.id === c.id} onClick={() => setView({ id: c.id, kind: "chat" })}>
                                <span>{c.title}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </SidebarGroup>
                  );
                })}
              </div>
            </>
          )}

          {area === "settings" && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {SETTINGS.map((g) => (
                <SidebarGroup className="py-1" key={g.title}>
                  <SidebarGroupLabel>{g.title}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {g.items.map((item) => (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            isActive={view.kind === "settings" && view.section === item.id}
                            onClick={() => setView({ kind: "settings", section: item.id })}
                          >
                            <item.icon /> <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </div>
          )}

          {(area === "agents" || area === "inbox") && (
            <p className="text-muted-foreground px-3 text-sm">
              <Badge size="sm" variant="secondary">
                v2
              </Badge>{" "}
              Здесь будет список агентов и их результатов.
            </p>
          )}
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          {!panel && (
            <Button aria-label="Показать панель" onClick={() => setPanel(true)} size="icon-sm" variant="ghost">
              <PanelLeft />
            </Button>
          )}
          <span className="text-muted-foreground text-sm">{crumb}</span>
          {page && <span className="truncate text-sm font-medium">· {page}</span>}
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" key={JSON.stringify(view)}>
          <Screen view={view} />
        </div>
      </main>
    </SidebarProvider>
  );
};
