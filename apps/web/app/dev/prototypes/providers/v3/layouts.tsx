"use client";

// Where the list of a list → detail settings section lives inside the «Режимы» shell. Four answers, one model.
import { Button } from "@metobe/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@metobe/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@metobe/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronLeft, ChevronsUpDown, Plus, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";

import { SettingsPage } from "../../app-shell/content";
import { settingsItem } from "../../app-shell/data";
import { AccountFooter, type SettingsCtx, SettingsMenu, SettingsPageFrame, SettingsTop } from "../../app-shell/shell-modes";
import { NO_AUTOFILL } from "../../_p7/shared";
import { useListHighlight } from "./parts";
import { AppearancePage } from "./appearance-page";
import { RegionPage } from "./region-page";
import { isListSection, type SectionModel, useSections } from "./sections";
import type { Settings } from "./state";

/** Sections without a list: the user's «Язык и регион», or the placeholder for screens of later stages. */
const OtherPage = ({ section }: { section: SettingsCtx["section"] }) =>
  section === "region" || section === "appearance" ? (
    <SettingsPageFrame>{section === "region" ? <RegionPage /> : <AppearancePage />}</SettingsPageFrame>
  ) : (
    <SettingsPage section={section} />
  );

const Shell = ({ ctx, variant = "floating", sidebar, children }: { ctx: SettingsCtx; variant?: "floating" | "inset"; sidebar: ReactNode; children: ReactNode }) => (
  <SidebarProvider className={cn("animate-in fade-in duration-200 ease-out", variant === "inset" && "bg-sidebar")}>
    <Sidebar variant={variant}>
      {sidebar}
      <AccountFooter inSettings onSettings={() => undefined} />
    </Sidebar>
    <SidebarInset className="min-h-0 overflow-hidden">{children}</SidebarInset>
  </SidebarProvider>
);

const Scroll = ({ children, k }: { children: ReactNode; k: string }) => (
  <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto text-sm" key={k}>
    {children}
  </main>
);

/** A roomy list: logo, title, status line, count. Used by «Холст» and «Погружение». */
const EntryList = ({ m, size = 32 }: { m: SectionModel; size?: number }) => {
  const list = useListHighlight(m.activeId, m.entries.length);
  return (
    <nav className="relative flex flex-col gap-0.5 px-2 pb-3" ref={list.ref}>
      {list.highlight}
      {m.entries.map((e) => {
        const active = e.id === m.activeId;
        return (
          <button
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.99]",
              !active && "hover:bg-sidebar-accent/60"
            )}
            data-active={active}
            key={e.id}
            onClick={() => m.select(e.id)}
            type="button"
          >
            {e.media(size)}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{e.title}</span>
              <span className={cn("flex items-center gap-1.5 truncate text-xs", e.tone === "error" ? "text-destructive" : "text-muted-foreground")}>
                {e.dot && <span className={cn("v3-dot size-1.5 shrink-0 rounded-full", e.dot)} />}
                {e.sub}
              </span>
            </span>
            {e.count !== undefined && <span className="text-muted-foreground text-xs tabular-nums">{e.count}</span>}
          </button>
        );
      })}
    </nav>
  );
};

const AddButton = ({ m }: { m: SectionModel }) =>
  m.add ? (
    <Tooltip>
      <TooltipTrigger render={<Button aria-label={m.add.label} onClick={m.add.run} size="icon-sm" variant="ghost" />}>
        <Plus />
      </TooltipTrigger>
      <TooltipContent>{m.add.label}</TooltipContent>
    </Tooltip>
  ) : null;

const useLayout = (s: Settings, ctx: SettingsCtx) => {
  const sections = useSections(s);
  const m = isListSection(ctx.section) ? sections[ctx.section] : null;
  const [q, setQ] = useState("");
  return { m, q, sections, setQ };
};

// --- 1. Холст: one raised page beside a flat menu; list and detail share it, split by a hairline ------------------

export const LayoutCanvas = ({ s, ctx }: { s: Settings; ctx: SettingsCtx }) => {
  const { m, q, setQ } = useLayout(s, ctx);
  return (
    <Shell
      ctx={ctx}
      sidebar={
        <>
          <SettingsTop onBack={ctx.onBack} q={q} setQ={setQ} />
          <SidebarContent>
            <SettingsMenu onSection={ctx.onSection} q={q} section={ctx.section} />
          </SidebarContent>
        </>
      }
      variant="inset"
    >
      {m ? (
        <div className="flex h-full min-h-0">
          <div className="flex w-72 shrink-0 flex-col border-r">
            <div className="flex items-start justify-between gap-2 px-4 pt-5 pb-3">
              <div>
                <h1 className="text-sm font-semibold">{m.title}</h1>
                <p className="text-muted-foreground text-xs">{m.meta}</p>
              </div>
              <AddButton m={m} />
            </div>
            <div className="min-h-0 overflow-y-auto">
              <EntryList m={m} />
            </div>
          </div>
          <Scroll k={`${ctx.section}:${m.activeId}`}><SettingsPageFrame>{m.detail}</SettingsPageFrame></Scroll>
          {m.extra}
        </div>
      ) : (
        <Scroll k={ctx.section}>
          <OtherPage section={ctx.section} />
        </Scroll>
      )}
    </Shell>
  );
};

