"use client";

import type { ChatServer } from "@metobe/core/mcp";
import { cn } from "@metobe/ui/lib/utils";
import { GridLoader } from "gridora";
import {
  Ban,
  Brain,
  Check,
  ChevronRight,
  CircleX,
  Clock,
  FileText,
  Globe,
  Mail,
  MessageSquareText,
  Search,
  Wrench,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { useClock } from "@/components/chat/server-clock";
import { ThoughtWindow } from "@/components/chat/thought-window";
import {
  activityRows,
  foldCount,
  isMailTool,
  opensByItself,
  outputText,
  stateOf,
  summaryFacts,
  toolLook,
  toolOwner,
} from "@/lib/activity";
import type { ActivityRow } from "@/lib/activity";
import type { ToolPart } from "@/lib/answer-work";

// The work of an answer as a ribbon (prototype P4 «Лента»): one line of status, and under it the steps — a line down
// the left, an icon by kind, the time on the right. The busy step shows what it does and the finished ones fold into
// a line each; a step that asks or failed stays open. When the work is over the whole ribbon folds into «Работал 14 с ·
// 7 шагов · 7 790 токенов» and unfolds again on a click. No frame, no fill: it lies on the page.

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
// A step arrives sliding up 4 px as it appears; under reduced motion only the fade stays.
const APPEAR = `animate-in fade-in slide-in-from-bottom-1 duration-200 ${EASE} motion-reduce:slide-in-from-bottom-0`;
const SURFACE = "bg-background";

/** A link's site as people read it: `nalog.gov.ru`, not the whole address. */
const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
};

const Loader = () => (
  <GridLoader cellSize={3} gap={1.5} respectReducedMotion variant="cacheWarm" />
);

/** Opens in place: rows of a grid, no height to measure. Opens a little slower than it closes. What is closed cannot be tabbed to. */
const Expand = ({ open, children }: { open: boolean; children: ReactNode }) => (
  <div
    className={cn(
      "grid transition-[grid-template-rows,opacity]",
      EASE,
      "motion-reduce:[transition-property:opacity]",
      open
        ? "grid-rows-[1fr] opacity-100 duration-200"
        : "grid-rows-[0fr] opacity-0 duration-150"
    )}
    inert={!open}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);

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

const useSeconds = () => {
  const t = useTranslations("chat.activity");
  const f = useFormatter();
  return (ms: number) =>
    `${f.number(ms / 1000, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} ${t("sec")}`;
};

/**
 * Time that runs while a step is busy: from when the server says it began (plus what its finished calls took), by the
 * server's clock — so a page reloaded in the middle of it shows the time of one that never left. Without a start
 * from the server it counts from when it appeared here.
 */
// The counters of steps still going are off for now (the page felt jerky while they ticked): a step shows its time
// once it is done. Set to true to bring them back.
const LIVE_TIMERS = false;

const LiveTime = ({ since, base = 0 }: { since?: number; base?: number }) => {
  const seconds = useSeconds();
  const { client, server } = useClock(100);
  // Only the fallback: fixed when the step appears; nothing ever sets it again.
  // oxlint-disable-next-line react/hook-use-state
  const [appeared] = useState(client);
  const elapsed = since === undefined ? client - appeared : server - since;
  return <>{seconds(base + Math.max(0, elapsed))}</>;
};

