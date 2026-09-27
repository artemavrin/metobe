"use client";

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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@metobe/ui/components/sidebar";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowLeft, ChevronLeft, ChevronRight, type LucideIcon, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Fragment, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { SettingsHeader, SettingsPageFrame } from "@/components/settings/settings-shell";
import { SETTINGS_NAV, type SettingsSectionId } from "@/lib/settings-nav";

import { PERSON } from "./data";
import { useProto } from "./state";

// The settings shell as it is in the product (P7 «Погружение»): a floating sidebar with the menu, a list section drills
// into its entries, the account row at the bottom. Routes are local state here, so the prototype stays one page.

export type NavItem = { id: string; label: string; icon: LucideIcon; kind: "screen" | "list"; badge?: number };
export type DrillEntry = { id: string; title: string; media: ReactNode; sub: string; dot: string; group?: string };
export type Drill = { title: string; meta: string; entries: DrillEntry[]; activeId?: string; onSelect: (id: string) => void };

/** The catalog of MCP servers keeps its place in the admin part under a name of its own; «Подключения» are the user's. */
const ADMIN_LABEL: Partial<Record<SettingsSectionId, string>> = { connections: "MCP-серверы" };

const levelMotion = (reduce: boolean) => ({
  animate: "center",
  exit: "exit",
  initial: "enter",
  transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const },
  variants: {
    center: { filter: "blur(0px)", opacity: 1, transform: "translateX(0px)" },
    enter: (dir: number) => ({ filter: reduce ? "blur(0px)" : "blur(2px)", opacity: 0, transform: `translateX(${reduce ? 0 : dir * 16}px)` }),
    exit: (dir: number) => ({ filter: reduce ? "blur(0px)" : "blur(2px)", opacity: 0, transform: `translateX(${reduce ? 0 : -dir * 16}px)` }),
  },
});

const initials = (name: string) =>
  name
    .split(/\s+/u)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** The selected row's background slides to the new row, as in the product's list level. */
const useListHighlight = (activeKey: string | undefined, count: number) => {
  const ref = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const el = activeKey && count > 0 ? ref.current?.querySelector<HTMLElement>(`[data-entry="${activeKey}"]`) : null;
    setBox(el ? { h: el.offsetHeight, y: el.offsetTop } : null);
  }, [activeKey, count]);
  useEffect(() => {
    if (box && !ready) requestAnimationFrame(() => setReady(true));
  }, [box, ready]);
  const highlight = box ? (
    <span
      aria-hidden
      className={cn(
        "bg-sidebar-accent pointer-events-none absolute inset-x-2 top-0 rounded-lg",
        ready && "transition-transform duration-200 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none"
      )}
      style={{ height: box.h, transform: `translateY(${box.y}px)` }}
    />
  ) : null;
  return { highlight, ref };
};

const DrillLevel = ({ drill, onBack }: { drill: Drill; onBack: () => void }) => {
  const t = useTranslations("settings");
  const { isMobile, setOpenMobile } = useSidebar();
  const { highlight, ref } = useListHighlight(drill.activeId, drill.entries.length);
  return (
    <>
      <SidebarHeader className="shrink-0">
        <div className="flex h-8 items-center gap-2">
          <Button className="-ml-1" onClick={onBack} size="sm" variant="ghost">
            <ChevronLeft /> {t("title")}
          </Button>
        </div>
        <div className="px-2 pt-1">
          <h1 className="text-sm font-semibold">{drill.title}</h1>
          <p className="text-muted-foreground text-xs">{drill.meta}</p>
        </div>
      </SidebarHeader>
      <div className="min-h-0 flex-1 overflow-y-auto pt-1">
        <nav className="relative flex flex-col gap-0.5 px-2 pb-3" ref={ref}>
          {highlight}
          {drill.entries.length === 0 && <p className="text-muted-foreground px-2.5 py-2 text-sm">{t("nothing")}</p>}
          {drill.entries.map((e, i) => {
            const active = e.id === drill.activeId;
            const heading = e.group && e.group !== drill.entries[i - 1]?.group ? e.group : null;
            return (
              <Fragment key={e.id}>
                {heading && (
                  <p className="text-muted-foreground px-2.5 pt-3 pb-1 text-[11px] font-medium tracking-wide uppercase">{heading}</p>
                )}
                <button
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.99]",
                    !active && "hover:bg-sidebar-accent/60"
                  )}
                  data-entry={e.id}
                  onClick={() => {
                    drill.onSelect(e.id);
                    if (isMobile) setOpenMobile(false);
                  }}
                  type="button"
                >
                  <span className="relative">
                    {e.media}
                    <span className={cn("ring-sidebar absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2", e.dot)} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className={cn("truncate", active && "font-medium")}>{e.title}</span>
                    <span className="text-muted-foreground truncate text-xs">{e.sub}</span>
                  </span>
                </button>
              </Fragment>
            );
          })}
        </nav>
      </div>
    </>
  );
};

