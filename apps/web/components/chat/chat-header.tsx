"use client";

import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { cn } from "@metobe/ui/lib/utils";
import { Ellipsis, Pencil, Pin, PinOff, Share, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDelete, RenameField } from "@/components/chat/chat-item";
import type { ChatItem, ChatOps } from "@/components/chat/chat-item";

// The bar over the user's own chat: its name — a click renames it in place — then «Поделиться» and «⋯» with the rest
// of what the sidebar's menu does to a chat (pin, rename, delete). The same ops as the sidebar, so both stay in step.

export const ChatHeader = ({ chat, ops }: { chat: ChatItem; ops: ChatOps }) => {
  const t = useTranslations("chat");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pinned = chat.group === "pinned";
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center">
        {editing ? (
          <div className="w-full max-w-md">
            <RenameField
              className="h-8 text-sm font-medium"
              onDone={(next) => {
                setEditing(false);
                if (next) {
                  ops.rename(chat.id, next);
                }
              }}
              title={chat.title}
            />
          </div>
        ) : (
          <button
            aria-label={t("item.rename")}
            className={cn(
              "hover:bg-muted focus-visible:ring-ring/50 max-w-md min-w-0 truncate rounded-md px-2 py-1 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-[3px]",
              chat.naming && "text-muted-foreground"
            )}
            disabled={chat.naming}
            onClick={() => setEditing(true)}
            title={chat.title}
            type="button"
          >
            {chat.title}
          </button>
        )}
      </div>
      <Button
        className="text-muted-foreground"
        onClick={() => ops.share(chat.id)}
        size="sm"
        variant="ghost"
      >
        <Share />
        <span className="max-sm:sr-only">
          {chat.shared ? t("share.shared") : t("share.button")}
        </span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("item.actions")}
              className="text-muted-foreground"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => ops.pin(chat.id, !pinned)}>
            {pinned ? <PinOff /> : <Pin />}
            {pinned ? t("item.unpin") : t("item.pin")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil /> {t("item.rename")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirming(true)}
            variant="destructive"
          >
            <Trash2 /> {t("item.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDelete
        onConfirm={() => ops.remove(chat.id)}
        onOpenChange={setConfirming}
        open={confirming}
        title={chat.title}
      />
    </>
  );
};