const RowIcon = ({
  row,
  servers,
}: {
  row: ActivityRow;
  servers: ChatServer[];
}) => {
  const { step, state } = row;
  let inner: ReactNode;
  let tint = "text-muted-foreground";
  if (state === "running") {
    inner = <Loader />;
  } else if (state === "waiting") {
    inner = <Clock className="size-3.5" />;
    tint = "text-amber-600 dark:text-amber-400";
  } else if (state === "failed") {
    inner = <CircleX className="size-3.5" />;
    tint = "text-destructive";
  } else if (state === "denied") {
    inner = <Ban className="size-3.5" />;
  } else if (step.kind === "thought") {
    inner = <Brain className="size-3.5" />;
  } else if (step.kind === "note") {
    inner = <MessageSquareText className="size-3.5" />;
  } else if (step.kind === "search") {
    inner = <Search className="size-3.5" />;
  } else if (step.kind === "web") {
    inner =
      step.part.type === "tool-web_fetch" ? (
        <FileText className="size-3.5" />
      ) : (
        <Globe className="size-3.5" />
      );
  } else {
    const [first] = step.calls;
    const { server } = first ? toolLook(first, servers) : { server: undefined };
    if (server) {
      inner = (
        <BrandLogo
          label={server.title}
          logo={server.logo ?? undefined}
          size={14}
        />
      );
    } else if (first && isMailTool(first.toolName)) {
      inner = <Mail className="size-3.5" />;
    } else {
      inner = <Wrench className="size-3.5" />;
    }
  }
  // The icon changes with the state; the new one comes in from 90 %, so the change reads as «the step ended».
  return (
    <span
      className={cn(
        "relative z-10 grid size-5 place-items-center transition-colors duration-200",
        tint,
        SURFACE
      )}
    >
      <span
        className={cn(
          "animate-in fade-in zoom-in-90 grid place-items-center duration-150",
          EASE,
          "motion-reduce:zoom-in-100"
        )}
        key={state}
      >
        {inner}
      </span>
    </span>
  );
};

type Say = ReturnType<typeof useSay>;

/** The chat's own words for a step, gathered once. */
const useSay = () => ({
  activity: useTranslations("chat.activity"),
  chat: useTranslations("chat"),
  mail: useTranslations("mail.tools"),
  tools: useTranslations("chat.tools"),
  web: useTranslations("chat.web"),
});

const toolTitle = (
  row: ActivityRow & { step: Extract<ActivityRow["step"], { kind: "tool" }> },
  servers: ChatServer[],
  say: Say
) => {
  const [first] = row.step.calls;
  if (!first) {
    return "";
  }
  const label = isMailTool(first.toolName)
    ? say.mail(first.toolName)
    : toolLook(first, servers).label;
  const times = row.step.calls.length > 1 ? ` ×${row.step.calls.length}` : "";
  const { state } = row;
  const status =
    state === "waiting" || state === "failed" || state === "denied"
      ? ` · ${say.tools(state)}`
      : "";
  return `${label}${times}${status}`;
};

const searchTitle = (
  row: ActivityRow & { step: Extract<ActivityRow["step"], { kind: "search" }> },
  say: Say
) => {
  const { part } = row.step;
  let head = say.tools("searching");
  if (part.state === "output-available") {
    head = say.tools("found", { count: part.output.tools.length });
  } else if (row.state === "failed") {
    head = `${say.tools("searching")} · ${say.tools("failed")}`;
  }
  const query = part.input?.query;
  return query ? `${head} · ${say.tools("query", { query })}` : head;
};

const webTitle = (
  row: ActivityRow & { step: Extract<ActivityRow["step"], { kind: "web" }> },
  say: Say
) => {
  const { part } = row.step;
  if (part.type === "tool-web_fetch") {
    let head = say.web("reading");
    if (part.state === "output-available") {
      head = say.web("read");
    } else if (row.state === "failed") {
      head = say.web("readFailed");
    }
    const name =
      part.state === "output-available"
        ? part.output.title
        : siteOf(part.input?.url ?? "");
    return name ? `${head} · ${name}` : head;
  }
  let head = say.web("searching");
  if (part.state === "output-available") {
    head = say.web("found", { count: part.output.results.length });
  } else if (row.state === "failed") {
    head = `${say.web("searching")} · ${say.web("failed")}`;
  }
  const query = part.input?.query;
  return query ? `${head} · ${say.web("query", { query })}` : head;
};

/** The step's line: what it is and where it stands, as the chat already says it. */
const useTitle = (row: ActivityRow, servers: ChatServer[]) => {
  const say = useSay();
  const { step } = row;
  switch (step.kind) {
    case "thought": {
      return row.state === "running"
        ? say.chat("thinking")
        : say.activity("thought");
    }
    case "note": {
      return say.activity("note");
    }
    case "tool": {
      return toolTitle({ ...row, step }, servers, say);
    }
    case "search": {
      return searchTitle({ ...row, step }, say);
    }
    default: {
      return webTitle({ ...row, step }, say);
    }
  }
};

