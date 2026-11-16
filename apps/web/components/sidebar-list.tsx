"use client";

import { Button } from "@metobe/ui/components/button";
import { SidebarHeader } from "@metobe/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import type { MouseEventHandler, ReactNode } from "react";

// The list level of the app's sidebar (P7 «Погружение»): the settings' lists and the memory's list are drawn by these
// parts — a header with a way back, a title and a «+»; rows with a picture, a title, a state and a count; headings of
// groups with their own «+»; the selected row's background sliding to the new row.

export type RowState =
  | "ok"
  | "warning"
  | "error"
  | "off"
  | "unchecked"
  | "none";

const DOT: Record<RowState, string> = {
  error: "bg-destructive",
  none: "hidden",
  off: "bg-muted-foreground/40",
  ok: "bg-success",
  unchecked: "bg-muted-foreground/40",
  warning: "bg-warning",
};

/** The selected-row background; the first placement doesn't slide. */
export const useListHighlight = (activeKey: string | undefined) => {
  // The list element, as a state: it may stand later than the hook (while the rows are being read).
  const [list, setList] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  // Measured when the selection changes, and again whenever the list changes its size: rows come and go, a line
  // appears under a title, the list is read. The state changes only when the row really moved.
  useLayoutEffect(() => {
    const measure = () => {
      const el = activeKey
        ? list?.querySelector<HTMLElement>(`[data-entry="${activeKey}"]`)
        : null;
      const next = el ? { h: el.offsetHeight, y: el.offsetTop } : null;
      setBox((prev) =>
        prev === next ||
        (prev && next && prev.h === next.h && prev.y === next.y)
          ? prev
          : next
      );
    };
    measure();
    if (!list) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeKey, list]);
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
  return { highlight, ref: setList };
};

/** A kind's own picture in a tile, in place of a logo. */
export const KindTile = ({ children }: { children: ReactNode }) => (
  <span className="bg-background text-muted-foreground grid size-7 shrink-0 place-items-center rounded-md border [&_svg]:size-3.5">
    {children}
  </span>
);

/** One row: its picture, its title, where it stands (a dot and a line), a count. */
export const ListRow = ({
  entryKey,
  href,
  active,
  onClick,
  leading,
  title,
  sub,
  state = "none",
  warn = false,
  count,
  tip,
}: {
  /** What the highlight finds the row by. */
  entryKey: string;
  href: string;
  active: boolean;
  onClick: MouseEventHandler<HTMLAnchorElement>;
  leading: ReactNode;
  title: string;
  /** The line under the title; with no line and no dot the row is one line. */
  sub?: string;
  /** Drives the dot in front of the line. */
  state?: RowState;
  /** The line is in the warning colour (an error). */
  warn?: boolean;
  count?: number;
  /** A hover note, for what the dot means. */
  tip?: string;
}) => (
  <Link
    aria-current={active ? "page" : undefined}
    className={cn(
      "relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.99]",
      !active && "hover:bg-sidebar-accent/60"
    )}
    data-active={active}
    data-entry={entryKey}
    href={href}
    onClick={onClick}
    title={tip}
  >
    {leading}
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-medium">{title}</span>
      {(sub !== undefined || state !== "none") && (
        <span
          className={cn(
            "flex items-center gap-1.5 truncate text-xs",
            warn ? "text-destructive" : "text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors duration-200",
              DOT[state]
            )}
          />
          {sub}
        </span>
      )}
    </span>
    {count !== undefined && (
      <span className="text-muted-foreground text-xs tabular-nums">
        {count}
      </span>
    )}
  </Link>
);

/** A heading of a group of rows, with its own «+» when rows can be added to it. */
export const ListHeading = ({
  title,
  add,
}: {
  title: string;
  add?: { label: string; href?: string; onClick: () => void };
}) => {
  const handleAdd = add?.onClick;
  return (
    <div className="flex items-center justify-between pt-3 pr-1 pb-1 pl-2.5">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {title}
      </p>
      {add && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={add.label}
                className="text-muted-foreground"
                nativeButton={!add.href}
                onClick={handleAdd}
                render={add.href ? <Link href={add.href} /> : undefined}
                size="icon-xs"
                variant="ghost"
              />
            }
          >
            <Plus />
          </TooltipTrigger>
          <TooltipContent>{add.label}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

/** A heading of a group with no «+» (and, for a plain list, no link): the text alone. */
export const ListLabel = ({ title }: { title: string }) => (
  <p className="text-muted-foreground px-2.5 pt-3 pb-1 text-[11px] font-medium tracking-wide uppercase">
    {title}
  </p>
);

/** The top of a list level: the way back, the title and a line under it, a «+», and what searches the list. */
export const ListHeader = ({
  back,
  title,
  meta,
  add,
  children,
}: {
  back: { label: string; onClick: () => void; href?: string };
  title: string;
  meta?: string;
  add?: { label: string; href?: string; onClick: () => void };
  /** The search field. */
  children?: ReactNode;
}) => {
  const handleBack = back.onClick;
  const handleAdd = add?.onClick;
  return (
    <SidebarHeader className="shrink-0">
      <div className="flex h-8 items-center justify-between gap-2">
        <Button
          className="-ml-1"
          nativeButton={!back.href}
          onClick={handleBack}
          render={back.href ? <Link href={back.href} /> : undefined}
          size="sm"
          variant="ghost"
        >
          <ChevronLeft /> {back.label}
        </Button>
        {add && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={add.label}
                  nativeButton={!add.href}
                  onClick={handleAdd}
                  render={add.href ? <Link href={add.href} /> : undefined}
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <Plus />
            </TooltipTrigger>
            <TooltipContent>{add.label}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="px-2 pt-1">
        <h1 className="text-sm font-semibold">{title}</h1>
        {meta && <p className="text-muted-foreground text-xs">{meta}</p>}
      </div>
      {children}
    </SidebarHeader>
  );
};
