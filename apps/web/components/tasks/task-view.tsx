"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import type { ChatServer } from "@metobe/core/mcp";
import type { TaskRow, TaskRunRow } from "@metobe/core/tasks";
import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, Minus, Play, TriangleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import {
  markTaskSeenAction,
  runAnswerAction,
  runTaskNowAction,
  setTaskEnabledAction,
  setTaskNotifyAction,
} from "@/app/(app)/(chat)/tasks/actions";
import { AssistantMessage } from "@/components/chat/messages";
import { hasAnswer, splitRuns } from "@/lib/task-runs";

// A task's page (ARCH §16.4): the header with its schedule, «Прогнать сейчас» and the switch; «О задаче» folded into a
// line (P15); the last result whole, what came after it in rows, earlier runs under the spoiler (P12). While a run is
// on its way the page looks again every few seconds.

const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out motion-reduce:slide-in-from-bottom-0";
const PRESS =
  "transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";

/** How often the page looks again while a run is queued or going. */
const POLL_MS = 3000;

const Ctx = createContext<{ task: TaskRow; servers: ChatServer[] }>(
  null as never
);

/** «5 ноя, 09:00» in the task's own time zone. */
const useWhen = () => {
  const format = useFormatter();
  const { task } = use(Ctx);
  return (d: Date) =>
    format.dateTime(d, {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      timeZone: task.timezone,
    });
};

/** How long a run went: «40 с», «3 мин». */
const useTook = () => {
  const format = useFormatter();
  return (r: TaskRunRow) => {
    if (!r.startedAt || !r.finishedAt) {
      return "";
    }
    const s = Math.max(
      1,
      Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000)
    );
    return s < 60
      ? format.number(s, {
          style: "unit",
          unit: "second",
          unitDisplay: "short",
        })
      : format.number(Math.round(s / 60), {
          style: "unit",
          unit: "minute",
          unitDisplay: "short",
        });
  };
};

const Mark = ({ run }: { run: TaskRunRow }) => {
  const { task } = use(Ctx);
  if (run.status === "failed") {
    return (
      <TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
    );
  }
  if (run.outcome === "quiet" || run.status === "cancelled") {
    return <Minus className="text-muted-foreground size-3.5 shrink-0" />;
  }
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center">
      <span
        className="size-2 rounded-full"
        style={{ background: task.color }}
      />
    </span>
  );
};

/** A run's line: what it came to. */
const useLine = () => {
  const t = useTranslations("tasks");
  return (r: TaskRunRow) => {
    if (r.status === "cancelled") {
      return t("cancelled");
    }
    if (r.status === "failed") {
      return r.summary ?? t("failed", { error: r.error ?? "—" });
    }
    return r.summary ?? "";
  };
};

const Answer = ({ message }: { message: ChatMessage }) => {
  const { servers } = use(Ctx);
  return (
    <div className="[&_[data-slot=message-footer]]:hidden">
      <AssistantMessage live={false} message={message} servers={servers} />
    </div>
  );
};

// ── The card «О задаче» ────────────────────────────────────────────────────────────────────────────────────────────

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="grid grid-cols-[7rem_1fr] gap-3 py-2.5 text-sm @max-md:grid-cols-1 @max-md:gap-1">
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 break-words whitespace-pre-line">{children}</span>
  </div>
);

const About = ({
  schedule,
  sources,
  onError,
}: {
  schedule: string;
  sources: string[] | null;
  onError: () => void;
}) => {
  const t = useTranslations("tasks");
  const format = useFormatter();
  const { task } = use(Ctx);
  const [open, setOpen] = useState(false);
  const [mail, setMail] = useState(task.notifyEmail);
  const [, start] = useTransition();
  const toggleMail = (on: boolean) => {
    setMail(on);
    start(async () => {
      const { ok } = await setTaskNotifyAction(task.id, on);
      if (!ok) {
        setMail(!on);
        onError();
      }
    });
  };
  return (
    <section className="bg-card rounded-xl border">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="text-muted-foreground shrink-0">{t("about")}</span>
        <span className="min-w-0 flex-1 truncate">{task.instructions}</span>
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div
          className={cn(
            "flex flex-col divide-y border-t px-4 pt-1 pb-2",
            ENTER
          )}
        >
          <Field label={t("fields.does")}>{task.instructions}</Field>
          <Field label={t("fields.schedule")}>{schedule}</Field>
          <Field label={t("fields.sources")}>
            {sources ? sources.join(", ") : t("allSources")}
          </Field>
          <Field label={t("fields.report")}>
            {t(`reportWhen.${task.reportWhen}`)}
          </Field>
          <Field label={t("fields.created")}>
            {format.dateTime(task.createdAt, { dateStyle: "medium" })}
          </Field>
          {/* Letters — each task its own: only when the task waits for the person; «нового нет» never goes. */}
          <div className="grid grid-cols-[7rem_1fr] items-center gap-3 py-2.5 text-sm @max-md:grid-cols-1 @max-md:gap-1">
            <span className="text-muted-foreground">{t("fields.mail")}</span>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className={cn(!mail && "text-muted-foreground")}>
                {mail ? t("mailOn") : t("mailOff")}
                <span className="text-muted-foreground block text-xs">
                  {t("mailNote")}
                </span>
              </span>
              <Switch
                aria-label={t("mailLabel")}
                checked={mail}
                onCheckedChange={toggleMail}
              />
            </label>
          </div>
        </div>
      )}
    </section>
  );
};

