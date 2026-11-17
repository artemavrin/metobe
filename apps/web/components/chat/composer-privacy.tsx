"use client";

import { Button } from "@metobe/ui/components/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@metobe/ui/components/reui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Paperclip, Server, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { fetchDraftPreview } from "@/lib/draft-preview";
import type { DraftPreview } from "@/lib/draft-preview";
import { countHidden, splitLabels } from "@/lib/model-view";

import { Seen } from "./model-lens";

// What the model would get (P31 «Ввод · над текстом», PII-GUARD-PLAN З7): a shield with the number of hidden values in
// the composer's button row; pressed, the draft as the model would get it opens inside the field, above the text.
// A local model gets the text as it is — a note, not a switch; the service down — the message would not go.

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const ENTER = `animate-in fade-in slide-in-from-bottom-1 duration-200 ${EASE} motion-reduce:slide-in-from-bottom-0`;
/** A draft is looked at once the person pauses: not on every key. */
const PAUSE_MS = 600;

const Tip = ({ children }: { children: ReactNode }) => (
  <TooltipContent
    arrow={false}
    className="bg-sidebar text-foreground ring-foreground/10 shadow-md ring-1"
    sideOffset={6}
  >
    {children}
  </TooltipContent>
);

/** The draft's preview for the chosen model; null while there is nothing to show (no chat, an empty draft). */
export const useDraftPreview = ({
  chatId,
  modelId,
  text,
}: {
  chatId?: string;
  modelId: string;
  text: string;
}) => {
  const asked = chatId && text.trim() ? `${chatId}\n${modelId}\n${text}` : "";
  const [got, setGot] = useState<{
    asked: string;
    preview: DraftPreview;
  } | null>(null);
  useEffect(() => {
    if (!(asked && chatId)) {
      return;
    }
    const controller = new AbortController();
    const look = async () => {
      try {
        const preview = await fetchDraftPreview(
          chatId,
          modelId,
          text,
          controller.signal
        );
        if (preview) {
          setGot({ asked, preview });
        }
      } catch {
        // An aborted look (the draft changed) or no answer: nothing to show.
      }
    };
    const timer = setTimeout(() => {
      void look();
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [asked, chatId, modelId, text]);
  // An answer for an older draft is not this draft's: shown only while it fits.
  return got && got.asked === asked ? got.preview : null;
};

/** The message would not go to an external model: the service is down, or it holds a type the settings refuse. */
export const isBlocked = (preview: DraftPreview | null) =>
  preview?.state === "down" || preview?.state === "blocked";

/** How many values the draft hides; 0 when the preview has none. */
export const hiddenOf = (preview: DraftPreview | null) =>
  preview?.state === "masked" ? countHidden([preview.text], preview.labels) : 0;

/** The button row's mark: the shield and its count, a local model's note, or the service being down. */
export const PreviewMark = ({
  preview,
  open,
  onToggle,
  compact,
}: {
  preview: DraftPreview | null;
  open: boolean;
  onToggle: () => void;
  compact: boolean;
}) => {
  const t = useTranslations("chat.lensInput");
  if (preview?.state === "local") {
    return (
      <Tooltip>
        <TooltipTrigger
          delay={300}
          render={
            <span
              className={cn(
                "text-muted-foreground flex h-7 shrink-0 items-center gap-1.5 px-2 text-xs",
                ENTER
              )}
            />
          }
        >
          <Server className="size-3.5" />
          {!compact && t("local")}
        </TooltipTrigger>
        <Tip>{t("localTip")}</Tip>
      </Tooltip>
    );
  }
  if (preview?.state === "down" || preview?.state === "blocked") {
    const why = preview.state;
    return (
      <Button
        aria-expanded={open}
        className={cn(
          "text-destructive hover:text-destructive aria-expanded:text-destructive h-7 min-w-0 gap-1.5 rounded-full px-2 text-xs font-normal [&_svg]:size-3.5",
          ENTER
        )}
        onClick={onToggle}
        size="xs"
        type="button"
        variant="ghost"
      >
        <ShieldAlert className="shrink-0" />
        <span className="truncate">{compact ? t(`${why}Short`) : t(why)}</span>
      </Button>
    );
  }
  const count = hiddenOf(preview);
  if (count === 0) {
    return null;
  }
  return (
    <Tooltip>
      <TooltipTrigger
        delay={500}
        render={
          <Button
            aria-label={t("show", { count })}
            aria-pressed={open}
            className={cn(
              "text-muted-foreground hover:text-foreground h-7 shrink-0 gap-1 rounded-full px-2 text-xs font-medium transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 [&_svg]:size-3.5",
              open &&
                "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400",
              ENTER
            )}
            onClick={onToggle}
            size="xs"
            type="button"
            variant="ghost"
          />
        }
      >
        <ShieldCheck />
        <span className="tabular-nums" key={count}>
          {count}
        </span>
      </TooltipTrigger>
      <Tip>{open ? t("hide") : t("show", { count })}</Tip>
    </Tooltip>
  );
};

/** Opens in place over grid rows, no measuring; closes faster than it opens. */
const Expand = ({ open, children }: { open: boolean; children: ReactNode }) => (
  <div
    className={cn(
      "grid transition-[grid-template-rows,opacity] motion-reduce:[transition-property:opacity]",
      EASE,
      open
        ? "grid-rows-[1fr] opacity-100 duration-250"
        : "grid-rows-[0fr] opacity-0 duration-150"
    )}
    inert={!open}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);

/** Inside the field, above the text: the draft as the model would get it, or why it would not go. */
export const PreviewPanel = ({
  preview,
  open,
  onClose,
  files,
}: {
  preview: DraftPreview | null;
  open: boolean;
  onClose: () => void;
  /** Files go as they are (owner's decision): said under the text. */
  files: string[];
}) => {
  const t = useTranslations("chat.lensInput");
  const shown =
    open &&
    (isBlocked(preview) ||
      (preview?.state === "masked" && hiddenOf(preview) > 0));
  return (
    <Expand open={Boolean(shown)}>
      {/* The radius sits inside the field's: 24 − 6. */}
      <div className="bg-background dark:bg-background/60 m-0.5 mb-1.5 max-h-[40dvh] overflow-y-auto rounded-[18px] border px-3.5 pt-2 pb-2.5">
        {preview?.state === "down" || preview?.state === "blocked" ? (
          <Alert className="my-1" variant="destructive">
            <ShieldAlert />
            <AlertTitle>{t(`${preview.state}Title`)}</AlertTitle>
            <AlertDescription>{t(`${preview.state}Text`)}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex h-6 items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {t("title")}
              </span>
              <Button
                aria-label={t("hide")}
                className="text-muted-foreground -mr-1.5"
                onClick={onClose}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
            {preview?.state === "masked" && (
              <p className="text-sm leading-6 break-words whitespace-pre-wrap">
                <Seen pieces={splitLabels(preview.text, preview.labels)} />
              </p>
            )}
            {files.map((name) => (
              <p
                className="text-muted-foreground flex min-w-0 items-center gap-2 pt-1.5 text-sm"
                key={name}
              >
                <Paperclip className="size-3.5 shrink-0" />
                <span className="text-foreground min-w-0 truncate">{name}</span>
                <span className="shrink-0">· {t("file")}</span>
              </p>
            ))}
          </>
        )}
      </div>
    </Expand>
  );
};
