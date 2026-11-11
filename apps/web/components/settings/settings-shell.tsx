"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@metobe/ui/components/sidebar";
import { ChevronRight, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";

import { SettingsListLevel } from "@/components/settings/settings-list";
import { lastPage } from "@/lib/last-page";
import { levelMotion } from "@/lib/level-motion";
import type { SettingsLists } from "@/lib/settings-lists";
import { findSection, SETTINGS_NAV } from "@/lib/settings-nav";
import type { SettingsSectionId } from "@/lib/settings-nav";

/** Keeps password managers and autofill off the search field. */
const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-bwignore": true,
  "data-form-type": "other",
  "data-lpignore": "true",
} as const;

const currentId = (pathname: string) => pathname.split("/")[2] ?? "";
/** The entry open inside a list section: /settings/<section>/<entry>. */
const currentEntry = (pathname: string) => pathname.split("/")[3];

const Menu = ({
  admin,
  query,
  onDrill,
  marked,
}: {
  admin: boolean;
  query: string;
  onDrill: (id: SettingsSectionId) => void;
  /** Sections with news for the viewer: a dot after the name («О системе» — a new version). */
  marked: readonly SettingsSectionId[];
}) => {
  const t = useTranslations("settings");
  const pathname = usePathname();
  const active = currentId(pathname);
  const { isMobile, setOpenMobile } = useSidebar();
  const q = query.trim().toLowerCase();
  const groups = SETTINGS_NAV.filter((g) => g.scope === "user" || admin)
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        const id = item.id as SettingsSectionId;
        return (
          !q ||
          `${t(`sections.${id}.label`)} ${t(`sections.${id}.hint`)}`
            .toLowerCase()
            .includes(q)
        );
      }),
    }))
    .filter((g) => g.items.length);

  if (!groups.length) {
    return (
      <p className="text-muted-foreground px-4 py-2 text-sm">{t("nothing")}</p>
    );
  }
  return groups.map((g, i) => (
    <Fragment key={g.key}>
      {/* The user's own settings come first; the service's settings start under a divider (admins only). */}
      {g.scope === "admin" && groups[i - 1]?.scope !== "admin" && (
        <div className="px-4 pt-3 pb-1">
          <div className="border-sidebar-border text-muted-foreground border-t pt-3 text-[11px] font-medium tracking-wide uppercase">
            {t("admin")}
          </div>
        </div>
      )}
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>{t(`groups.${g.key}`)}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {g.items.map((item) => {
              const id = item.id as SettingsSectionId;
              return (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={active === id}
                    onClick={() => {
                      // A list section opens its list in the sidebar itself; a screen closes the sheet.
                      if (item.kind === "list") {
                        onDrill(id);
                      } else if (isMobile) {
                        setOpenMobile(false);
                      }
                    }}
                    render={<Link href={`/settings/${id}`} />}
                  >
                    <item.icon />
                    <span>{t(`sections.${id}.label`)}</span>
                    {marked.includes(id) && (
                      <span
                        aria-hidden
                        className="bg-primary ml-auto size-1.5 shrink-0 rounded-full"
                      />
                    )}
                    {item.kind === "list" && (
                      <ChevronRight className="text-muted-foreground ml-auto size-3.5" />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </Fragment>
  ));
};

/** On phones the sidebar is a sheet behind this bar, the same as in the chat. */
const MobileBar = ({ lists }: { lists: SettingsLists }) => {
  const t = useTranslations("settings");
  const pathname = usePathname();
  const id = currentId(pathname);
  const entry = lists[id as SettingsSectionId]?.entries.find(
    (e) => e.id === currentEntry(pathname)
  );
  const section = findSection(id)
    ? t(`sections.${id as SettingsSectionId}.label`)
    : t("title");
  return (
    <header className="bg-background/95 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:hidden">
      <SidebarTrigger aria-label={t("open")} />
      <span className="truncate text-sm font-semibold">
        {entry?.title ?? section}
      </span>
    </header>
  );
};

/** The menu column: on a wide window a part of it, on a phone the sheet the bar's button opens. */
const Nav = ({
  account,
  children,
}: {
  account: ReactNode;
  children: ReactNode;
}) => {
  const { isMobile } = useSidebar();
  const body = (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
      <SidebarFooter>{account}</SidebarFooter>
    </>
  );
  if (isMobile) {
    return <Sidebar>{body}</Sidebar>;
  }
  return (
    <aside className="bg-sidebar text-sidebar-foreground flex w-60 shrink-0 flex-col border-r">
      {body}
    </aside>
  );
};

/**
 * Settings are a large window over the app (as in T3 Code): the menu and the account row on the left, the screen on the
 * right. Opened from the app it is an intercepted route (`app/(app)/@modal`): the chat stays under it and closing goes
 * back to it; opened by its address it is the same window over an empty page and closing goes to the start.
 */
const NONE: readonly SettingsSectionId[] = [];

export const SettingsShell = ({
  admin,
  account,
  lists,
  marked = NONE,
  intercepted = false,
  children,
}: {
  admin: boolean;
  account: ReactNode;
  /** Lists of the list sections this viewer may open (lib/settings-lists). */
  lists: SettingsLists;
  /** Sections with a dot: news for the viewer there. */
  marked?: readonly SettingsSectionId[];
  /** Over the page it was opened from (soft navigation): closing goes back there. */
  intercepted?: boolean;
  children: ReactNode;
}) => {
  const t = useTranslations("settings");
  const router = useRouter();
  const pathname = usePathname();
  const reduce = Boolean(useReducedMotion());
  const [query, setQuery] = useState("");
  const section = currentId(pathname);
  // Inside a list section the sidebar shows its list; «‹ Настройки» shows the menu without leaving the page.
  const [drilled, setDrilled] = useState(true);
  const [dir, setDir] = useState(1);
  // The section being opened from the menu: its list shows at once, not the previous page's list until the
  // navigation lands.
  const [opening, setOpening] = useState<string | null>(null);
  // «‹ Настройки» is a way back: the page beside the sidebar returns too, to the last screen the user was on before
  // they went into a list — not only the sidebar to its menu.
  const [backing, setBacking] = useState(false);
  const lastScreen = useRef(
    `/settings/${SETTINGS_NAV[0]?.items[0]?.id ?? "account"}`
  );
  useEffect(() => {
    if (findSection(section)?.kind === "screen") {
      lastScreen.current = pathname;
    }
  }, [pathname, section]);
  const [seenSection, setSeenSection] = useState(section);
  if (seenSection !== section) {
    setSeenSection(section);
    setOpening(null);
    setDir(backing ? -1 : 1);
    setBacking(false);
    setDrilled(true);
  }
  const shownSection = opening ?? section;
  const list = lists[shownSection as SettingsSectionId];
  const inside = Boolean(list) && drilled;
  const go = (next: boolean) => {
    setDir(next ? 1 : -1);
    setDrilled(next);
  };
  // The menu is taller than a short window: its active item is scrolled into view, and an edge with more beyond it
  // fades, so a cut-off list reads as one that goes on.
  // A callback ref: it runs each time the menu level is drawn (opening settings, coming back from a list).
  const menu = useCallback((el: HTMLDivElement | null) => {
    if (!el) {
      return;
    }
    const update = () => {
      el.dataset.top = String(el.scrollTop > 2);
      el.dataset.bottom = String(
        el.scrollTop + el.clientHeight < el.scrollHeight - 2
      );
    };
    el.querySelector(
      '[data-sidebar="menu-button"][data-active]:not([data-active="false"])'
    )?.scrollIntoView({
      block: "nearest",
    });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, []);
  // Focus lands on the window, not on its search field: a ring on a field nobody asked for.
  const popup = useRef<HTMLDivElement>(null);
  // Sections visited in the window: none — closing takes the entry it added away; some — it goes to the page it was
  // opened over, not to the section before.
  const visited = useRef(0);
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname !== first.current) {
      visited.current += 1;
      first.current = pathname;
    }
  }, [pathname]);
  const close = () => {
    if (!intercepted) {
      router.push("/");
    } else if (visited.current === 0) {
      router.back();
    } else {
      router.push(lastPage());
    }
  };
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      open
    >
      <DialogContent
        // The page stays under it, blurred: opening settings does not take the chat away.
        initialFocus={popup}
        overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-md"
        ref={popup}
        className="h-[min(60rem,calc(100dvh-3rem))] w-[min(84rem,calc(100vw-3rem))] max-w-none gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:w-screen max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-w-none"
      >
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <SidebarProvider className="h-full min-h-0 w-full">
          <Nav account={account}>
            <AnimatePresence custom={dir} initial={false}>
              <motion.div
                className="absolute inset-0 flex flex-col"
                custom={dir}
                key={inside ? `list:${shownSection}` : "menu"}
                {...levelMotion(reduce)}
              >
                {inside && list ? (
                  <SettingsListLevel
                    activeId={
                      shownSection === section
                        ? currentEntry(pathname)
                        : undefined
                    }
                    list={list}
                    onBack={() => {
                      go(false);
                      // Leaving a list for the page it came from; a screen already there stays put.
                      if (findSection(section)?.kind === "list") {
                        setBacking(true);
                        router.push(lastScreen.current);
                      }
                    }}
                  />
                ) : (
                  <>
                    <SidebarHeader className="shrink-0">
                      <div className="flex h-8 items-center px-2 text-sm font-semibold">
                        {t("title")}
                      </div>
                      <div className="relative">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
                        <SidebarInput
                          {...NO_AUTOFILL}
                          aria-label={t("search")}
                          className="pl-8"
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={t("search")}
                          value={query}
                        />
                      </div>
                    </SidebarHeader>
                    <SidebarContent
                      className="[mask-image:linear-gradient(to_bottom,transparent,black_var(--fade-top),black_calc(100%-var(--fade-bottom)),transparent)] [--fade-bottom:0px] [--fade-top:0px] data-[bottom=true]:[--fade-bottom:2rem] data-[top=true]:[--fade-top:1.5rem] [&_[data-sidebar=menu-button]]:scroll-my-8"
                      ref={menu}
                    >
                      <Menu
                        admin={admin}
                        marked={marked}
                        onDrill={(id) => {
                          setOpening(id);
                          go(true);
                        }}
                        query={query}
                      />
                    </SidebarContent>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </Nav>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <MobileBar lists={lists} />
            {/* The screen's own scroll area */}
            <div className="min-h-0 flex-1 overflow-y-auto text-sm">
              {children}
            </div>
          </div>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
};

/** The frame of every settings screen: one width, one rhythm, one entrance. Screens render only their content. */
export const SettingsPageFrame = ({ children }: { children: ReactNode }) => (
  <div className="animate-in fade-in slide-in-from-bottom-1.5 fill-mode-both motion-reduce:slide-in-from-bottom-0 mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-24 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] md:gap-8 md:px-10 md:pt-8">
    {children}
  </div>
);

/** A screen's title and one-line description. */
export const SettingsHeader = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <header className="flex flex-col gap-1">
    <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
    <p className="text-muted-foreground">{description}</p>
  </header>
);
