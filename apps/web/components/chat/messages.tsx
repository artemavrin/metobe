"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import type { ModelLabel } from "@metobe/core/chat";
import { Button } from "@metobe/ui/components/button";
import { Textarea } from "@metobe/ui/components/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { code } from "@streamdown/code";
import {
  Brain,
  Check,
  ChevronRight,
  Copy,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

import "streamdown/styles.css";

const textOf = (message: ChatMessage) =>
  message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");

/**
 * Under a message, shown while the pointer is on it (always on touch screens, and while a button in it has the
 * focus): when it was written and what can be done with it. Its room is kept, so showing it moves nothing.
 */
const TOOLBAR =
  "text-muted-foreground flex h-6 items-center gap-0.5 text-xs opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100 has-data-[popup-open]:opacity-100 [@media(hover:none)]:opacity-100";

/** The thread's hints: the sidebar's surface, no arrow — like the model peek. */
const Tip = ({ children }: { children: React.ReactNode }) => (
  <TooltipContent
    arrow={false}
    className="bg-sidebar text-foreground ring-foreground/10 shadow-md ring-1"
    sideOffset={6}
  >
    {children}
  </TooltipContent>
);

const Action = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger
      delay={500}
      render={
        <Button
          aria-label={label}
          className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          onClick={onClick}
          size="icon-xs"
          variant="ghost"
        />
      }
    >
      {children}
    </TooltipTrigger>
    <Tip>{label}</Tip>
  </Tooltip>
);

/** Copies the text; the icon turns into a check for a moment to say it did. */
const CopyAction = ({ text }: { text: string }) => {
  const t = useTranslations("chat");
  const [done, setDone] = useState(false);
  const timer = useRef<{ id?: ReturnType<typeof setTimeout> }>({});
  useEffect(() => () => clearTimeout(timer.current.id), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("chat: could not copy", error);
      return;
    }
    setDone(true);
    clearTimeout(timer.current.id);
    timer.current.id = setTimeout(() => setDone(false), 1500);
  };
  return (
    <Action label={done ? t("copied") : t("copy")} onClick={copy}>
      <span
        className="animate-in fade-in zoom-in-75 motion-reduce:zoom-in-100 duration-150"
        key={String(done)}
      >
        {done ? <Check /> : <Copy />}
      </span>
    </Action>
  );
};

/** «5 минут назад», «только что» under a minute; the exact date and time on hover. */
const When = ({ at }: { at?: string }) => {
  const t = useTranslations("chat");
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  if (!at) {
    return null;
  }
  const date = new Date(at);
  return (
    <Tooltip>
      <TooltipTrigger
        delay={500}
        render={<time dateTime={at} suppressHydrationWarning />}
      >
        {now.getTime() - date.getTime() < 60_000
          ? t("justNow")
          : format.relativeTime(date, now)}
      </TooltipTrigger>
      <Tip>
        {format.dateTime(date, { dateStyle: "long", timeStyle: "short" })}
      </Tip>
    </Tooltip>
  );
};

/** The user's message edited in place: Enter sends it anew (what followed it goes), Esc leaves it as it was. */
const EditMessage = ({
  initial,
  onCancel,
  onSend,
}: {
  initial: string;
  onCancel: () => void;
  onSend: (text: string) => void;
}) => {
  const t = useTranslations("chat");
  const [text, setText] = useState(initial);
  const submit = () => {
    const next = text.trim();
    if (!next) {
      return;
    }
    if (next === initial.trim()) {
      onCancel();
      return;
    }
    onSend(next);
  };
  return (
    <form
      className="bg-muted flex w-full max-w-[85%] flex-col gap-2 rounded-2xl p-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        aria-label={t("edit")}
        autoFocus
        className="bg-background dark:bg-background max-h-80 min-h-12 resize-none"
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          const end = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(end, end);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        value={text}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          {t("cancel")}
        </Button>
        <Button disabled={!text.trim()} size="sm" type="submit">
          {t("send")}
        </Button>
      </div>
    </form>
  );
};