/** The account row: who you are and your role; a variant may make it the way into the account. */
export const AccountRow = ({ onClick, active }: { onClick?: () => void; active?: boolean }) => {
  const { role } = useProto();
  const body = (
    <>
      <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
        {initials(PERSON.name)}
      </span>
      <span className="flex min-w-0 flex-col text-left leading-tight">
        <span className="truncate text-sm font-medium">{PERSON.name}</span>
        <span className="text-muted-foreground truncate text-xs">{role === "admin" ? "Администратор" : "Пользователь"}</span>
      </span>
    </>
  );
  if (!onClick) return <div className="flex items-center gap-2.5 px-1 py-1">{body}</div>;
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-1 py-1 transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.99]",
        active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
      )}
      onClick={onClick}
      type="button"
    >
      {body}
      <ChevronRight className="text-muted-foreground ml-auto size-3.5" />
    </button>
  );
};

/** A section of the admin part: outside this prototype, only named. */
export const AdminStub = ({ id }: { id: SettingsSectionId }) => {
  const t = useTranslations("settings");
  const title = ADMIN_LABEL[id] ?? t(`sections.${id}.label`);
  return (
    <SettingsPageFrame>
      <SettingsHeader
        description={
          id === "connections"
            ? "Каталог серверов для всей организации: админ добавляет их и решает, чьи учётные данные. Свои учётки админ вводит в «Подключениях», как все."
            : "Раздел администратора — в этом прототипе не меняется."
        }
        title={title}
      />
    </SettingsPageFrame>
  );
};

export const ProtoShell = ({
  personal,
  active,
  onOpen,
  drill,
  footer,
  children,
}: {
  personal: NavItem[];
  active: string;
  onOpen: (id: string) => void;
  /** The open list section's entries: the sidebar drills into them. */
  drill?: Drill;
  footer?: ReactNode;
  children: ReactNode;
}) => {
  const t = useTranslations("settings");
  const { role } = useProto();
  const reduce = Boolean(useReducedMotion());
  const [inside, setInside] = useState(Boolean(drill));
  const [dir, setDir] = useState(1);
  const [query, setQuery] = useState("");
  const go = (next: boolean) => {
    setDir(next ? 1 : -1);
    setInside(next);
  };
  const q = query.trim().toLowerCase();
  const match = (label: string) => !q || label.toLowerCase().includes(q);
  const adminGroups = role === "admin" ? SETTINGS_NAV.filter((g) => g.scope === "admin") : [];
  const shownPersonal = personal.filter((i) => match(i.label));
  const title =
    personal.find((i) => i.id === active)?.label ??
    (active.startsWith("admin:") ? (ADMIN_LABEL[active.slice(6) as SettingsSectionId] ?? t(`sections.${active.slice(6) as SettingsSectionId}.label`)) : t("title"));

  const menu = (
    <>
      <SidebarHeader className="shrink-0">
        <div className="flex h-8 items-center justify-between gap-2">
          <Link className="hover:bg-sidebar-accent -ml-1 flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium" href="/dev/prototypes">
            <ArrowLeft className="size-4" /> {t("back")}
          </Link>
          <Kbd className="text-muted-foreground hidden md:inline-flex">{t("escHint")}</Kbd>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
          <SidebarInput aria-label={t("search")} autoComplete="off" className="pl-8" onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} value={query} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {shownPersonal.length > 0 && (
          <SidebarGroup className="py-1">
            <SidebarGroupLabel>{t("groups.account")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {shownPersonal.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={active === item.id}
                      onClick={() => {
                        onOpen(item.id);
                        if (item.kind === "list") go(true);
                      }}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                      {item.kind === "list" && <ChevronRight className="text-muted-foreground ml-auto size-3.5" />}
                    </SidebarMenuButton>
                    {item.badge ? <SidebarMenuBadge className="bg-warning/15 text-warning-foreground rounded-full dark:text-warning">{item.badge}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {adminGroups.length > 0 && (
          <div className="px-4 pt-3 pb-1">
            <div className="border-sidebar-border text-muted-foreground border-t pt-3 text-[11px] font-medium tracking-wide uppercase">{t("admin")}</div>
          </div>
        )}
        {adminGroups.map((g) => {
          const items = g.items.filter((i) => match(ADMIN_LABEL[i.id] ?? t(`sections.${i.id}.label`)));
          if (!items.length) return null;
          return (
            <SidebarGroup className="py-1" key={g.key}>
              <SidebarGroupLabel>{t(`groups.${g.key}`)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton isActive={active === `admin:${item.id}`} onClick={() => onOpen(`admin:${item.id}`)}>
                        <item.icon />
                        <span>{ADMIN_LABEL[item.id] ?? t(`sections.${item.id}.label`)}</span>
                        {item.kind === "list" && <ChevronRight className="text-muted-foreground ml-auto size-3.5" />}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </>
  );

  return (
    <SidebarProvider className="h-svh">
      <Sidebar variant="floating">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence custom={dir} initial={false}>
            <motion.div className="absolute inset-0 flex flex-col" custom={dir} key={inside && drill ? "list" : "menu"} {...levelMotion(reduce)}>
              {inside && drill ? <DrillLevel drill={drill} onBack={() => go(false)} /> : menu}
            </motion.div>
          </AnimatePresence>
        </div>
        <SidebarFooter>{footer ?? <AccountRow />}</SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0">
        <header className="bg-background/95 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:hidden">
          <SidebarTrigger aria-label={t("open")} />
          <span className="truncate text-sm font-semibold">{title}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto text-sm">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
};
