"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@metobe/ui/components/input-group";
import { Switch } from "@metobe/ui/components/switch";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { shareChatAction } from "@/app/(app)/(chat)/actions";

/**
 * «Поделиться чатом»: one switch opens the chat to everyone signed in to this Metobe, by its link — to read; only
 * the owner writes, a reader continues in a copy of their own. Once open, the link is there to copy. Turning it
 * off makes the link stop working at once.
 */
export const ShareDialog = ({
  chat,
  onOpenChange,
  onShared,
}: {
  /** The chat being shared; null — the dialog is closed. */
  chat: { id: string; shared?: boolean } | null;
  onOpenChange: (open: boolean) => void;
  /** The switch was saved: the sidebar and the header follow. */
  onShared: (id: string, shared: boolean) => void;
}) => {
  const t = useTranslations("chat.share");
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const shared = Boolean(chat?.shared);
  const link =
    chat && typeof window !== "undefined"
      ? `${window.location.origin}/chat/${chat.id}`
      : "";
  const toggle = (next: boolean) => {
    if (!chat) {
      return;
    }
    setFailed(false);
    // At once on screen; taken back if the server did not keep it.
    onShared(chat.id, next);
    start(async () => {
      const result = await shareChatAction(chat.id, next);
      if (!result.ok) {
        onShared(chat.id, !next);
        setFailed(true);
      }
    });
  };
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setFailed(false);
        }
        onOpenChange(open);
      }}
      open={chat !== null}
    >
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("text")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <label
            className="flex min-w-0 flex-1 flex-col"
            htmlFor="chat-share-switch"
          >
            <span className="text-sm font-medium">{t("toggle")}</span>
            <span className="text-muted-foreground text-xs">
              {shared ? t("on") : t("off")}
            </span>
          </label>
          <Switch
            checked={shared}
            disabled={pending}
            id="chat-share-switch"
            onCheckedChange={toggle}
          />
        </div>
        {shared && (
          <div className="flex flex-col gap-2">
            <InputGroup>
              <InputGroupInput
                aria-label={t("link")}
                onFocus={(e) => e.currentTarget.select()}
                readOnly
                value={link}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton onClick={copy} size="xs">
                  {copied ? <Check /> : <Copy />}
                  {copied ? t("copied") : t("copy")}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <p className="text-muted-foreground text-xs">{t("note")}</p>
          </div>
        )}
        {failed && <p className="text-destructive text-sm">{t("failed")}</p>}
      </DialogContent>
    </Dialog>
  );
};
