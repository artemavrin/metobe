"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import { ACCEPT_ATTRIBUTE } from "@metobe/contracts/files";
import type { ModelLabel } from "@metobe/core/chat";
import type { ChatServer } from "@metobe/core/mcp";
import { Bubble, BubbleContent } from "@metobe/ui/components/bubble";
import { Button } from "@metobe/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@metobe/ui/components/collapsible";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { Kbd } from "@metobe/ui/components/kbd";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@metobe/ui/components/marker";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@metobe/ui/components/message";
import { Textarea } from "@metobe/ui/components/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { code } from "@streamdown/code";
import type { FileUIPart } from "ai";
import { GridLoader } from "gridora";
import {
  Brain,
  Check,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useContext, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

import { ActivityBlock } from "@/components/chat/activity";
import { AnswerChart } from "@/components/chat/answer-chart";
import { AnswerTable } from "@/components/chat/answer-table";
import { ApprovalCard } from "@/components/chat/approval-card";
import {
  ComposerShelf,
  FileChip,
  FileSinkContext,
  Shelf,
  kindOfMedia,
  useAttachments,
} from "@/components/chat/attachments";
import { ConnectRequest } from "@/components/chat/connect-request";
import { SecretNote } from "@/components/chat/secret-note";
import { ThoughtWindow } from "@/components/chat/thought-window";
import { TokenBadge } from "@/components/chat/token-editor";
import { WebSources } from "@/components/chat/web-step";
import { isMailTool, toolLook } from "@/lib/activity";
import { answerWork } from "@/lib/answer-work";
import type { ToolPart, WorkStep } from "@/lib/answer-work";
import { splitMentions } from "@/lib/mentions";
import { looksLikeSecret } from "@/lib/secret-hint";

import "gridora/styles.css";
import "streamdown/styles.css";

const NO_SERVERS: ChatServer[] = [];

const textOf = (message?: ChatMessage) =>
  message?.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("") ??
  "";

/**
 * The footer under a message, shown while the pointer is on it (always on touch screens, and while a button in it
 * has the focus): when it was written and what can be done with it. Its room is kept, so showing it moves nothing.
 */
const TOOLBAR =
  "h-6 gap-0.5 px-0 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 focus-within:opacity-100 has-data-[popup-open]:opacity-100 [@media(hover:none)]:opacity-100";

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

/**
 * The user's message edited in place: the bubble itself becomes the field, with the composer's own «+» at its left
 * (it opens the file picker at once; a file dropped on the screen or pasted joins too). Its files stand above as
 * chips, each comes off with ×. Enter sends it anew and asks for a new answer (what followed it goes), Esc leaves it
 * as it was.
 */
const EditMessage = ({
  initial,
  files,
  onCancel,
  onSend,
}: {
  initial: string;
  files: FileUIPart[];
  onCancel: () => void;
  onSend: (text: string, files: FileUIPart[]) => void;
}) => {
  const t = useTranslations("chat");
  const [text, setText] = useState(initial);
  const attachments = useAttachments(files);
  const picker = useRef<HTMLInputElement>(null);
  const sink = useContext(FileSinkContext);
  const { add } = attachments;
  // While the edit is open, a file dropped anywhere on the screen lands here, not in the composer.
  useEffect(() => {
    sink.set(add);
    return () => sink.set(null);
  }, [sink, add]);
  const empty = !text.trim() && attachments.parts.length === 0;
  const blocked = empty || attachments.uploading > 0;
  const submit = () => {
    if (blocked) {
      return;
    }
    // Sent even unchanged: sending from an edit always asks for a new answer.
    onSend(text.trim(), attachments.parts);
  };
  const cancel = () => {
    attachments.release();
    onCancel();
  };
  return (
    <form
      className="animate-in fade-in zoom-in-[0.99] flex w-full max-w-[85%] flex-col items-end gap-1.5 self-end duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="w-full">
        <ComposerShelf attachments={attachments} wrap />
      </div>
      <div className="bg-muted ring-foreground/20 focus-within:ring-foreground/35 flex w-full items-end gap-0.5 rounded-2xl rounded-br-md py-0.5 pr-4 pl-1 ring-2 [transition:box-shadow_150ms_ease] ring-inset">
        <button
          aria-label={t("files.attach")}
          className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-full [transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease,color_150ms_ease] active:scale-[0.97] motion-reduce:active:scale-100"
          onClick={() => picker.current?.click()}
          title={t("files.attach")}
          type="button"
        >
          <Plus className="size-[18px]" />
        </button>
        <input
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          multiple
          onChange={(e) => {
            attachments.add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
          ref={picker}
          tabIndex={-1}
          type="file"
        />
        <Textarea
          aria-label={t("edit")}
          autoFocus
          className="max-h-80 min-h-9 resize-none rounded-none border-0 bg-transparent px-1.5 py-1.5 leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            const end = e.currentTarget.value.length;
            e.currentTarget.setSelectionRange(end, end);
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onPaste={(e) => {
            const pasted = [...e.clipboardData.files];
            if (pasted.length > 0) {
              e.preventDefault();
              attachments.add(pasted);
            }
          }}
          value={text}
        />
      </div>
      <div className="text-muted-foreground flex min-h-7 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
        {looksLikeSecret(text) && <SecretNote />}
        <button
          className="hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 [transition:color_150ms_ease]"
          onClick={cancel}
          type="button"
        >
          {t("cancel")} <Kbd>Esc</Kbd>
        </button>
        <Button
          className="h-7 rounded-full px-3 text-xs"
          disabled={blocked}
          size="sm"
          type="submit"
        >
          {t("send")}
          <Kbd className="bg-primary-foreground/15 text-primary-foreground">
            ⏎
          </Kbd>
        </Button>
      </div>
    </form>
  );
};

const NO_MENTIONS: { title: string; logo: string | null }[] = [];

/** A question's text with `@Name` of a known server drawn as its badge, the rest as it was typed. */
const Mentioned = ({
  text,
  mentions,
}: {
  text: string;
  mentions: { title: string; logo: string | null }[];
}) => {
  // Read the way the chat reads them: what shows as a badge is what gives the model its tools.
  const pieces = splitMentions(text, mentions);
  return pieces.map((piece, i) =>
    typeof piece === "string" ? (
      piece
    ) : (
      // oxlint-disable-next-line react/no-array-index-key -- pieces of one fixed text, in order
      <TokenBadge key={i} label={piece.title} logo={piece.logo ?? undefined} />
    )
  );
};

/** The user's message: a bubble on the right that rises in when it goes; its time, copy and edit under it. */
/**
 * A question's files above its words — the composer's chips, without ×: a picture opens large here, anything else
 * in a new tab (a PDF reads there, other files download).
 */
const SentFiles = ({ message }: { message: ChatMessage }) => {
  const t = useTranslations("chat.files");
  const [viewing, setViewing] = useState<{ url: string; name: string } | null>(
    null
  );
  const list = message.parts.filter((p) => p.type === "file");
  if (list.length === 0) {
    return null;
  }
  return (
    <>
      <Shelf scroll={false}>
        {list.map((p) => {
          const name = p.filename ?? t("unnamed");
          const image = p.mediaType.startsWith("image/");
          return (
            <FileChip
              file={{
                key: p.url,
                kind: kindOfMedia(p.mediaType),
                name,
                preview: image ? p.url : undefined,
                progress: 1,
                status: "done",
              }}
              key={p.url}
              onOpen={() =>
                image
                  ? setViewing({ name, url: p.url })
                  : window.open(p.url, "_blank", "noopener")
              }
            />
          );
        })}
      </Shelf>
      <Dialog
        onOpenChange={(open) => !open && setViewing(null)}
        open={viewing !== null}
      >
        <DialogContent className="max-w-3xl p-2 sm:max-w-3xl">
          <DialogTitle className="sr-only">{viewing?.name}</DialogTitle>
          {viewing && (
            // oxlint-disable-next-line nextjs/no-img-element -- the user's own file, shown as it is
            <img
              alt={viewing.name}
              className="max-h-[80vh] w-full rounded-lg object-contain"
              src={viewing.url}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export const UserMessage = ({
  message,
  onEdit,
  mentions = NO_MENTIONS,
}: {
  message: ChatMessage;
  /** Absent while an answer is on its way: a message is edited between answers. */
  onEdit?: (text: string, files: FileUIPart[]) => void;
  /** Servers whose `@Name` in the text is drawn as a badge. */
  mentions?: { title: string; logo: string | null }[];
}) => {
  const t = useTranslations("chat");
  const [editing, setEditing] = useState(false);
  const text = textOf(message);
  return (
    <Message
      align="end"
      className="animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
    >
      <MessageContent className="gap-1">
        {editing && onEdit ? (
          <EditMessage
            files={message.parts.filter(
              (p): p is FileUIPart => p.type === "file"
            )}
            initial={text}
            onCancel={() => setEditing(false)}
            onSend={(next, kept) => {
              setEditing(false);
              onEdit(next, kept);
            }}
          />
        ) : (
          <>
            <SentFiles message={message} />
            {text && (
              <Bubble align="end" variant="muted">
                <BubbleContent className="rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap">
                  <Mentioned mentions={mentions} text={text} />
                </BubbleContent>
              </Bubble>
            )}
            <MessageFooter className={TOOLBAR}>
              <span className="px-1">
                <When at={message.metadata?.createdAt} />
              </span>
              <CopyAction text={text} />
              {onEdit && (
                <Action label={t("edit")} onClick={() => setEditing(true)}>
                  <Pencil />
                </Action>
              )}
            </MessageFooter>
          </>
        )}
      </MessageContent>
    </Message>
  );
};

/**
 * What an answer is doing before its words: one status line from the moment the question goes until the first word
 * — the same element through the wait and the reasoning, so nothing blinks or jumps between them. It fades in a
 * beat late, so a fast answer never flashes it. It says only what is true: «Готовит ответ…» while nothing has come,
 * «Думает…» once reasoning really streams (a model may not reason, or have it off), a dot grid (gridora) beside
 * either. Like AI Elements' Reasoning, the fold opens by itself while the model thinks — the thoughts stream into a
 * window a few lines high — and closes a second after the words start; the reader's own toggle wins. Once done, the grid gives its place to
 * a still brain and the line says «Размышления · N с» (the server's measure) — or goes when there was none.
 */
const Activity = ({
  reasoning,
  working,
  reasoningMs,
}: {
  reasoning: string;
  working: boolean;
  reasoningMs?: number;
}) => {
  const t = useTranslations("chat");
  const thinking = working && reasoning.length > 0;
  const [chosen, setChosen] = useState<boolean>();
  const [lingering, setLingering] = useState(false);
  const [wasThinking, setWasThinking] = useState(thinking);
  if (wasThinking !== thinking) {
    setWasThinking(thinking);
    if (thinking) {
      setChosen(undefined);
    } else {
      setLingering(true);
    }
  }
  useEffect(() => {
    if (!lingering) {
      return;
    }
    const timer = setTimeout(() => setLingering(false), 1000);
    return () => clearTimeout(timer);
  }, [lingering]);
  if (!working && !reasoning) {
    return null;
  }
  const open = Boolean(reasoning) && (chosen ?? (thinking || lingering));
  let label = t("reasoning");
  if (working) {
    label = t(reasoning ? "thinking" : "preparing");
  } else if (reasoningMs !== undefined) {
    label = t("reasoningFor", {
      seconds: Math.max(1, Math.round(reasoningMs / 1000)),
    });
  }
  return (
    <Collapsible
      className={cn(
        "flex flex-col items-start",
        working &&
          "animate-in fade-in fill-mode-backwards delay-150 duration-300"
      )}
      onOpenChange={setChosen}
      open={open}
      role={working ? "status" : undefined}
    >
      <Marker
        className="enabled:hover:text-foreground w-fit gap-2 transition-colors duration-150 disabled:cursor-default"
        render={<CollapsibleTrigger disabled={!reasoning} />}
      >
        {/* One cell for both, so the text never moves: the grid while it works, the brain once it has thought */}
        <MarkerIcon className="grid size-3.5 place-items-center *:col-start-1 *:row-start-1">
          {working && (
            <GridLoader
              cellSize={3}
              gap={1.5}
              respectReducedMotion
              variant="cacheWarm"
            />
          )}
          <Brain
            className={cn(
              "size-3.5 transition-opacity duration-200",
              working && "opacity-0"
            )}
          />
        </MarkerIcon>
        <MarkerContent className={cn(working && "shimmer")}>
          {label}
        </MarkerContent>
        {/* Always there, so the line does not shift when reasoning arrives — it only fades in */}
        <MarkerIcon
          className={cn(
            "-ml-1 transition-opacity duration-200",
            !reasoning && "opacity-0"
          )}
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-[rotate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
              open && "rotate-90"
            )}
          />
        </MarkerIcon>
      </Marker>
      {/* Height from base-ui's measure; opens and closes on a strong ease-out, no motion when reduced */}
      <CollapsibleContent className="h-(--collapsible-panel-height) w-full overflow-hidden transition-[height,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
        <ThoughtWindow
          className="text-muted-foreground border-border mt-2 border-l pl-3 text-sm leading-relaxed"
          following={thinking}
        >
          <Streamdown isAnimating={thinking}>{reasoning}</Streamdown>
        </ThoughtWindow>
      </CollapsibleContent>
    </Collapsible>
  );
};

/**
 * Where the model changes in the thread: a thin line with the new model's name before the question it answered.
 * Drawn from the answers' own metadata — never a message, so the model's history and its cache stay as they were.
 */
export const ModelSwitch = ({ label }: { label?: ModelLabel }) => {
  const t = useTranslations("chat");
  if (!label) {
    return null;
  }
  return (
    <Marker className="text-xs" variant="separator">
      <MarkerContent>{t("modelSwitch", { model: label.title })}</MarkerContent>
    </Marker>
  );
};

/** Under a finished answer: the model that wrote it, when, copy (the answer's words) and regenerate. */
const AnswerFooter = ({
  message,
  label,
  copy,
  onRegenerate,
}: {
  message: ChatMessage;
  label?: ModelLabel;
  copy?: string;
  onRegenerate?: (messageId: string) => void;
}) => {
  const t = useTranslations("chat");
  return (
    <MessageFooter className={cn(TOOLBAR, "-mt-1")}>
      <span className="flex items-center gap-1.5">
        {label && <span>{label.title}</span>}
        {label && message.metadata?.createdAt && (
          <span aria-hidden="true">·</span>
        )}
        <When at={message.metadata?.createdAt} />
      </span>
      {copy && <CopyAction text={copy} />}
      {onRegenerate && (
        <Action
          label={t("regenerate")}
          onClick={() => onRegenerate(message.id)}
        >
          <RefreshCw />
        </Action>
      )}
    </MessageFooter>
  );
};

/** An answer's reasoning as one text. */
const reasoningOf = (message?: ChatMessage) =>
  (message?.parts ?? [])
    .flatMap((p) => (p.type === "reasoning" ? [p.text] : []))
    .join("\n\n")
    .trim();

type Waiting = Extract<ToolPart, { state: "approval-requested" }>;

/** The work's calls that wait for the user's yes. */
const waitingCalls = (steps: WorkStep[]) =>
  steps.flatMap((s) =>
    s.kind === "tool"
      ? s.calls.filter((c): c is Waiting => c.state === "approval-requested")
      : []
  );

/** Their cards, in the answer: who asks, what would go, yes or no. */
const ApprovalCards = ({
  calls,
  servers,
  onApprove,
}: {
  calls: Waiting[];
  servers: ChatServer[];
  onApprove: (approvalId: string, approved: boolean) => void;
}) => {
  const tMail = useTranslations("mail.tools");
  return calls.map((call) => {
    const look = toolLook(call, servers);
    const mail = isMailTool(call.toolName) ? call.toolName : null;
    return (
      <ApprovalCard
        call={call}
        key={call.approval.id}
        label={mail ? tMail(mail) : look.label}
        onApprove={onApprove}
        server={look.server}
      />
    );
  });
};

/**
 * An answer: the status line (the wait, the reasoning folded), then the text as markdown — new words fade in while
 * it streams. Under it, once it is done: the model that wrote it, when, copy and regenerate.
 */
export const AssistantMessage = ({
  message,
  label,
  live,
  onRegenerate,
  onApprove,
  onAsk,
  onServerReady,
  servers = NO_SERVERS,
}: {
  /** Absent while the question waits for the stream to start. */
  message?: ChatMessage;
  label?: ModelLabel;
  /** On its way: from the moment the question goes until the last word. */
  live: boolean;
  /** Asks for this answer again; absent while an answer is on its way. */
  onRegenerate?: (messageId: string) => void;
  /** The user's yes or no on a tool call the model asked to make. */
  onApprove?: (approvalId: string, approved: boolean) => void;
  /** The user's answer to «connect X to go on»: connected or not now. */
  onAsk?: (toolCallId: string, connected: boolean) => void;
  /** A server the user just connected from the answer. */
  onServerReady?: (id: string) => void;
  /** The chat's MCP servers: their pictures and prefixes name the tools in the work. */
  servers?: ChatServer[];
}) => {
  const { steps, answer, blocks } = answerWork(message?.parts ?? []);
  const hasWork = steps.length > 0;
  // The answer has begun: its first words or a table.
  const answering = blocks.length > 0;
  // Calls waiting for the user's yes: their cards stand in the answer, not in the work.
  const waiting = waitingCalls(steps);
  // Waiting on the user — to connect a service, or to allow a call: not done, so no footer yet.
  const asking =
    waiting.length > 0 ||
    blocks.some(
      (b) => b.kind === "connect" && b.part.state === "input-available"
    );
  // Without tools the status line keeps the reasoning; with them the reasoning is a step of the work.
  const reasoning = hasWork ? "" : reasoningOf(message);
  return (
    <Message>
      <MessageContent className="gap-2">
        <Activity
          reasoning={reasoning}
          reasoningMs={message?.metadata?.reasoningMs}
          working={live && !hasWork && !answering}
        />
        {hasWork && (
          <ActivityBlock
            servers={servers}
            steps={steps}
            metadata={message?.metadata}
            working={live && !answering}
          />
        )}
        {onApprove && (
          <ApprovalCards
            calls={waiting}
            onApprove={onApprove}
            servers={servers}
          />
        )}
        {blocks.map((block, i) => {
          if (block.kind === "table") {
            return <AnswerTable key={block.key} part={block.part} />;
          }
          if (block.kind === "chart") {
            return <AnswerChart key={block.key} part={block.part} />;
          }
          if (block.kind === "connect") {
            return (
              <ConnectRequest
                key={block.key}
                onAnswer={(id, connected) => onAsk?.(id, connected)}
                onServerReady={(id) => onServerReady?.(id)}
                part={block.part}
                servers={servers}
              />
            );
          }
          return (
            <Bubble className="w-full" key={block.key} variant="ghost">
              <BubbleContent className="w-full overflow-visible">
                <Streamdown
                  animated
                  isAnimating={live && i === blocks.length - 1}
                  plugins={{ code }}
                >
                  {block.text}
                </Streamdown>
              </BubbleContent>
            </Bubble>
          );
        })}
        {answering && (
          <WebSources
            parts={steps.flatMap((s) => (s.kind === "web" ? [s.part] : []))}
          />
        )}
        {!live && message && !asking && (
          <AnswerFooter
            copy={answer || undefined}
            label={label}
            message={message}
            onRegenerate={onRegenerate}
          />
        )}
      </MessageContent>
    </Message>
  );
};