// ── Runs ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A run after the last result with nothing to read: a failure (with «Прогнать ещё раз») or «нового нет». */
const Since = ({
  run,
  onRetry,
  busy,
}: {
  run: TaskRunRow;
  onRetry: () => void;
  busy: boolean;
}) => {
  const t = useTranslations("tasks");
  const when = useWhen();
  const line = useLine();
  const failed = run.status === "failed";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg px-3 py-2 text-sm",
        failed ? "bg-amber-500/10" : "bg-muted/50 text-muted-foreground"
      )}
    >
      <Mark run={run} />
      <span className="tabular-nums">{when(run.scheduledFor)}</span>
      <span className={cn("min-w-48 flex-1", failed && "font-medium")}>
        {line(run)}
      </span>
      {failed && (
        <Button
          className={PRESS}
          disabled={busy}
          onClick={onRetry}
          size="sm"
          variant="outline"
        >
          <Play />
          {t("retry")}
        </Button>
      )}
    </div>
  );
};

/** A past run: a line; one with a result opens its answer, loaded when asked. */
const PastRow = ({ run }: { run: TaskRunRow }) => {
  const t = useTranslations("tasks");
  const when = useWhen();
  const took = useTook();
  const line = useLine();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<ChatMessage | null | "failed">(null);
  const [loading, start] = useTransition();
  const opens = hasAnswer(run);
  const toggle = () => {
    setOpen((o) => !o);
    if (!answer || answer === "failed") {
      start(async () => {
        setAnswer((await runAnswerAction(run.id)) ?? "failed");
      });
    }
  };
  return (
    <div className={cn("border-b last:border-b-0", open && "bg-muted/20")}>
      <button
        aria-expanded={opens ? open : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm",
          opens
            ? "hover:bg-muted/50 transition-colors duration-150"
            : "cursor-default"
        )}
        disabled={!opens}
        onClick={toggle}
        type="button"
      >
        <Mark run={run} />
        <span className="text-muted-foreground w-28 shrink-0 tabular-nums">
          {when(run.scheduledFor)}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            opens ? "font-medium" : "text-muted-foreground"
          )}
        >
          {line(run)}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums @max-md:hidden">
          {took(run)}
        </span>
        {opens && (
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        )}
      </button>
      {open && (
        <div className={cn("flex flex-col gap-3 px-3 pt-1 pb-4", ENTER)}>
          {loading && <Spinner className="size-4" />}
          {!loading && answer === "failed" && (
            <p className="text-muted-foreground text-sm">{t("answerFailed")}</p>
          )}
          {!loading && answer && answer !== "failed" && (
            <Answer message={answer} />
          )}
        </div>
      )}
    </div>
  );
};

const Past = ({ runs }: { runs: TaskRunRow[] }) => {
  const t = useTranslations("tasks");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <button
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 self-start text-sm transition-colors duration-150 @max-md:min-h-11"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <ChevronDown
          className={cn(
            "size-4 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
        {t("past", { count: runs.length })}
      </button>
      {open && (
        <div className={cn("bg-card overflow-hidden rounded-xl border", ENTER)}>
          {runs.map((r) => (
            <PastRow key={r.id} run={r} />
          ))}
        </div>
      )}
    </div>
  );
};

/** The run on its way: in the queue or going. */
const Going = ({ run }: { run: TaskRunRow }) => {
  const t = useTranslations("tasks");
  return (
    <div
      aria-live="polite"
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-sm",
        ENTER
      )}
    >
      <Spinner className="size-3.5" />
      {run.status === "running" ? t("running") : t("queued")}
    </div>
  );
};

const Result = ({
  run,
  answer,
}: {
  run: TaskRunRow;
  answer: ChatMessage | null;
}) => {
  const t = useTranslations("tasks");
  const when = useWhen();
  const took = useTook();
  return (
    <section className="flex flex-col gap-2">
      <header className="text-muted-foreground flex items-center gap-2 text-xs">
        <Mark run={run} />
        <span className="text-foreground font-medium">
          {t("latest", { at: when(run.scheduledFor) })}
        </span>
        <span className="ml-auto tabular-nums">{took(run)}</span>
      </header>
      {answer ? (
        <Answer message={answer} />
      ) : (
        <p className="text-sm leading-6">{run.summary}</p>
      )}
    </section>
  );
};

// ── The page ───────────────────────────────────────────────────────────────────────────────────────────────────────

