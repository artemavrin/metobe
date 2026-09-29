"use client";

import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { Input } from "@metobe/ui/components/input";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@metobe/ui/components/sidebar";
import { cn } from "@metobe/ui/lib/utils";
import { Ellipsis, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { ChatGroup } from "@/lib/chat-history";

export interface ChatItem {
  id: string;
  title: string;
  group: ChatGroup;
}

/** What the sidebar does with a chat: each changes the list at once and tells the server. */
export interface ChatOps {
  rename: (id: string, title: string) => void;
  pin: (id: string, pinned: boolean) => void;
  remove: (id: string) => void;
}

// How fast a long title slides under the cursor, in pixels per second — and the longest it may take: a very long
// title goes faster rather than keeping the pointer waiting.
const MARQUEE_SPEED = 60;
const MARQUEE_MAX_SECONDS = 8;

/**
 * A title that fits the row shows as it is; a longer one is cut with a soft fade, and while the pointer is on the
 * row it slides to its end and stays there (back at once when the pointer leaves). The distance is CSS's own
 * (`100cqw - 100%`), only the time follows the length so the speed is the same for every title.
 */
const MarqueeTitle = ({ title }: { title: string }) => {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!(o && i)) {
      return;
    }
    const measure = () =>
      setOverflow(Math.max(0, i.scrollWidth - o.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    // The row's width changes with the sidebar, the title's with a rename.
    observer.observe(o);
    observer.observe(i);
    return () => observer.disconnect();
  }, []);
  return (
    <span
      className={cn(
        "[container-type:inline-size] block min-w-0 flex-1 overflow-hidden",
        // The fade marks a cut title; with the pointer on the row the title slides, and its end must be plain.
        overflow > 0 &&
          "[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] group-hover/menu-item:[mask-image:none]"
      )}
      ref={outer}
    >
      <span
        className="block w-max whitespace-nowrap transition-transform duration-200 ease-out group-hover/menu-item:[transform:translateX(min(0px,calc(100cqw-100%)))] group-hover/menu-item:delay-300 group-hover/menu-item:[transition-duration:var(--marquee)] group-hover/menu-item:ease-linear motion-reduce:group-hover/menu-item:transform-none"
        data-overflow={overflow > 0 ? "" : undefined}
        ref={inner}
        style={
          {
            "--marquee": `${Math.min(MARQUEE_MAX_SECONDS, Math.max(1, overflow / MARQUEE_SPEED))}s`,
          } as CSSProperties
        }
      >
        {title}
      </span>
    </span>
  );
};

/** The name in an input where the title stood: Enter keeps it, Esc and leaving the field with nothing new drop it. */
const RenameField = ({
  title,
  onDone,
}: {
  title: string;
  onDone: (next: string | null) => void;
}) => {
  const t = useTranslations("chat.item");
  const [draft, setDraft] = useState(title);
  const finished = useRef(false);
  const finish = (keep: boolean) => {
    if (finished.current) {
      return;
    }
    finished.current = true;
    const next = draft.trim();
    onDone(keep && next && next !== title ? next : null);
  };
  return (
    <Input
      aria-label={t("renameLabel")}
      autoComplete="off"
      autoFocus
      className="h-8"
      maxLength={200}
      onBlur={() => finish(true)}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          finish(true);
        } else if (e.key === "Escape") {
          finish(false);
        }
      }}
      value={draft}
    />
  );
};

/** «Удалить чат?»: a chat cannot be brought back, so a click asks once. */
const ConfirmDelete = ({
  title,
  open,
  onOpenChange,
  onConfirm,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => {
  const t = useTranslations("chat.item");
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("deleteTitle")}</DialogTitle>
          <DialogDescription>{t("deleteText", { title })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            {t("cancel")}
          </DialogClose>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            variant="destructive"
          >
            {t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** A chat in the sidebar: its title (a long one slides on hover) and, on hover, a menu — pin, rename, delete. */
export const ChatRow = ({
  chat,
  active,
  ops,
  onNavigate,
}: {
  chat: ChatItem;
  active: boolean;
  ops: ChatOps;
  onNavigate: () => void;
}) => {
  const t = useTranslations("chat.item");
  const { isMobile } = useSidebar();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pinned = chat.group === "pinned";
  if (editing) {
    return (
      <SidebarMenuItem>
        <RenameField
          onDone={(next) => {
            setEditing(false);
            if (next) {
              ops.rename(chat.id, next);
            }
          }}
          title={chat.title}
        />
      </SidebarMenuItem>
    );
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={onNavigate}
        render={<Link href={`/chat/${chat.id}`} />}
      >
        <MarqueeTitle title={chat.title} />
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<SidebarMenuAction aria-label={t("actions")} showOnHover />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={isMobile ? "end" : "start"}
          className="w-48"
          side={isMobile ? "bottom" : "right"}
        >
          <DropdownMenuItem onClick={() => ops.pin(chat.id, !pinned)}>
            {pinned ? <PinOff /> : <Pin />}
            {pinned ? t("unpin") : t("pin")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil /> {t("rename")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirming(true)}
            variant="destructive"
          >
            <Trash2 /> {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDelete
        onConfirm={() => ops.remove(chat.id)}
        onOpenChange={setConfirming}
        open={confirming}
        title={chat.title}
      />
    </SidebarMenuItem>
  );
};