// --- 2. Вложенное меню: entries are sub-items of the section right in the sidebar; the detail gets the full width ---

export const LayoutNested = ({ s, ctx }: { s: Settings; ctx: SettingsCtx }) => {
  const { m, q, sections, setQ } = useLayout(s, ctx);
  return (
    <Shell
      ctx={ctx}
      sidebar={
        <>
          <SettingsTop onBack={ctx.onBack} q={q} setQ={setQ} />
          <SidebarContent>
            <SettingsMenu
              action={(id) =>
                id === ctx.section && isListSection(id) && sections[id].add ? (
                  <SidebarMenuAction aria-label={sections[id].add?.label} onClick={sections[id].add?.run} title={sections[id].add?.label}>
                    <Plus />
                  </SidebarMenuAction>
                ) : null
              }
              below={(id) =>
                id === ctx.section && isListSection(id) ? (
                  <SidebarMenuSub className="v3-drop-in">
                    {sections[id].entries.map((e) => (
                      <SidebarMenuSubItem key={e.id}>
                        <SidebarMenuSubButton isActive={e.id === sections[id].activeId} onClick={() => sections[id].select(e.id)} render={<button type="button" />}>
                          {e.media(16)}
                          <span className={cn("truncate", e.tone === "error" && "text-destructive")}>{e.title}</span>
                          {e.dot && <span className={cn("v3-dot ml-auto size-1.5 shrink-0 rounded-full", e.dot)} />}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                ) : null
              }
              onSection={ctx.onSection}
              q={q}
              section={ctx.section}
            />
          </SidebarContent>
        </>
      }
    >
      <Scroll k={`${ctx.section}:${m?.activeId}`}>{m ? <SettingsPageFrame>{m.detail}</SettingsPageFrame> : <OtherPage section={ctx.section} />}</Scroll>
      {m?.extra}
    </Shell>
  );
};

// --- 3. Переключатель: no list column; the detail's top bar switches between entries, with search -------------------

const Switcher = ({ m }: { m: SectionModel }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = m.entries.find((e) => e.id === m.activeId);
  const shown = m.entries.filter((e) => e.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            className="hover:bg-muted flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
            type="button"
          />
        }
      >
        {current?.media(22)}
        {current?.title ?? "Выбрать"}
        {current?.dot && <span className={cn("v3-dot size-1.5 rounded-full", current.dot)} />}
        <ChevronsUpDown className="text-muted-foreground size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        {m.entries.length > 6 && (
          <InputGroup className="mb-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput {...NO_AUTOFILL} autoFocus onChange={(e) => setQ(e.target.value)} placeholder={`Найти: ${m.title.toLowerCase()}`} value={q} />
          </InputGroup>
        )}
        <div className="flex max-h-80 flex-col overflow-y-auto">
          {shown.map((e) => (
            <button
              className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm", e.id === m.activeId ? "bg-muted" : "hover:bg-muted/60")}
              key={e.id}
              onClick={() => {
                m.select(e.id);
                setOpen(false);
              }}
              type="button"
            >
              {e.media(26)}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{e.title}</span>
                <span className={cn("flex items-center gap-1.5 truncate text-xs", e.tone === "error" ? "text-destructive" : "text-muted-foreground")}>
                  {e.dot && <span className={cn("size-1.5 rounded-full", e.dot)} />}
                  {e.sub}
                </span>
              </span>
            </button>
          ))}
          {!shown.length && <p className="text-muted-foreground px-2 py-3 text-center text-xs">Ничего не нашлось</p>}
        </div>
        {m.add && (
          <button
            className="hover:bg-muted text-muted-foreground mt-1 flex w-full items-center gap-2 rounded-md border-t px-2 pt-2 pb-1.5 text-left text-sm"
            onClick={() => {
              setOpen(false);
              m.add?.run();
            }}
            type="button"
          >
            <Plus className="size-4" /> {m.add.label}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
};

export const LayoutSwitcher = ({ s, ctx }: { s: Settings; ctx: SettingsCtx }) => {
  const { m, q, setQ } = useLayout(s, ctx);
  return (
    <Shell
      ctx={ctx}
      sidebar={
        <>
          <SettingsTop onBack={ctx.onBack} q={q} setQ={setQ} />
          <SidebarContent>
            <SettingsMenu onSection={ctx.onSection} q={q} section={ctx.section} />
          </SidebarContent>
        </>
      }
    >
      {m ? (
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-1 border-b px-4">
            <span className="text-muted-foreground px-1 text-sm">{m.title}</span>
            <span className="text-muted-foreground/60">/</span>
            <Switcher m={m} />
            <span className="text-muted-foreground ml-2 text-xs">{m.meta}</span>
            <span className="ml-auto">
              <AddButton m={m} />
            </span>
          </header>
          <Scroll k={`${ctx.section}:${m.activeId}`}><SettingsPageFrame>{m.detail}</SettingsPageFrame></Scroll>
          {m.extra}
        </div>
      ) : (
        <Scroll k={ctx.section}>
          <OtherPage section={ctx.section} />
        </Scroll>
      )}
    </Shell>
  );
};

// --- 4. Погружение: entering a list section, the sidebar itself becomes that section's list; «‹ Настройки» goes back ---
// Levels slide like a stack: forward — the old level leaves left, the new one arrives from the right; back — mirrored.
// Both overlap for a moment with a 2px blur to read as one motion. Each level's header is pinned above its scroll.

const EASE = [0.23, 1, 0.32, 1] as const;
const levelMotion = (reduce: boolean) => ({
  animate: "center",
  exit: "exit",
  initial: "enter",
  transition: { duration: 0.2, ease: EASE },
  variants: {
    center: { filter: "blur(0px)", opacity: 1, transform: "translateX(0px)" },
    enter: (dir: number) => ({ filter: reduce ? "blur(0px)" : "blur(2px)", opacity: 0, transform: `translateX(${reduce ? 0 : dir * 16}px)` }),
    exit: (dir: number) => ({ filter: reduce ? "blur(0px)" : "blur(2px)", opacity: 0, transform: `translateX(${reduce ? 0 : -dir * 16}px)` }),
  },
});

/**
 * Phones: the same sidebar as the chat — a sheet behind the header's trigger, with the same drill-in inside.
 * Picking a screen closes the sheet.
 */
const MobileBar = ({ title }: { title: string }) => (
  <header className="bg-background/95 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:hidden">
    <SidebarTrigger />
    <span className="truncate text-sm font-semibold">{title}</span>
  </header>
);

const DrillBody = ({
  ctx,
  m,
  inside,
  dir,
  go,
  q,
  setQ,
}: {
  ctx: SettingsCtx;
  m: SectionModel | null;
  inside: boolean;
  dir: number;
  go: (next: boolean) => void;
  q: string;
  setQ: (q: string) => void;
}) => {
  const reduce = Boolean(useReducedMotion());
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => {
    if (isMobile) setOpenMobile(false);
  };
  const onSection = (id: typeof ctx.section) => {
    ctx.onSection(id);
    if (isListSection(id)) go(true);
    else close();
  };
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <AnimatePresence custom={dir} initial={false}>
        <motion.div className="absolute inset-0 flex flex-col" custom={dir} key={inside ? `in:${ctx.section}` : "menu"} {...levelMotion(reduce)}>
          {inside && m ? (
            <>
              <SidebarHeader className="shrink-0">
                <div className="flex h-8 items-center justify-between gap-2">
                  <Button className="-ml-1" onClick={() => go(false)} size="sm" variant="ghost">
                    <ChevronLeft /> Настройки
                  </Button>
                  <AddButton m={m} />
                </div>
                <div className="px-2 pt-1">
                  <h1 className="text-sm font-semibold">{m.title}</h1>
                  <p className="text-muted-foreground text-xs">{m.meta}</p>
                </div>
              </SidebarHeader>
              <div className="min-h-0 flex-1 overflow-y-auto pt-1">
                <EntryList
                  m={{
                    ...m,
                    select: (id) => {
                      m.select(id);
                      close();
                    },
                  }}
                  size={28}
                />
              </div>
            </>
          ) : (
            <>
              <div className="shrink-0">
                <SettingsTop onBack={ctx.onBack} q={q} setQ={setQ} />
              </div>
              <SidebarContent>
                <SettingsMenu drills={isListSection} onSection={onSection} q={q} section={ctx.section} />
              </SidebarContent>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export const LayoutDrill = ({ s, ctx }: { s: Settings; ctx: SettingsCtx }) => {
  const { m, q, setQ } = useLayout(s, ctx);
  const [drilled, setDrilled] = useState(true);
  const [dir, setDir] = useState(1);
  const go = (next: boolean) => {
    setDir(next ? 1 : -1);
    setDrilled(next);
  };
  const title = m ? (m.entries.find((e) => e.id === m.activeId)?.title ?? m.title) : settingsItem(ctx.section).label;
  return (
    <Shell ctx={ctx} sidebar={<DrillBody ctx={ctx} dir={dir} go={go} inside={Boolean(m && drilled)} m={m} q={q} setQ={setQ} />}>
      <Scroll k={`${ctx.section}:${m?.activeId}`}>
        <MobileBar title={title} />
        {m ? <SettingsPageFrame>{m.detail}</SettingsPageFrame> : <OtherPage section={ctx.section} />}
      </Scroll>
      {m?.extra}
    </Shell>
  );
};