/** What went in and what came back from one call of a tool, each in its own block. */
const CallBlocks = ({ call }: { call: ToolPart }) => {
  const tTools = useTranslations("chat.tools");
  return (
    <div className="text-muted-foreground flex flex-col gap-2 text-xs">
      {call.input !== undefined && (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{tTools("input")}</span>
          <pre className="bg-muted overflow-auto rounded-md p-2 whitespace-pre-wrap">
            {JSON.stringify(call.input, null, 2)}
          </pre>
        </div>
      )}
      {call.state === "output-available" && (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{tTools("output")}</span>
          <pre className="bg-muted overflow-auto rounded-md p-2 whitespace-pre-wrap">
            {outputText(call.output)}
          </pre>
        </div>
      )}
      {call.state === "output-error" && (
        <span className="text-destructive">{call.errorText}</span>
      )}
    </div>
  );
};

/** A call's small mark: the state it ended in. */
const CallMark = ({ call }: { call: ToolPart }) => {
  const state = stateOf([call]);
  if (state === "running") {
    return <Loader />;
  }
  if (state === "waiting") {
    return <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />;
  }
  if (state === "failed") {
    return <CircleX className="text-destructive size-3.5" />;
  }
  return state === "denied" ? (
    <Ban className="size-3.5" />
  ) : (
    <Check className="size-3.5" />
  );
};

/**
 * Several calls of one tool in a row: numbers, one mark each, and ONE slot with the chosen call's input and result —
 * a fixed height, its content just changes. While the work goes on the newest call is shown and the slot follows it;
 * a click of the reader pins the choice. Six long calls are six small marks and one slot, not six windows opening
 * and closing one after another.
 */
const CallSlot = ({ calls }: { calls: ToolPart[] }) => {
  const [picked, setPicked] = useState<string | null>(null);
  const last = calls.at(-1);
  const current = calls.find((c) => c.toolCallId === picked) ?? last;
  if (!(last && current)) {
    return null;
  }
  const running = stateOf([current]) === "running";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {calls.map((call, i) => {
          const on = call.toolCallId === current.toolCallId;
          return (
            <button
              aria-pressed={on}
              className={cn(
                "hover:bg-muted/70 flex h-6 items-center gap-1 rounded-md px-1.5 text-xs transition-colors duration-150",
                on && "bg-muted"
              )}
              key={call.toolCallId}
              onClick={() =>
                setPicked(
                  call.toolCallId === last.toolCallId ? null : call.toolCallId
                )
              }
              type="button"
            >
              <CallMark call={call} />
              <span className="text-muted-foreground tabular-nums">
                №{i + 1}
              </span>
            </button>
          );
        })}
      </div>
      <ThoughtWindow
        bounded
        following={running}
        key={current.toolCallId}
        maxHeightClass="h-28"
        startAtEnd={running}
      >
        <div className="pb-2">
          <CallBlocks call={current} />
        </div>
      </ThoughtWindow>
    </div>
  );
};

/** What the step holds: the words, the calls with what went in and came back, the tools found, the links. */
const RowDetail = ({
  row,
  servers,
}: {
  row: ActivityRow;
  servers: ChatServer[];
}) => {
  const { step } = row;
  let body: ReactNode = null;
  if (step.kind === "thought" || step.kind === "note") {
    body = (
      <p
        className={cn(
          "text-sm leading-relaxed whitespace-pre-wrap",
          step.kind === "thought"
            ? "text-muted-foreground italic"
            : "text-foreground/80"
        )}
      >
        {step.text}
      </p>
    );
  } else if (step.kind === "tool") {
    const [only] = step.calls;
    body =
      step.calls.length > 1 ? (
        <CallSlot calls={step.calls} />
      ) : (
        only && <CallBlocks call={only} />
      );
  } else if (step.kind === "search") {
    const found =
      step.part.state === "output-available" ? step.part.output.tools : [];
    body = (
      <ul className="text-muted-foreground flex flex-col gap-1.5 text-xs">
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
    );
  } else if (
    step.part.type === "tool-web_search" &&
    step.part.state === "output-available"
  ) {
    body = (
      <ul className="flex flex-col gap-1.5 text-xs">
        {step.part.output.results.map((result) => (
          <li className="flex min-w-0 items-baseline gap-2" key={result.url}>
            <a
              className="text-foreground truncate underline-offset-2 hover:underline"
              href={result.url}
              rel="noreferrer"
              target="_blank"
              title={result.snippet || result.title}
            >
              {result.title}
            </a>
            <span className="text-muted-foreground shrink-0">
              {siteOf(result.url)}
            </span>
          </li>
        ))}
      </ul>
    );
  } else if (
    step.part.type === "tool-web_fetch" &&
    step.part.state === "output-available"
  ) {
    body = (
      <a
        className="text-foreground text-xs underline-offset-2 hover:underline"
        href={step.part.output.url}
        rel="noreferrer"
        target="_blank"
      >
        {siteOf(step.part.output.url)}
      </a>
    );
  }
  if (!body) {
    return null;
  }
  // Every open step is a window a few lines high (six): what is longer scrolls, the edge fades, and a step that is
  // still going keeps its newest words in view. A group of calls has its own slot instead.
  const slot = step.kind === "tool" && step.calls.length > 1;
  const running = row.state === "running";
  return (
    <div className="pt-1 pb-2 pl-7">
      {slot ? (
        body
      ) : (
        <ThoughtWindow
          bounded
          following={running}
          maxHeightClass="max-h-36"
          startAtEnd={running}
        >
          {body}
        </ThoughtWindow>
      )}
    </div>
  );
};

