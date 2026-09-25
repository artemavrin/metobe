"use client";

import { Button } from "@metobe/ui/components/button";
import {
  SidebarHeader,
  SidebarInput,
  useSidebar,
} from "@metobe/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronLeft, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { ProxyMark } from "@/components/proxy-mark";
import type { SettingsList } from "@/lib/settings-lists";

// The list level of the settings sidebar (P7 «Погружение»): the section's entries, with the selected row's background
// sliding to the new row — the detail came from here.

/** Lists longer than this get a search. */
const SEARCH_FROM = 6;

const DOT: Record<SettingsList["entries"][number]["state"], string> = {
  error: "bg-destructive",
  none: "hidden",
  off: "bg-muted-foreground/40",
  ok: "bg-success",
  unchecked: "bg-muted-foreground/40",
};

/** The selected-row background; the first placement doesn't slide. */
const useListHighlight = (activeKey: string | undefined, count: number) => {
  const ref = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  // Re-measured when the selection or the number of rows changes.
  useLayoutEffect(() => {
    const el =
      activeKey && count > 0
        ? ref.current?.querySelector<HTMLElement>(`[data-entry="${activeKey}"]`)
        : null;
    setBox(el ? { h: el.offsetHeight, y: el.offsetTop } : null);
  }, [activeKey, count]);
  useEffect(() => {
    if (box && !ready) {
      requestAnimationFrame(() => setReady(true));
    }
  }, [box, ready]);
  const highlight = box ? (
    <span
      aria-hidden
      className={cn(
        "bg-sidebar-accent pointer-events-none absolute inset-x-2 top-0 rounded-lg",
        ready &&
          "transition-transform duration-200 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none"
      )}
      style={{ height: box.h, transform: `translateY(${box.y}px)` }}
    />
  ) : null;
  return { highlight, ref };
};

export const SettingsListLevel = ({
  list,
  activeId,
  onBack,
}: {
  list: SettingsList;
  activeId: string | undefined;
  onBack: () => void;
}) => {
  const t = useTranslations("settings");
  const { isMobile, setOpenMobile } = useSidebar();
  // Long lists (providers, proxies) get a search; it resets with the section, since the level remounts.
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const entries = q
    ? list.entries.filter((e) => e.title.toLowerCase().includes(q))
    : list.entries;
  const { highlight, ref } = useListHighlight(activeId, entries.length);
  const close = () => isMobile && setOpenMobile(false);
  return (
    <>
      <SidebarHeader className="shrink-0">
        <div className="flex h-8 items-center justify-between gap-2">
          <Button className="-ml-1" onClick={onBack} size="sm" variant="ghost">
            <ChevronLeft /> {t("title")}
          </Button>
          {list.add && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={list.add.label}
                    nativeButton={false}
                    onClick={close}
                    render={<Link href={list.add.href} />}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <Plus />
              </TooltipTrigger>
              <TooltipContent>{list.add.label}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="px-2 pt-1">
          <h1 className="text-sm font-semibold">{list.title}</h1>
          <p className="text-muted-foreground text-xs">{list.meta}</p>
        </div>
        {list.entries.length > SEARCH_FROM && (
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
            <SidebarInput
              aria-label={t("listSearch")}
              autoComplete="off"
              className="pl-8"
              data-1p-ignore
              data-lpignore="true"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("listSearch")}
              value={query}
            />
          </div>
        )}
      </SidebarHeader>
      <div className="min-h-0 flex-1 overflow-y-auto pt-1">
        <nav className="relative flex flex-col gap-0.5 px-2 pb-3" ref={ref}>
          {highlight}
          {entries.length === 0 && (
            <p className="text-muted-foreground px-2.5 py-2 text-sm">
              {t("nothing")}
            </p>
          )}
          {entries.map((e) => {
            const active = e.id === activeId;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.99]",
                  !active && "hover:bg-sidebar-accent/60"
                )}
                data-active={active}
                data-entry={e.id}
                href={e.href}
                key={e.id}
                onClick={close}
              >
                {e.mark ? (
                  <ProxyMark flag={e.mark.flag} size={28} />
                ) : (
                  <BrandLogo label={e.title} logo={e.logo} size={28} />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{e.title}</span>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 truncate text-xs",
                      e.state === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full transition-colors duration-200",
                        DOT[e.state]
                      )}
                    />
                    {e.sub}
                  </span>
                </span>
                {e.count !== undefined && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {e.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
};
