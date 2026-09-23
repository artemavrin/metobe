"use client";

// Direction «Классика»: one collapsible sidebar — new chat, history, agents, and settings as a tree in the same column.
import { Badge } from "@purr/ui/components/reui/badge";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@purr/ui/components/sidebar";
import { ChevronRight, ChevronsUpDown, Settings, SquarePen } from "lucide-react";
import { useState } from "react";

import { AccountMenu, Screen, screenTitle, UserAvatar } from "./content";
import { AREAS, CHAT_GROUPS, CHATS, SETTINGS, USER, type View } from "./data";

export const ShellClassic = () => {
  const [view, setView] = useState<View>({ kind: "chat" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inSettings = view.kind === "settings";
  const [area, page] = screenTitle(view);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton className="font-semibold" size="lg">
                <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-sm">P</span>
                Purr
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={view.kind === "chat" && !view.id} onClick={() => setView({ kind: "chat" })} tooltip="Новый чат">
                <SquarePen /> <span>Новый чат</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {AREAS.filter((a) => a.id !== "chat").map((a) => (
              <SidebarMenuItem key={a.id}>
                <SidebarMenuButton isActive={view.kind === a.id} onClick={() => setView({ kind: a.id })} tooltip={a.label}>
                  <a.icon /> <span>{a.label}</span>
                </SidebarMenuButton>
                <Badge className="pointer-events-none absolute top-1.5 right-1 group-data-[collapsible=icon]:hidden" size="sm" variant="secondary">
                  скоро
                </Badge>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {CHAT_GROUPS.map((g) => (
            <SidebarGroup className="group-data-[collapsible=icon]:hidden" key={g}>
              <SidebarGroupLabel>{g}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {CHATS.filter((c) => c.group === g).map((c) => (
                    <SidebarMenuItem key={c.id}>
                      <SidebarMenuButton isActive={view.kind === "chat" && view.id === c.id} onClick={() => setView({ id: c.id, kind: "chat" })}>
                        <span>{c.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarSeparator className="mx-0" />
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-expanded={settingsOpen || inSettings}
                isActive={inSettings}
                onClick={() => {
                  setSettingsOpen((v) => !v);
                  if (!inSettings) setView({ kind: "settings", section: "providers" });
                }}
                tooltip="Настройки"
              >
                <Settings /> <span>Настройки</span>
                <ChevronRight className="ml-auto transition-transform duration-200 ease-out group-aria-expanded/menu-button:rotate-90" />
              </SidebarMenuButton>
              {(settingsOpen || inSettings) && (
                <SidebarMenuSub className="animate-in fade-in slide-in-from-top-1 max-h-[40vh] overflow-y-auto duration-150">
                  {SETTINGS.flatMap((grp) => grp.items).map((item) => (
                    <SidebarMenuSubItem key={item.id}>
                      <SidebarMenuSubButton
                        isActive={inSettings && view.section === item.id}
                        onClick={() => setView({ kind: "settings", section: item.id })}
                        render={<button type="button" />}
                      >
                        <span>{item.label}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
            <SidebarMenuItem>
              <AccountMenu
                onSettings={() => setView({ kind: "settings", section: "providers" })}
                trigger={
                  <SidebarMenuButton size="lg">
                    <UserAvatar className="size-8" />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate font-medium">{USER.name}</span>
                      <span className="text-muted-foreground truncate text-xs">{USER.role}</span>
                    </span>
                    <ChevronsUpDown className="ml-auto" />
                  </SidebarMenuButton>
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <span className="text-muted-foreground text-sm">{area}</span>
          {page && (
            <>
              <ChevronRight className="text-muted-foreground size-3.5" />
              <span className="truncate text-sm font-medium">{page}</span>
            </>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" key={JSON.stringify(view)}>
          <Screen view={view} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};