const hasDetail = (row: ActivityRow) => {
  const { step } = row;
  if (step.kind === "thought" || step.kind === "note") {
    return step.text.length > 0;
  }
  if (step.kind === "tool") {
    return true;
  }
  if (step.kind === "search") {
    return (
      step.part.state === "output-available" &&
      step.part.output.tools.length > 0
    );
  }
  if (step.part.type === "tool-web_search") {
    return (
      step.part.state === "output-available" &&
      step.part.output.results.length > 0
    );
  }
  return step.part.state === "output-available";
};

const Row = ({
  row,
  servers,
  open,
  onToggle,
}: {
  row: ActivityRow;
  servers: ChatServer[];
  open: boolean;
  onToggle: () => void;
}) => {
  const seconds = useSeconds();
  const title = useTitle(row, servers);
  const expandable = hasDetail(row);
  let time: ReactNode = null;
  if (row.state === "running") {
    time = LIVE_TIMERS ? (
      <LiveTime base={row.ms} since={row.startedAt} />
    ) : null;
  } else if (row.state !== "waiting" && row.ms !== undefined) {
    time = seconds(row.ms);
  }
  return (
    <div className={APPEAR}>
      <button
        aria-expanded={expandable ? open : undefined}
        className="hover:bg-muted/60 grid w-full grid-cols-[1.25rem_1fr_auto_0.875rem] items-center gap-2 rounded-md py-1 pr-1 text-left text-sm transition-colors duration-150 disabled:cursor-default disabled:hover:bg-transparent"
        disabled={!expandable}
        onClick={onToggle}
        type="button"
      >
        <RowIcon row={row} servers={servers} />
        <span
          className={cn(
            "min-w-0 truncate transition-colors duration-200",
            row.state === "running" && "shimmer",
            row.state === "waiting" && "text-amber-700 dark:text-amber-300",
            row.state === "failed" && "text-destructive",
            (row.state === "done" || row.state === "denied") &&
              "text-muted-foreground"
          )}
        >
          {title}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {time}
        </span>
        {expandable ? (
          <ChevronRight
            className={cn(
              "text-muted-foreground size-3.5 transition-transform duration-200",
              EASE,
              open && "rotate-90"
            )}
          />
        ) : (
          <span />
        )}
      </button>
      <Expand open={expandable && open}>
        <RowDetail row={row} servers={servers} />
      </Expand>
    </div>
  );
};

const DOT = {
  asking: "bg-amber-500",
  done: "bg-emerald-500",
  working: "bg-blue-500",
} as const;

/**
 * The work before an answer: reasoning, tool calls and what the model said between them. Open while the model works,
 * folded a second after it ends into one line with what it did; the answer stands below.
 */
