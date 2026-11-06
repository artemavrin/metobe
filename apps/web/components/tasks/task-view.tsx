"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import type { ChatServer } from "@metobe/core/mcp";
import type { TaskRow, TaskRunRow, TaskRuns } from "@metobe/core/tasks";
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
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Minus,
  Play,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Fragment,
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import {
  applyTaskChangeAction,
  cancelTaskChangeAction,
  deleteTaskAction,
  markTaskSeenAction,
  proposeTaskChangeAction,
  revertTaskChangeAction,
  runAnswerAction,
  runTaskNowAction,
  setTaskEnabledAction,
  testTaskChangeAction,
} from "@/app/(app)/(chat)/tasks/actions";
import { ActivityBlock } from "@/components/chat/activity";
import { AssistantMessage } from "@/components/chat/messages";
import { About, ChangeBox, ENTER, PRESS } from "@/components/tasks/task-about";
import type {
  ChangeOps,
  TaskChangeView,
  TaskFields,
} from "@/components/tasks/task-about";
import { answerWork } from "@/lib/answer-work";
import { clock, hasAnswer } from "@/lib/task-runs";

// A task's page (ARCH §16.4): the header with its schedule, «Прогнать сейчас» and the switch; «О задаче» folded into a
// line (P15); the last result whole, what came after it in rows, earlier runs under the spoiler (P12). While a run is
// on its way the page looks again every few seconds.

/** How often the page looks again: often while a run is queued or going, now and then otherwise — a run comes on its
 *  schedule, and the page shows it without a reload. */
const POLL_MS = { active: 3000, idle: 15_000 };

/** An applied version, for the line «Изменена 12 ноя: …» among the past runs. */
export interface TaskVersionLine {
  version: number;
  createdAt: Date;
  changeSummary: string | null;
}

const Ctx = createContext<{
  task: TaskRow;
  servers: ChatServer[];
  versions: TaskVersionLine[];
}>(null as never);

export type { TaskFields } from "@/components/tasks/task-about";

/** A run's time as people say it: today, tomorrow, yesterday, else the date — in the task's own time zone. */
const useRunTime = (zone: string) => {
  const t = useTranslations("tasks");
  const format = useFormatter();
  const locale = useLocale();
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(d);
  return (d: Date) => {
    const time = clock(d, zone, locale);
    const now = new Date();
    if (day(d) === day(now)) {
      return t("todayAt", { time });
    }
    if (day(d) === day(new Date(now.getTime() + 86_400_000))) {
      return t("tomorrowAt", { time });
    }
    if (day(d) === day(new Date(now.getTime() - 86_400_000))) {
      return t("yesterdayAt", { time });
    }
    const date = format.dateTime(d, {
      day: "numeric",
      month: "short",
      timeZone: zone,
      weekday: "short",
    });
    return `${date}, ${clock(d, zone, locale)}`;
  };
};