const Controls = ({
  on,
  busy,
  onRun,
  onSwitch,
  compact = false,
}: {
  on: boolean;
  busy: boolean;
  onRun: () => void;
  onSwitch: (on: boolean) => void;
  compact?: boolean;
}) => {
  const t = useTranslations("tasks");
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      {compact ? (
        <Button
          aria-label={t("runNow")}
          className={PRESS}
          disabled={busy}
          onClick={onRun}
          size="icon"
          variant="outline"
        >
          <Play />
        </Button>
      ) : (
        <Button
          className={PRESS}
          disabled={busy}
          onClick={onRun}
          size="sm"
          variant="ghost"
        >
          <Play />
          {t("runNow")}
        </Button>
      )}
      <Switch
        aria-label={t("enabled")}
        checked={on}
        onCheckedChange={onSwitch}
      />
    </span>
  );
};

/** Looks again every few seconds while `active`, and only while the tab is in view. */
const usePoll = (active: boolean) => {
  const router = useRouter();
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);
};

export const TaskView = ({
  task,
  runs,
  answer,
  schedule,
  sources,
  servers,
}: {
  task: TaskRow;
  /** Newest first. */
  runs: TaskRunRow[];
  /** The last result's answer. */
  answer: ChatMessage | null;
  /** The schedule in words. */
  schedule: string;
  /** The sources' titles; null — every connection. */
  sources: string[] | null;
  servers: ChatServer[];
}) => {
  const t = useTranslations("tasks");
  const format = useFormatter();
  const [on, setOn] = useState(task.enabled && !task.pausedReason);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const { active, since, result, past } = splitRuns(runs);
  usePoll(active !== null);
  const unseen = runs.some(
    (r) => r.status === "done" && r.outcome === "news" && !r.seenAt
  );
  useEffect(() => {
    if (unseen) {
      void markTaskSeenAction(task.id);
    }
  }, [unseen, task.id]);
  const act = (fn: () => Promise<{ ok: boolean }>, undo?: () => void) =>
    start(async () => {
      setFailed(false);
      const { ok } = await fn();
      if (!ok) {
        undo?.();
        setFailed(true);
      }
    });
  const runNow = () => act(() => runTaskNowAction(task.id));
  const toggle = (next: boolean) => {
    setOn(next);
    act(
      () => setTaskEnabledAction(task.id, next),
      () => setOn(!next)
    );
  };
  const busy = pending || active !== null;
  const ctx = useMemo(() => ({ servers, task }), [servers, task]);
  const when = (d: Date) =>
    format.dateTime(d, {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      timeZone: task.timezone,
    });
  const state =
    on && task.nextRunAt ? t("next", { when: when(task.nextRunAt) }) : t("off");
  return (
    <Ctx value={ctx}>
      <div className="@container min-h-0 flex-1 overflow-y-auto">
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm backdrop-blur @max-md:hidden">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: task.color }}
          />
          <h1 className="truncate font-medium">{task.name}</h1>
          <span className="text-muted-foreground truncate">
            · {schedule.toLowerCase()} · {state}
          </span>
          <Controls busy={busy} on={on} onRun={runNow} onSwitch={toggle} />
        </header>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-24">
          {/* On a phone there is no header: the name, schedule, run and switch are here. */}
          <div className="hidden flex-col gap-1 @max-md:flex">
            <h1 className="flex items-center gap-2 font-medium">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: task.color }}
              />
              <span className="truncate">{task.name}</span>
            </h1>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground min-w-0 flex-1 truncate">
                {schedule} · {state}
              </span>
              <Controls
                busy={busy}
                compact
                on={on}
                onRun={runNow}
                onSwitch={toggle}
              />
            </div>
          </div>
          {failed && (
            <p className="text-destructive text-sm" role="alert">
              {t("actionFailed")}
            </p>
          )}
          {!on && (
            <output
              className={cn(
                "bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2 text-sm",
                ENTER
              )}
            >
              <span className="min-w-0 flex-1">
                {task.pausedReason && task.enabled
                  ? t("pausedNote", { reason: task.pausedReason })
                  : t("offNote")}
              </span>
              <Button
                className={PRESS}
                disabled={pending}
                onClick={() => toggle(true)}
                size="sm"
                variant="outline"
              >
                {t("turnOn")}
              </Button>
            </output>
          )}
          <About
            onError={() => setFailed(true)}
            schedule={schedule}
            sources={sources}
          />
          {active && <Going run={active} />}
          {since.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {since.map((r) => (
                <Since busy={busy} key={r.id} onRetry={runNow} run={r} />
              ))}
            </div>
          )}
          {result && <Result answer={answer} run={result} />}
          {!result && runs.length === 0 && task.nextRunAt && (
            <p className="text-muted-foreground text-sm">
              {t("noRuns", { when: when(task.nextRunAt) })}
            </p>
          )}
          {!result &&
            since.length > 0 &&
            since.every((r) => r.outcome === "quiet") && (
              <p className="text-muted-foreground text-sm">{t("noResult")}</p>
            )}
          {past.length > 0 && <Past runs={past} />}
        </div>
      </div>
    </Ctx>
  );
};