export const ActivityBlock = ({
  steps,
  working,
  metadata,
  servers,
}: {
  steps: Parameters<typeof activityRows>[0];
  working: boolean;
  /** What the server measured: the work's time and each call's time. */
  metadata?: {
    createdAt?: string;
    workMs?: number;
    stepMs?: Record<string, number>;
    stepStartedAt?: Record<string, number>;
  };
  servers: ChatServer[];
}) => {
  const t = useTranslations("chat.activity");
  const seconds = useSeconds();
  const rows = activityRows(steps, working, {
    stepMs: metadata?.stepMs,
    stepStartedAt: metadata?.stepStartedAt,
  });
  const asking = rows.some((r) => r.state === "waiting");
  const [open, setOpen] = useAutoOpen(working);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [unfolded, setUnfolded] = useState(false);
  const fold = unfolded ? 0 : foldCount(rows);
  const hidden = new Set(rows.slice(0, fold).map((r) => r.key));
  const folded = rows.slice(0, fold);
  // Their time — only when the server measured some of it; a sum of nothing is not «0,0 с».
  const timed = folded.filter((r) => r.ms !== undefined);
  const foldedMs =
    timed.length === 0 ? null : timed.reduce((sum, r) => sum + (r.ms ?? 0), 0);
  const facts = summaryFacts(rows, metadata?.workMs);
  let phase: keyof typeof DOT = "done";
  if (asking) {
    phase = "asking";
  } else if (working) {
    phase = "working";
  }
  const startedAt = metadata?.createdAt
    ? Date.parse(metadata.createdAt)
    : undefined;
  const summary = [
    facts.seconds === null
      ? t("done")
      : t("doneIn", { seconds: facts.seconds }),
    t("steps", { count: facts.steps }),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section
      className="flex w-full flex-col"
      role={working ? "status" : undefined}
    >
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-1 text-left text-sm"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span
          className={cn(
            "size-2 shrink-0 rounded-full transition-colors duration-200",
            DOT[phase]
          )}
        />
        {/* The status changed («Работает» → «Ждёт разрешения» → the summary): the line fades in again, no movement. */}
        <span
          className={cn(
            "animate-in fade-in flex min-w-0 items-center gap-2 duration-150",
            EASE
          )}
          key={phase}
        >
          {phase === "done" ? (
            <span className="text-muted-foreground min-w-0 truncate">
              {summary}
            </span>
          ) : (
            <>
              <span className="font-medium">
                {phase === "asking" ? t("asking") : t("working")}
              </span>
              {phase === "working" && LIVE_TIMERS && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  <LiveTime since={startedAt} />
                </span>
              )}
            </>
          )}
        </span>
        <ChevronRight
          className={cn(
            "text-muted-foreground ml-auto size-4 shrink-0 transition-transform duration-200",
            EASE,
            open && "rotate-90"
          )}
        />
      </button>
      <Expand open={open}>
        <div className="pb-2">
          <div className="before:bg-border relative before:absolute before:top-3 before:bottom-3 before:left-[9px] before:w-px">
            {fold > 0 && (
              <button
                className={cn(
                  "text-muted-foreground hover:bg-muted/60 relative grid w-full grid-cols-[1.25rem_1fr_auto_0.875rem] items-center gap-2 rounded-md py-1 pr-1 text-left text-sm transition-colors duration-150",
                  APPEAR
                )}
                onClick={() => setUnfolded(true)}
                type="button"
              >
                <span
                  className={cn(
                    "relative z-10 grid size-5 place-items-center",
                    SURFACE
                  )}
                >
                  <ChevronRight className="size-3.5 rotate-90" />
                </span>
                <span>
                  {t("more", {
                    count: folded.reduce((sum, r) => sum + r.count, 0),
                  })}
                </span>
                <span className="text-xs tabular-nums">
                  {foldedMs === null ? null : seconds(foldedMs)}
                </span>
                <span />
              </button>
            )}
            {rows.map((row) => (
              // Folded rows stay in place, closed: they leave smoothly instead of dropping out and pulling all below up.
              <Expand key={row.key} open={!hidden.has(row.key)}>
                <Row
                  onToggle={() =>
                    setToggled((prev) => ({
                      ...prev,
                      [row.key]: !(prev[row.key] ?? opensByItself(row)),
                    }))
                  }
                  open={toggled[row.key] ?? opensByItself(row)}
                  row={row}
                  servers={servers}
                />
              </Expand>
            ))}
          </div>
        </div>
      </Expand>
    </section>
  );
};
