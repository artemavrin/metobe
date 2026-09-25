"use client";

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
  useSidebar,
} from "@metobe/ui/components/sidebar";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { SettingsListLevel } from "@/components/settings/settings-list";
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
}: {
  admin: boolean;
  query: string;
  onDrill: () => void;
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
                        onDrill();
                      } else if (isMobile) {
                        setOpenMobile(false);
                      }
                    }}
                    render={<Link href={`/settings/${id}`} />}
                  >
                    <item.icon />
                    <span>{t(`sections.${id}.label`)}</span>
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

// Levels slide like a stack (P7 «Погружение»): forward — the menu leaves left and the list comes from the right;
// back — mirrored; both overlap for a moment under a 2px blur so they read as one motion.
const levelMotion = (reduce: boolean) => ({
  animate: "center",
  exit: "exit",
  initial: "enter",
  transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const },
  variants: {
    center: { filter: "blur(0px)", opacity: 1, transform: "translateX(0px)" },
    enter: (dir: number) => ({
      filter: reduce ? "blur(0px)" : "blur(2px)",
      opacity: 0,
      transform: `translateX(${reduce ? 0 : dir * 16}px)`,
    }),
    exit: (dir: number) => ({
      filter: reduce ? "blur(0px)" : "blur(2px)",
      opacity: 0,
      transform: `translateX(${reduce ? 0 : -dir * 16}px)`,
    }),
  },
});

/**
 * Settings are a mode of the same shell as the chat: a floating sidebar with the settings menu and the account row.
 * Esc goes back to the chat unless focus is in a field, a dialog or a menu.
 */
export const SettingsShell = ({
  admin,
  account,
  lists,
  children,
}: {
  admin: boolean;
  account: ReactNode;
  /** Lists of the list sections this viewer may open (lib/settings-lists). */
  lists: SettingsLists;
  children: ReactNode;
}) => {
  const t = useTranslations("settings");
  const router = useRouter();
  const pathname = usePathname();
  const reduce = Boolean(useReducedMotion());
  const [query, setQuery] = useState("");
  const section = currentId(pathname);
  const list = lists[section as SettingsSectionId];
  // Inside a list section the sidebar shows its list; «‹ Настройки» shows the menu without leaving the page.
  const [drilled, setDrilled] = useState(true);
  const [dir, setDir] = useState(1);
  const [seenSection, setSeenSection] = useState(section);
  if (seenSection !== section) {
    setSeenSection(section);
    setDir(1);
    setDrilled(true);
  }
  const inside = Boolean(list) && drilled;
  const go = (next: boolean) => {
    setDir(next ? 1 : -1);
    setDrilled(next);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.key === "Escape" &&
        !target.closest(
          "input, textarea, select, [role=dialog], [role=menu], [role=listbox]"
        )
      ) {
        router.push("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <SidebarProvider>
      <Sidebar variant="floating">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence custom={dir} initial={false}>
            <motion.div
              className="absolute inset-0 flex flex-col"
              custom={dir}
              key={inside ? `list:${section}` : "menu"}
              {...levelMotion(reduce)}
            >
              {inside && list ? (
                <SettingsListLevel
                  activeId={currentEntry(pathname)}
                  list={list}
                  onBack={() => go(false)}
                />
              ) : (
                <>
                  <SidebarHeader className="shrink-0">
                    <div className="flex h-8 items-center justify-between gap-2">
                      <Link
                        className="hover:bg-sidebar-accent -ml-1 flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium"
                        href="/"
                      >
                        <ArrowLeft className="size-4" /> {t("back")}
                      </Link>
                      <Kbd className="text-muted-foreground hidden md:inline-flex">
                        {t("escHint")}
                      </Kbd>
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
                  <SidebarContent>
                    <Menu
                      admin={admin}
                      onDrill={() => go(true)}
                      query={query}
                    />
                  </SidebarContent>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <SidebarFooter>{account}</SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0">
        <MobileBar lists={lists} />
        <main className="min-h-0 flex-1 overflow-y-auto text-sm">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
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