/** «сегодня в 16:56», «вчера в 9:00», «пт, 6 нояб., 9:00» — in the task's own time zone. */
const useWhen = () => {
  const { task } = use(Ctx);
  return useRunTime(task.timezone);
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

// ── Runs ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A failure after the last result: a row with why, and «Прогнать ещё раз». */
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
        failed ? "bg-amber-500/10" : "bg-muted/50"
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

/** «Изменена 12 ноя: …» under the first run of a new version, among the past runs. */
const ChangedLine = ({
  newer,
  older,
}: {
  newer: TaskRunRow;
  older: TaskRunRow | undefined;
}) => {
  const t = useTranslations("tasks");
  const format = useFormatter();
  const { versions } = use(Ctx);
  const changed =
    older && newer.taskVersion > older.taskVersion
      ? versions.find((v) => v.version === newer.taskVersion)
      : undefined;
  if (!changed?.changeSummary) {
    return null;
  }
  return (
    <p className="text-muted-foreground bg-muted/40 border-b px-3 py-1.5 text-xs last:border-b-0">
      {t("changeLine", {
        date: format.dateTime(changed.createdAt, {
          day: "numeric",
          month: "short",
        }),
        summary: changed.changeSummary,
      })}
    </p>
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
          {runs.map((r, i) => (
            <Fragment key={r.id}>
              <PastRow run={r} />
              <ChangedLine newer={r} older={runs[i + 1]} />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

/** «1 мин 10 с» since `from`, ticking every second; nothing until the page is in the browser (the server's clock is not its). */
const useElapsed = (from: Date | null) => {
  const format = useFormatter();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the browser's clock: the server's render must not show its own
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!from || now === null) {
    return "";
  }
  const s = Math.max(0, Math.round((now - from.getTime()) / 1000));
  const unit = (n: number, u: "minute" | "second") =>
    format.number(n, { style: "unit", unit: u, unitDisplay: "short" });
  return s < 60
    ? unit(s, "second")
    : `${unit(Math.floor(s / 60), "minute")} ${unit(s % 60, "second")}`;
};

/**
 * The run on its way, as a bar: in the queue, or going — for how long and how many steps so far. A going run opens
 * its steps in a panel; the page itself stays as it is.
 */
const Going = ({
  run,
  answer,
  onOpen,
}: {
  run: TaskRunRow;
  answer: ChatMessage | null;
  onOpen: () => void;
}) => {
  const t = useTranslations("tasks");
  const elapsed = useElapsed(run.startedAt);
  const steps = answer ? answerWork(answer.parts).steps.length : 0;
  const going = run.status === "running";
  const line = (
    <>
      <Spinner className="size-3.5 shrink-0" />
      <span className="font-medium">
        {going ? t("goingTitle") : t("queued")}
      </span>
      {going && (
        <span className="text-muted-foreground min-w-0 flex-1 truncate tabular-nums">
          {[elapsed, steps > 0 && t("goingSteps", { count: steps })]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
    </>
  );
  const bar =
    "flex w-full items-center gap-2.5 rounded-xl border bg-card px-4 py-3 text-left text-sm";
  if (!going) {
    return (
      <p aria-live="polite" className={cn(bar, ENTER)}>
        {line}
      </p>
    );
  }
  return (
    <button
      aria-live="polite"
      className={cn(
        bar,
        "hover:bg-muted/40 transition-colors duration-150",
        ENTER
      )}
      onClick={onOpen}
      type="button"
    >
      {line}
      <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-xs">
        {t("details")}
        <ChevronRight className="size-3.5" />
      </span>
    </button>
  );
};

/** The title of the run's window: going, done, failed or cancelled. */
const windowTitle = (
  t: ReturnType<typeof useTranslations<"tasks">>,
  done: boolean,
  ending: TaskRunRow | null
) => {
  if (!done) {
    return t("goingTitle");
  }
  if (ending?.status === "failed") {
    return t("windowFailed");
  }
  if (ending?.status === "cancelled") {
    return t("windowCancelled");
  }
  return t("windowDone");
};

/**
 * The run in a window over the page: its steps live while it goes; once it ends — the whole answer, the steps folded
 * above the result, and a failure's reason on top.
 */
const RunWindow = ({
  open,
  onClose,
  answer,
  done,
  ending,
}: {
  open: boolean;
  onClose: () => void;
  answer: ChatMessage | null;
  done: boolean;
  /** The ended run's row, when the page lists it. */
  ending: TaskRunRow | null;
}) => {
  const t = useTranslations("tasks");
  const line = useLine();
  const { servers, task } = use(Ctx);
  const steps = answer ? answerWork(answer.parts).steps : [];
  const failed = ending?.status === "failed" || ending?.status === "cancelled";
  let body: React.ReactNode = (
    <p className="text-muted-foreground flex items-center gap-2">
      <Spinner className="size-3.5" />
      {t("running")}
    </p>
  );
  if (done && answer) {
    body = <Answer message={answer} />;
  } else if (steps.length > 0) {
    body = (
      <ActivityBlock
        keepOpen
        metadata={answer?.metadata}
        servers={servers}
        steps={steps}
        working
      />
    );
  }
  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent className="flex max-h-[min(85dvh,44rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{windowTitle(t, done, ending)}</DialogTitle>
          <DialogDescription>{task.name}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">
          {failed && ending && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
              <Mark run={ending} />
              {line(ending)}
            </p>
          )}
          {(answer || !done) && body}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** «После него 3 запуска без изменений, последний сегодня в 17:00» — the runs with nothing new, counted. */
const QuietLine = ({
  quiet,
  after,
}: {
  quiet: NonNullable<TaskRuns["quiet"]>;
  after: boolean;
}) => {
  const t = useTranslations("tasks");
  const when = useWhen();
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Check aria-hidden className="size-3.5 shrink-0" />
      {t(after ? "quietAfter" : "quietOnly", {
        count: quiet.count,
        when: when(quiet.last),
      })}
    </p>
  );
};

const Result = ({
  run,
  answer,
  quiet,
}: {
  run: TaskRunRow;
  answer: ChatMessage | null;
  quiet: TaskRuns["quiet"];
}) => {
  const t = useTranslations("tasks");
  const when = useWhen();
  const took = useTook();
  const length = took(run);
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">
            {run.trigger === "test" ? t("testTitle") : t("latestTitle")}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {when(run.scheduledFor)}
            {length && ` · ${length}`}
          </span>
        </p>
        {quiet && <QuietLine after quiet={quiet} />}
      </header>
      {answer ? (
        <Answer message={answer} />
      ) : (
        <p className="text-sm leading-6">{run.summary}</p>
      )}
    </section>
  );
};

/**
 * The run whose steps are open in the window. It stays open when the run ends, whatever the end: with a result the
 * window shows the result's steps; with nothing new or a failure — the run's own final steps, read once, since the
 * last poll may have missed the end.
 */
const useWatched = ({
  runs,
  going,
  answer,
}: {
  runs: TaskRuns;
  going: ChatMessage | null;
  answer: ChatMessage | null;
}) => {
  const { active, result, failures } = runs;
  const [watching, setWatching] = useState<string | null>(null);
  const [kept, setKept] = useState<ChatMessage | null>(null);
  const live = watching !== null && active?.id === watching;
  const ended = watching !== null && result?.id === watching;
  if (live && going && going !== kept) {
    setKept(going);
  }
  const gone = watching !== null && !live && !ended ? watching : null;
  useEffect(() => {
    if (!gone) {
      return;
    }
    let current = true;
    const read = async () => {
      const a = await runAnswerAction(gone);
      if (current && a) {
        setKept(a);
      }
    };
    void read();
    return () => {
      current = false;
    };
  }, [gone]);
  let shown = kept;
  if (live) {
    shown = going;
  } else if (ended) {
    shown = answer;
  }
  // How it ended, when the page lists it: a result or a failure. A run with nothing new is only counted.
  const ending = live
    ? null
    : ([result, ...failures].find((r) => r?.id === watching) ?? null);
  return {
    answer: shown,
    done: !live,
    ending,
    handleClose: () => setWatching(null),
    open: watching !== null,
    watch: (runId: string) => {
      setKept(going);
      setWatching(runId);
    },
  };
};

/** The runs: the one on its way, the failures after the last result, the result with the quiet ones counted, the past. */
const Runs = ({
  runs,
  answer,
  going,
  busy,
  onRetry,
}: {
  runs: TaskRuns;
  answer: ChatMessage | null;
  /** The run on its way, as far as it got. */
  going: ChatMessage | null;
  busy: boolean;
  onRetry: () => void;
}) => {
  const t = useTranslations("tasks");
  const { task } = use(Ctx);
  const when = useWhen();
  const { active, failures, result, past, quiet } = runs;
  const nothing = !(result || quiet || failures.length > 0 || active);
  const watched = useWatched({ answer, going, runs });
  return (
    <>
      {active && (
        <Going
          answer={going}
          onOpen={() => watched.watch(active.id)}
          run={active}
        />
      )}
      <RunWindow
        answer={watched.answer}
        done={watched.done}
        ending={watched.ending}
        onClose={watched.handleClose}
        open={watched.open}
      />
      {failures.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {failures.map((r) => (
            <Since busy={busy} key={r.id} onRetry={onRetry} run={r} />
          ))}
        </div>
      )}
      {result && <Result answer={answer} quiet={quiet} run={result} />}
      {!result && quiet && <QuietLine after={false} quiet={quiet} />}
      {nothing && task.nextRunAt && (
        <p className="text-muted-foreground text-sm">
          {t("noRuns", { when: when(task.nextRunAt) })}
        </p>
      )}
      {past.length > 0 && <Past runs={past} />}
    </>
  );
};

// ── The page ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** «Удалить задачу?»: a task cannot be brought back, so the menu asks once. */
const ConfirmDelete = ({
  name,
  open,
  onOpenChange,
  onConfirm,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => {
  const t = useTranslations("tasks");
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("deleteTitle")}</DialogTitle>
          <DialogDescription>{t("deleteText", { name })}</DialogDescription>
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
            {t("deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Controls = ({
  on,
  busy,
  onRun,
  onSwitch,
  onDelete,
}: {
  on: boolean;
  busy: boolean;
  onRun: () => void;
  onSwitch: (on: boolean) => void;
  onDelete: () => void;
}) => {
  const t = useTranslations("tasks");
  const { task } = use(Ctx);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex shrink-0 items-center gap-3">
      <Button
        aria-label={t("runNow")}
        className={PRESS}
        disabled={busy}
        onClick={onRun}
        size="sm"
        variant="outline"
      >
        <Play />
        <span className="@max-md:hidden">{t("runNow")}</span>
      </Button>
      <Switch
        aria-label={t("enabled")}
        checked={on}
        onCheckedChange={onSwitch}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label={t("actions")} size="icon-sm" variant="ghost" />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => setConfirming(true)}
            variant="destructive"
          >
            <Trash2 /> {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDelete
        name={task.name}
        onConfirm={onDelete}
        onOpenChange={setConfirming}
        open={confirming}
      />
    </div>
  );
};

/** Looks again while the tab is in view: every few seconds while a run goes, else now and then. */
const usePoll = (active: boolean) => {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") {
          router.refresh();
        }
      },
      active ? POLL_MS.active : POLL_MS.idle
    );
    return () => clearInterval(timer);
  }, [active, router]);
};

/**
 * A change in words (P15): the request goes to the model, the change comes back with the page as a version not
 * applied; «Применить», «Тестовый запуск», «Отменить», «Вернуть как было» go through the page's own `act`.
 */
const useChange = ({
  task,
  versions,
  act,
  busy,
}: {
  task: TaskRow;
  versions: TaskVersionLine[];
  act: (fn: () => Promise<{ ok: boolean }>) => void;
  busy: boolean;
}) => {
  const t = useTranslations("tasks");
  const [asked, setAsked] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const NOTICE = {
    failed: t("changeFailed"),
    "no-change": t("changeNone"),
    "no-model": t("changeNoModel"),
    "not-found": t("changeFailed"),
  } as const;
  const send = async (text: string) => {
    setNotice(null);
    setAsked(text);
    const result = await proposeTaskChangeAction(task.id, text);
    setAsked(null);
    if (!result.ok) {
      setNotice(("reply" in result && result.reply) || NOTICE[result.error]);
    }
    return result.ok;
  };
  const last = versions.at(-1);
  const ops: ChangeOps = {
    asked,
    busy,
    changedAt: task.version > 1 && last ? last.createdAt : null,
    handleApply: () => act(() => applyTaskChangeAction(task.id)),
    handleCancel: () => act(() => cancelTaskChangeAction(task.id)),
    handleRevert: () => act(() => revertTaskChangeAction(task.id)),
    handleTest: () => act(() => testTaskChangeAction(task.id)),
  };
  return { handleSend: send, notice, ops };
};

export const TaskView = ({
  task,
  runs,
  answer,
  going,
  current,
  change,
  versions,
  servers,
}: {
  task: TaskRow;
  runs: TaskRuns;
  /** The last result's answer. */
  answer: ChatMessage | null;
  /** The run on its way, as far as it got. */
  going: ChatMessage | null;
  /** The task as the card shows it. */
  current: TaskFields;
  /** A change not applied yet. */
  change: TaskChangeView | null;
  /** The applied versions, the first first. */
  versions: TaskVersionLine[];
  servers: ChatServer[];
}) => {
  const t = useTranslations("tasks");
  const [on, setOn] = useState(task.enabled && !task.pausedReason);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const { active, result } = runs;
  usePoll(active !== null);
  const unseen = result?.outcome === "news" && !result.seenAt;
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
  const router = useRouter();
  const remove = () =>
    act(async () => {
      const res = await deleteTaskAction(task.id);
      if (res.ok) {
        router.replace("/tasks");
      }
      return res;
    });
  const toggle = (next: boolean) => {
    setOn(next);
    act(
      () => setTaskEnabledAction(task.id, next),
      () => setOn(!next)
    );
  };
  const busy = pending || active !== null;
  const ctx = useMemo(
    () => ({ servers, task, versions }),
    [servers, task, versions]
  );
  const editing = useChange({ act, busy: pending, task, versions });
  const nextWords = useRunTime(task.timezone);
  const state =
    on && task.nextRunAt
      ? t("next", { when: nextWords(task.nextRunAt) })
      : t("off");
  const { schedule } = current;
  return (
    <Ctx value={ctx}>
      <div className="@container flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-6 md:pt-6">
          <header className="flex items-start gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: task.color }}
                />
                <span className="truncate">{task.name}</span>
              </h1>
              <p className="text-muted-foreground text-sm">
                {schedule} · {state}
              </p>
            </div>
            <Controls
              busy={busy}
              on={on}
              onDelete={remove}
              onRun={runNow}
              onSwitch={toggle}
            />
          </header>
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
            change={change}
            current={current}
            onError={() => setFailed(true)}
            ops={editing.ops}
            task={task}
            when={nextWords}
          />
          <Runs
            answer={answer}
            busy={busy}
            going={going}
            onRetry={runNow}
            runs={runs}
          />
        </div>
        <ChangeBox
          busy={editing.ops.asked !== null}
          notice={editing.notice}
          onSend={editing.handleSend}
        />
      </div>
    </Ctx>
  );
};
