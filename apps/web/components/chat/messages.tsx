"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
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
import { GridLoader } from "gridora";
import {
  Ban,
  Brain,
  Check,
  ChevronRight,
  CircleX,
  Copy,
  ListChecks,
  Pencil,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

import { BrandLogo } from "@/components/brand-logo";
import { AnswerChart } from "@/components/chat/answer-chart";
import { AnswerTable } from "@/components/chat/answer-table";
import { ThoughtWindow } from "@/components/chat/thought-window";
import { TokenBadge } from "@/components/chat/token-editor";
import { WebSources, WebStep } from "@/components/chat/web-step";
import { answerWork } from "@/lib/answer-work";
import type { SearchPart, ToolPart, WorkStep } from "@/lib/answer-work";
import { splitMentions } from "@/lib/mentions";

import "gridora/styles.css";
import "streamdown/styles.css";

const NO_SERVERS: ChatServer[] = [];

/** A tool's server, by its name's prefix — the longest wins: `kaskad_hr` over `kaskad` — and its name without it. */
const toolOwner = (toolName: string, servers: ChatServer[]) => {
  let server: ChatServer | undefined;
  for (const s of servers) {
    if (
      toolName.startsWith(`${s.key}_`) &&
      s.key.length > (server?.key.length ?? 0)
    ) {
      server = s;
    }
  }
  return {
    bare: server ? toolName.slice(server.key.length + 1) : toolName,
    server,
  };
};

/** A tool's name as people read it — its MCP title, else its name without the server's prefix — and its server. */
const toolLook = (part: ToolPart, servers: ChatServer[]) => {
  const { bare, server } = toolOwner(part.toolName, servers);
  return { label: part.title ?? bare.replaceAll("_", " "), server };
};

/** What a tool gave back, readable: an MCP result's text, anything else as JSON; a long one is cut. */
const outputText = (output: unknown) => {
  const content = (output as { content?: unknown } | null)?.content;
  const text = Array.isArray(content)
    ? content
        .flatMap((c: { type?: string; text?: string }) =>
          c.type === "text" && c.text ? [c.text] : []
        )
        .join("\n\n")
    : JSON.stringify(output, null, 2);
  return text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
};

type CallState = "running" | "waiting" | "failed" | "denied" | "done";

/** Where a step of one or several calls of a tool stands: the first that is still busy or went wrong decides. */
const stateOf = (calls: ToolPart[]): CallState => {
  if (
    calls.some(
      (c) => c.state === "input-streaming" || c.state === "input-available"
    )
  ) {
    return "running";
  }
  if (calls.some((c) => c.state === "approval-requested")) {
    return "waiting";
  }
  if (calls.some((c) => c.state === "output-error")) {
    return "failed";
  }
  return calls.every((c) => c.state === "output-denied") ? "denied" : "done";
};

/**
 * A step of the work: a tool called once or several times in a row, as a line — the server's picture, the tool's
 * name, where it stands (the grid while it runs). It unfolds into what went in and what came back, call by call;
 * a call that asks first carries its «Разрешить / Отклонить» here.
 */
const ToolStep = ({
  calls,
  servers,
  onApprove,
}: {
  calls: ToolPart[];
  servers: ChatServer[];
  onApprove?: (approvalId: string, approved: boolean) => void;
}) => {
  const t = useTranslations("chat.tools");
  const state = stateOf(calls);
  // Asked first: what would go in is shown at once, so the user sees what they allow.
  const [open, setOpen] = useState(state === "waiting");
  const [first] = calls;
  if (!first) {
    return null;
  }
  const { label, server } = toolLook(first, servers);
  let icon = server ? (
    <BrandLogo label={server.title} logo={server.logo ?? undefined} size={14} />
  ) : (
    <Wrench />
  );
  if (state === "running") {
    icon = (
      <GridLoader
        cellSize={3}
        gap={1.5}
        respectReducedMotion
        variant="cacheWarm"
      />
    );
  } else if (state === "failed") {
    icon = <CircleX />;
  } else if (state === "denied") {
    icon = <Ban />;
  }
  const status = state === "done" ? null : t(state);
  return (
    <Collapsible
      className="flex flex-col items-start"
      onOpenChange={setOpen}
      open={open}
    >
      <Marker
        className="enabled:hover:text-foreground w-fit gap-2 transition-colors duration-150"
        render={<CollapsibleTrigger />}
      >
        <MarkerIcon className="grid size-3.5 place-items-center [&_svg]:size-3.5">
          {icon}
        </MarkerIcon>
        <MarkerContent className={cn(state === "running" && "shimmer")}>
          {label}
          {calls.length > 1 && (
            <span className="tabular-nums"> ×{calls.length}</span>
          )}
          {status && <span> · {status}</span>}
        </MarkerContent>
        <MarkerIcon className="-ml-1">
          <ChevronRight
            className={cn(
              "size-3.5 transition-[rotate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
              open && "rotate-90"
            )}
          />
        </MarkerIcon>
      </Marker>
      <CollapsibleContent className="h-(--collapsible-panel-height) w-full overflow-hidden transition-[height,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
        <div className="text-muted-foreground border-border mt-2 flex flex-col gap-3 border-l pl-3 text-xs">
          {calls.map((call, i) => (
            <div className="flex flex-col gap-2" key={call.toolCallId}>
              {calls.length > 1 && (
                <span className="font-medium">{t("call", { n: i + 1 })}</span>
              )}
              {call.input !== undefined && (
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{t("input")}</span>
                  <pre className="bg-muted max-h-48 overflow-auto rounded-md p-2 whitespace-pre-wrap">
                    {JSON.stringify(call.input, null, 2)}
                  </pre>
                </div>
              )}
              {call.state === "output-available" && (
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{t("output")}</span>
                  <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 whitespace-pre-wrap">
                    {outputText(call.output)}
                  </pre>
                </div>
              )}
              {call.state === "output-error" && (
                <span className="text-destructive">{call.errorText}</span>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
      {onApprove &&
        calls.map((call) =>
          call.state === "approval-requested" ? (
            <div className="mt-2 flex gap-2" key={call.approval.id}>
              <Button
                onClick={() => onApprove(call.approval.id, true)}
                size="sm"
              >
                {t("approve")}
              </Button>
              <Button
                onClick={() => onApprove(call.approval.id, false)}
                size="sm"
                variant="ghost"
              >
                {t("deny")}
              </Button>
            </div>
          ) : null
        )}
    </Collapsible>
  );
};

/**
 * The model looking for a big server's tools (they wait until found): what it looked for — the grid while it looks —
 * and how many it found; it unfolds into the tools found, with their servers' pictures.
 */
const SearchStep = ({
  part,
  servers,
}: {
  part: SearchPart;
  servers: ChatServer[];
}) => {
  const t = useTranslations("chat.tools");
  const [open, setOpen] = useState(false);
  const running =
    part.state === "input-streaming" || part.state === "input-available";
  const found = part.state === "output-available" ? part.output.tools : [];
  let label = t("searching");
  if (part.state === "output-available") {
    label = t("found", { count: found.length });
  } else if (part.state === "output-error") {
    label = `${t("searching")} · ${t("failed")}`;
  }
  const query = part.input?.query;
  return (
    <Collapsible
      className="flex flex-col items-start"
      onOpenChange={setOpen}
      open={open}
    >
      <Marker
        className="enabled:hover:text-foreground w-fit gap-2 transition-colors duration-150 disabled:cursor-default"
        render={<CollapsibleTrigger disabled={found.length === 0} />}
      >
        <MarkerIcon className="grid size-3.5 place-items-center [&_svg]:size-3.5">
          {running ? (
            <GridLoader
              cellSize={3}
              gap={1.5}
              respectReducedMotion
              variant="cacheWarm"
            />
          ) : (
            <Search />
          )}
        </MarkerIcon>
        <MarkerContent className={cn(running && "shimmer")}>
          {label}
          {query && <span> · {t("query", { query })}</span>}
        </MarkerContent>
        {found.length > 0 && (
          <MarkerIcon className="-ml-1">
            <ChevronRight
              className={cn(
                "size-3.5 transition-[rotate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
                open && "rotate-90"
              )}
            />
          </MarkerIcon>
        )}
      </Marker>
      <CollapsibleContent className="h-(--collapsible-panel-height) w-full overflow-hidden transition-[height,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
        <ul className="text-muted-foreground border-border mt-2 flex flex-col gap-1.5 border-l pl-3 text-xs">
          {found.map((tool) => {
            const { bare, server } = toolOwner(tool.name, servers);
            return (
              <li className="flex min-w-0 items-center gap-2" key={tool.name}>
                {server ? (
                  <BrandLogo
                    label={server.title}
                    logo={server.logo ?? undefined}
                    size={14}
                  />
                ) : (
                  <Wrench className="size-3.5 shrink-0" />
                )}
                <span className="text-foreground shrink-0">
                  {bare.replaceAll("_", " ")}
                </span>
                {tool.description && (
                  <span className="truncate">
                    {tool.description.split("\n")[0]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};

/** Opens by itself while the work goes on and folds a second after it ends; the reader's own toggle wins. */
const useAutoOpen = (working: boolean) => {
  const [chosen, setChosen] = useState<boolean>();
  const [lingering, setLingering] = useState(false);
  const [wasWorking, setWasWorking] = useState(working);
  if (wasWorking !== working) {
    setWasWorking(working);
    if (working) {
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
  return [chosen ?? (working || lingering), setChosen] as const;
};

/**
 * The work before an answer (like AI Elements' Chain of Thought): reasoning, the tools called and what the model
 * said between them, as steps — in one window a few lines high, the newest at its bottom, the older fading out
 * above. Open while the model works, the current step in motion; once the answer comes it folds into one line —
 * «Ход работы · 9 вызовов · 14 с» (the server's measure) — and the answer stands below.
 */
const WorkBlock = ({
  steps,
  working,
  workMs,
  servers,
  onApprove,
}: {
  steps: WorkStep[];
  working: boolean;
  workMs?: number;
  servers: ChatServer[];
  onApprove?: (approvalId: string, approved: boolean) => void;
}) => {
  const t = useTranslations("chat.work");
  const [open, setOpen] = useAutoOpen(working);
  // A search or a page read is a call too; the search for a server's tools is not.
  let calls = 0;
  for (const s of steps) {
    if (s.kind === "tool") {
      calls += s.calls.length;
    } else if (s.kind === "web") {
      calls += 1;
    }
  }
  const seconds =
    workMs === undefined ? null : Math.max(1, Math.round(workMs / 1000));
  // A call waiting for the user's yes is read whole: what would go in, and the buttons.
  const asking = steps.some(
    (s) =>
      s.kind === "tool" && s.calls.some((c) => c.state === "approval-requested")
  );
  return (
    <Collapsible
      className="flex flex-col items-start"
      onOpenChange={setOpen}
      open={open}
      role={working ? "status" : undefined}
    >
      <Marker
        className="enabled:hover:text-foreground w-fit gap-2 transition-colors duration-150"
        render={<CollapsibleTrigger />}
      >
        <MarkerIcon className="grid size-3.5 place-items-center">
          {working ? (
            <GridLoader
              cellSize={3}
              gap={1.5}
              respectReducedMotion
              variant="cacheWarm"
            />
          ) : (
            <ListChecks className="size-3.5" />
          )}
        </MarkerIcon>
        <MarkerContent className={cn(working && "shimmer")}>
          {working
            ? t("working")
            : [
                t("done"),
                t("calls", { count: calls }),
                seconds && t("seconds", { seconds }),
              ]
                .filter(Boolean)
                .join(" · ")}
        </MarkerContent>
        <MarkerIcon className="-ml-1">
          <ChevronRight
            className={cn(
              "size-3.5 transition-[rotate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
              open && "rotate-90"
            )}
          />
        </MarkerIcon>
      </Marker>
      <CollapsibleContent className="h-(--collapsible-panel-height) w-full overflow-hidden transition-[height,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
        <ThoughtWindow
          bounded={!asking}
          className="border-border mt-2 border-l pl-3"
          following={working}
          startAtEnd={working}
        >
          <div className="flex flex-col gap-2.5">
            {steps.map((step) => {
              if (step.kind === "tool") {
                return (
                  <ToolStep
                    calls={step.calls}
                    key={step.key}
                    onApprove={onApprove}
                    servers={servers}
                  />
                );
              }
              if (step.kind === "search") {
                return (
                  <SearchStep
                    key={step.key}
                    part={step.part}
                    servers={servers}
                  />
                );
              }
              if (step.kind === "web") {
                return <WebStep key={step.key} part={step.part} />;
              }
              return (
                <p
                  className={cn(
                    "text-sm leading-relaxed whitespace-pre-wrap",
                    step.kind === "thought"
                      ? "text-muted-foreground italic"
                      : "text-foreground/80"
                  )}
                  key={step.key}
                >
                  {step.text}
                </p>
              );
            })}
          </div>
        </ThoughtWindow>
      </CollapsibleContent>
    </Collapsible>
  );
};

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

/** The user's message edited in place: Enter sends it anew and asks for a new answer (what followed it goes), Esc leaves it as it was. */
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
    // Sent even unchanged: sending from an edit always asks for a new answer.
    onSend(next);
  };
  return (
    <form
      className="bg-muted flex w-full max-w-[80%] flex-col gap-2 self-end rounded-2xl p-2"
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
export const UserMessage = ({
  message,
  onEdit,
  mentions = NO_MENTIONS,
}: {
  message: ChatMessage;
  /** Absent while an answer is on its way: a message is edited between answers. */
  onEdit?: (text: string) => void;
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
            initial={text}
            onCancel={() => setEditing(false)}
            onSend={(next) => {
              setEditing(false);
              onEdit(next);
            }}
          />
        ) : (
          <>
            <Bubble align="end" variant="muted">
              <BubbleContent className="rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap">
                <Mentioned mentions={mentions} text={text} />
              </BubbleContent>
            </Bubble>
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
  /** The chat's MCP servers: their pictures and prefixes name the tools in the work. */
  servers?: ChatServer[];
}) => {
  const { steps, answer, blocks } = answerWork(message?.parts ?? []);
  const hasWork = steps.length > 0;
  // The answer has begun: its first words or a table.
  const answering = blocks.length > 0;
  // Without tools the status line keeps the reasoning; with them the reasoning is a step of the work.
  const reasoning = hasWork
    ? ""
    : (message?.parts ?? [])
        .flatMap((p) => (p.type === "reasoning" ? [p.text] : []))
        .join("\n\n")
        .trim();
  return (
    <Message>
      <MessageContent className="gap-2">
        <Activity
          reasoning={reasoning}
          reasoningMs={message?.metadata?.reasoningMs}
          working={live && !hasWork && !answering}
        />
        {hasWork && (
          <WorkBlock
            onApprove={onApprove}
            servers={servers}
            steps={steps}
            workMs={message?.metadata?.workMs}
            working={live && !answering}
          />
        )}
        {blocks.map((block, i) => {
          if (block.kind === "table") {
            return <AnswerTable key={block.key} part={block.part} />;
          }
          if (block.kind === "chart") {
            return <AnswerChart key={block.key} part={block.part} />;
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
        {!live && message && (
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