/** The user's message: a bubble on the right that rises in when it goes; its time, copy and edit under it. */
export const UserMessage = ({
  message,
  onEdit,
}: {
  message: ChatMessage;
  /** Absent while an answer is on its way: a message is edited between answers. */
  onEdit?: (text: string) => void;
}) => {
  const t = useTranslations("chat");
  const [editing, setEditing] = useState(false);
  const text = textOf(message);
  return (
    <div className="group/msg animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 flex flex-col items-end gap-1 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]">
      {editing && onEdit ? (
        <EditMessage
          initial={text}
          onCancel={() => setEditing(false)}
          onSend={(next) => {
            setEditing(false);
            onEdit(next);
          }}
        />
      ) : (
        <>
          <div className="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 break-words whitespace-pre-wrap">
            {text}
          </div>
          <div className={TOOLBAR}>
            <span className="px-1">
              <When at={message.metadata?.createdAt} />
            </span>
            <CopyAction text={text} />
            {onEdit && (
              <Action label={t("edit")} onClick={() => setEditing(true)}>
                <Pencil />
              </Action>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const Thinking = () => {
  const t = useTranslations("chat");
  return (
    <span className="text-muted-foreground animate-pulse text-sm motion-reduce:animate-none">
      {t("thinking")}
    </span>
  );
};

/** The model's reasoning, folded: what it thought is there for whoever wants it, the answer comes first. */
const Reasoning = ({ text, live }: { text: string; live: boolean }) => {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors duration-150"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Brain className="size-3.5" />
        {/* While it thinks and nothing is answered yet, the fold itself says so — no second «Думает…» under it */}
        <span
          className={cn(live && "animate-pulse motion-reduce:animate-none")}
        >
          {live ? t("thinking") : t("reasoning")}
        </span>
        <ChevronRight
          className={cn(
            "size-3 transition-[rotate] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            open && "rotate-90"
          )}
        />
      </button>
      {open && (
        <p className="text-muted-foreground border-border border-l pl-3 text-sm leading-relaxed whitespace-pre-wrap">
          {text}
        </p>
      )}
    </div>
  );
};

/**
 * An answer: reasoning folded above, the text as markdown — new words fade in while it streams. Under it, once it
 * is done: the model that wrote it, when, copy and regenerate.
 */
export const AssistantMessage = ({
  message,
  label,
  streaming,
  onRegenerate,
}: {
  message: ChatMessage;
  label?: ModelLabel;
  streaming: boolean;
  /** Absent while an answer is on its way. */
  onRegenerate?: () => void;
}) => {
  const t = useTranslations("chat");
  const reasoning = message.parts
    .flatMap((p) => (p.type === "reasoning" ? [p.text] : []))
    .join("\n\n")
    .trim();
  const text = textOf(message);
  return (
    <div className="group/msg flex min-w-0 flex-col gap-1.5">
      {reasoning && <Reasoning live={streaming && !text} text={reasoning} />}
      {text ? (
        <Streamdown
          animated
          caret={streaming ? "block" : undefined}
          className="leading-relaxed"
          isAnimating={streaming}
          plugins={{ code }}
        >
          {text}
        </Streamdown>
      ) : (
        streaming && !reasoning && <Thinking />
      )}
      {!streaming && (
        <div className={cn(TOOLBAR, "-mt-1")}>
          <span className="flex items-center gap-1.5 px-1">
            {label && <span>{label.title}</span>}
            {label && message.metadata?.createdAt && (
              <span aria-hidden="true">·</span>
            )}
            <When at={message.metadata?.createdAt} />
          </span>
          {text && <CopyAction text={text} />}
          {onRegenerate && (
            <Action label={t("regenerate")} onClick={onRegenerate}>
              <RefreshCw />
            </Action>
          )}
        </div>
      )}
    </div>
  );
};

/** Before the first chunk: thinking. */
export const PendingAnswer = () => (
  <div className="flex flex-col">
    <Thinking />
  </div>
);
