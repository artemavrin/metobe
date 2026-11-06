"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import type { ChatServer } from "@metobe/core/mcp";
import type { TaskListItem } from "@metobe/core/tasks";
import { Button } from "@metobe/ui/components/button";
import { Checkbox } from "@metobe/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ListChecks,
  Pause,
  Play,
  Plus,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  deleteTasksAction,
  markRunsUnseenAction,
  markTasksSeenAction,
  runAnswerAction,
  runTaskNowAction,
  setTaskEnabledAction,
  setTasksEnabledAction,
} from "@/app/(app)/(chat)/tasks/actions";
import { AssistantMessage } from "@/components/chat/messages";
import { TopBar } from "@/components/chat/top-bar";
import { ENTER, PRESS } from "@/components/tasks/task-about";
import { TaskDot } from "@/components/tasks/task-dot";
import { FixButton } from "@/components/tasks/task-fix";
import type { FixMailbox } from "@/components/tasks/task-fix";
import { usePoll, useRunTime } from "@/components/tasks/task-view";

// The owner's tasks «по вниманию» (ARCH §16.4, P13): what needs the person first — a failure or a stop with the way
// out in the row; then new results, the result opening in its row; then the rest with the next run; the ones turned
// off under a spoiler. A task turned on or off moves to its group at once; a result read or a failure fixed stays.

/** A row in the list, with the schedule already in words. */
export type TaskListRow = TaskListItem & { schedule: string };

type Group = "action" | "fresh" | "rest" | "off";

const needsAction = ({ task, last, result }: TaskListRow) =>
  task.pausedReason !== null ||
  last?.status === "failed" ||
  last?.status === "waiting_approval" ||
  ((result?.outcome === "question" || result?.outcome === "action") &&
    result.resolvedAt === null);

const groupOf = (row: TaskListRow): Group => {
  if (!row.task.enabled) {
    return "off";
  }
  if (needsAction(row)) {
    return "action";
  }
  return row.result?.outcome === "news" && row.result.seenAt === null
    ? "fresh"
    : "rest";
};

const ROW =
  "flex items-center gap-3 border-b px-3 py-2.5 text-sm last:border-b-0 @max-md:min-h-12";
/** A text button, 44 px to tap on a phone. */
const TEXT_TAP =
  "text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors duration-150 @max-md:min-h-11";

/** The name with its colour; «новый итог» as the colour dot ringing (Tailwind «ping»), and in words for a screen reader. */
const Name = ({ row, unread }: { row: TaskListRow; unread: boolean }) => {
  const t = useTranslations("tasks.list");
  return (
    <span className="flex min-w-0 items-center gap-2" title={row.task.name}>
      <TaskDot color={row.task.color} ringing={unread} />
      <span
        className={cn("truncate", unread ? "font-semibold" : "font-medium")}
      >
        {row.task.name}
      </span>
      {unread && <span className="sr-only">, {t("newResult")}</span>}
    </span>
  );
};

/** The tasks picked in the list, to turn on, off or delete together. */
const Picked = createContext<{
  active: boolean;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}>({ active: false, has: () => false, toggle: () => null });

/**
 * A row with its checkbox in front, always in sight: the checkboxes make a column under «Выбрать все» in the list's
 * bar.
 */
const Pickable = ({
  row,
  children,
}: {
  row: TaskListRow;
  children: React.ReactNode;
}) => {
  const t = useTranslations("tasks.list");
  const picked = use(Picked);
  const on = picked.has(row.task.id);
  return (
    <div
      className={cn(
        "group/row flex items-stretch border-b transition-colors duration-150 last:border-b-0",
        on && "bg-muted/50"
      )}
    >
      <span className="flex shrink-0 items-center pl-3">
        <Checkbox
          aria-label={t("selectTask", { name: row.task.name })}
          checked={on}
          onCheckedChange={() => picked.toggle(row.task.id)}
        />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

const Section = ({
  title,
  count,
  action,
  children,
}: {
  title?: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section aria-label={title} className="flex flex-col gap-2">
    {title && (
      <h2 className="text-muted-foreground flex min-h-7 items-center gap-1 px-1 text-xs">
        {title}
        <span className="tabular-nums">· {count}</span>
        {action && <span className="ml-auto">{action}</span>}
      </h2>
    )}
    <div className="bg-card overflow-hidden rounded-xl border">{children}</div>
  </section>
);

/** What a row that needs the person says: why it stopped or failed, or what its last result asks. */
const useWhy = () => {
  const t = useTranslations("tasks");
  return ({ task, last, result }: TaskListRow) => {
    if (task.pausedReason) {
      return t("pausedNote", { reason: task.pausedReason });
    }
    if (last?.status === "failed") {
      return last.summary ?? t("failed", { error: last.error ?? "—" });
    }
    if (last?.status === "waiting_approval") {
      return last.summary ?? t("waitingTitle");
    }
    return result?.summary ?? "";
  };
};

/** A failure or a stop, and the way out in the row: «Прогнать ещё раз», «Включить», or the task's page. */
const ActionRow = ({
  row,
  servers,
  mailboxes,
}: {
  row: TaskListRow;
  servers: ChatServer[];
  mailboxes: FixMailbox[];
}) => {
  const t = useTranslations("tasks");
  const why = useWhy();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const act = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      setFailed(false);
      const { ok } = await fn();
      setFailed(!ok);
    });
  const href = `/tasks/${row.task.id}`;
  // Fixed while the page is open: the row stays and says how it went.
  const settled = !(row.going || needsAction(row));
  let way: React.ReactNode = null;
  if (row.going || pending) {
    way = (
      <span
        aria-live="polite"
        className="text-muted-foreground flex items-center gap-2 text-sm"
      >
        <Spinner className="size-3.5" />
        {t("running")}
      </span>
    );
  } else if (settled) {
    way = (
      <Link className={TEXT_TAP} href={href}>
        {t("list.open")}
        <ArrowRight className="size-3.5" />
      </Link>
    );
  } else if (row.result?.fix && row.result.outcome === "action") {
    way = (
      <FixButton
        fix={row.result.fix}
        mailboxes={mailboxes}
        servers={servers}
        taskId={row.task.id}
      />
    );
  } else if (row.task.pausedReason) {
    way = (
      <Button
        className={PRESS}
        onClick={() => act(() => setTaskEnabledAction(row.task.id, true))}
        size="sm"
        variant="outline"
      >
        {t("turnOn")}
      </Button>
    );
  } else if (row.last?.status === "failed") {
    way = (
      <Button
        className={PRESS}
        onClick={() => act(() => runTaskNowAction(row.task.id))}
        size="sm"
        variant="outline"
      >
        <Play />
        {t("retry")}
      </Button>
    );
  } else {
    way = (
      <Link className={TEXT_TAP} href={href}>
        {t("list.open")}
        <ArrowRight className="size-3.5" />
      </Link>
    );
  }
  return (
    <div className={cn(ROW, "flex-wrap gap-y-2")}>
      <Link
        className="min-w-0 shrink-0 basis-52 @max-md:basis-full"
        href={href}
      >
        <Name row={row} unread={false} />
      </Link>
      <span className="flex min-w-48 flex-1 items-center gap-2">
        {settled ? (
          <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        )}
        <span className={cn(failed && "text-destructive")}>
          {failed ? t("actionFailed") : why(row)}
        </span>
      </span>
      {way}
    </div>
  );
};

/** A new result: the row opens to the result itself; opening it marks it read. */
const FreshRow = ({
  row,
  unread,
  onRead,
  servers,
}: {
  row: TaskListRow;
  unread: boolean;
  onRead: () => void;
  servers: ChatServer[];
}) => {
  const t = useTranslations("tasks");
  const when = useRunTime(row.task.timezone);
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<ChatMessage | null | "failed">(null);
  const [loading, start] = useTransition();
  const { result } = row;
  const toggle = () => {
    setOpen((o) => !o);
    if (unread) {
      onRead();
    }
    if (result && (!answer || answer === "failed")) {
      start(async () => {
        setAnswer((await runAnswerAction(result.id)) ?? "failed");
      });
    }
  };
  const panel = `result-${row.task.id}`;
  let body: React.ReactNode = null;
  if (loading) {
    body = (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner className="size-3.5" />
      </p>
    );
  } else if (answer === "failed") {
    body = <p className="text-destructive text-sm">{t("answerFailed")}</p>;
  } else if (answer) {
    body = (
      <div className="[&_[data-slot=message-footer]]:hidden">
        <AssistantMessage live={false} message={answer} servers={servers} />
      </div>
    );
  }
  return (
    <div className="border-b last:border-b-0">
      <button
        aria-controls={panel}
        aria-expanded={open}
        className={cn(
          ROW,
          "hover:bg-muted/40 w-full border-b-0 text-left transition-colors duration-150 @max-md:flex-wrap @max-md:gap-y-1"
        )}
        onClick={toggle}
        type="button"
      >
        <span className="w-52 shrink-0 @max-md:w-auto @max-md:min-w-0 @max-md:flex-1">
          <Name row={row} unread={unread} />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate @max-md:order-last @max-md:basis-full @max-md:pl-4",
            unread ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {result?.summary}
        </span>
        {result?.finishedAt && (
          <span className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
            {t("list.resultAt", { when: when(result.finishedAt) })}
          </span>
        )}
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div
          className={cn("flex flex-col gap-3 px-3 pt-1 pb-4 pl-8", ENTER)}
          id={panel}
        >
          {body}
          <div>
            <Link className={TEXT_TAP} href={`/tasks/${row.task.id}`}>
              {t("list.openTask")}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

/** One of the rest: its last result in grey, its next run in words. */
const RestRow = ({ row }: { row: TaskListRow }) => {
  const t = useTranslations("tasks");
  const when = useRunTime(row.task.timezone);
  const line = row.result?.summary ?? row.last?.summary ?? row.schedule;
  return (
    <Link
      className={cn(
        ROW,
        "hover:bg-muted/40 w-full transition-colors duration-150"
      )}
      href={`/tasks/${row.task.id}`}
    >
      <span className="w-52 shrink-0 @max-md:w-auto @max-md:min-w-0 @max-md:flex-1">
        <Name row={row} unread={false} />
      </span>
      <span className="text-muted-foreground min-w-0 flex-1 truncate @max-md:hidden">
        {line}
      </span>
      <span className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
        {row.going && t("running")}
        {!row.going &&
          row.task.nextRunAt &&
          t("list.nextAt", { when: when(row.task.nextRunAt) })}
      </span>
    </Link>
  );
};

/** A task turned off: «Включить», and «Выключить» right after — the same words as the bar — the row staying where it is. */
const OffRow = ({ row }: { row: TaskListRow }) => {
  const t = useTranslations("tasks");
  const when = useRunTime(row.task.timezone);
  const [, start] = useTransition();
  const on = row.task.enabled;
  const toggle = () =>
    start(async () => {
      await setTaskEnabledAction(row.task.id, !on);
    });
  return (
    <div className={ROW}>
      <Link
        className={cn(
          "min-w-0 flex-1 transition-opacity duration-200",
          !on && "opacity-60"
        )}
        href={`/tasks/${row.task.id}`}
      >
        <Name row={row} unread={false} />
      </Link>
      <span
        aria-live="polite"
        className="text-muted-foreground text-xs @max-md:hidden"
      >
        {on && row.task.nextRunAt
          ? t("list.turnedOn", { when: when(row.task.nextRunAt) })
          : row.schedule}
      </span>
      <Button
        className={PRESS}
        onClick={toggle}
        size="sm"
        variant={on ? "ghost" : "outline"}
      >
        {on ? t("list.turnOffMany") : t("turnOn")}
      </Button>
    </div>
  );
};

/** «Отметить прочитанными» for the new results, and «Вернуть непрочитанными» for five seconds after. */
const useMarkAll = (rows: TaskListRow[], read: Set<string>) => {
  const [marked, setMarked] = useState<TaskListRow[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );
  const unread = rows.filter(
    (r) => r.result?.seenAt === null && !read.has(r.task.id)
  );
  const markAll = async () => {
    setMarked(unread);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setMarked(null), 5000);
    await markTasksSeenAction(unread.map((r) => r.task.id));
  };
  const undo = async () => {
    const back = marked ?? [];
    setMarked(null);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    await markRunsUnseenAction(back.flatMap((r) => r.result?.id ?? []));
  };
  return { markAll, marked, undo, unread };
};

const FreshSection = ({
  rows,
  servers,
}: {
  rows: TaskListRow[];
  servers: ChatServer[];
}) => {
  const t = useTranslations("tasks.list");
  // Read here while the page is open: the server's word comes with the next look.
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const all = useMarkAll(rows, read);
  let action: React.ReactNode = null;
  if (all.marked) {
    action = (
      <Button
        className={PRESS}
        onClick={() => {
          void all.undo();
        }}
        size="xs"
        variant="ghost"
      >
        <Undo2 />
        {t("markUnread")}
      </Button>
    );
  } else if (all.unread.length > 0) {
    action = (
      <Button
        className={PRESS}
        onClick={() => {
          void all.markAll();
        }}
        size="xs"
        variant="ghost"
      >
        {t("markRead")}
      </Button>
    );
  }
  return (
    <Section action={action} count={rows.length} title={t("freshGroup")}>
      {rows.map((r) => (
        <Pickable key={r.task.id} row={r}>
          <FreshRow
            onRead={() => {
              setRead((s) => new Set(s).add(r.task.id));
              void markTasksSeenAction([r.task.id]);
            }}
            row={r}
            servers={servers}
            unread={r.result?.seenAt === null && !read.has(r.task.id)}
          />
        </Pickable>
      ))}
    </Section>
  );
};

const OffSection = ({
  rows,
  alone,
}: {
  rows: TaskListRow[];
  /** Nothing else on the list: the spoiler starts open, or the page would be empty. */
  alone: boolean;
}) => {
  const t = useTranslations("tasks.list");
  const [open, setOpen] = useState(alone);
  // While picking, what is picked must be in sight: «Выбрать все» takes these rows too.
  const shown = open || use(Picked).active;
  return (
    <section
      aria-label={t("offGroup", { count: rows.length })}
      className="flex flex-col gap-2"
    >
      <button
        aria-expanded={shown}
        className={cn(TEXT_TAP, "self-start px-1")}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform duration-200",
            shown && "rotate-180"
          )}
        />
        {t("offGroup", { count: rows.length })}
      </button>
      {shown && (
        <div className={cn("bg-card overflow-hidden rounded-xl border", ENTER)}>
          {rows.map((r) => (
            <Pickable key={r.task.id} row={r}>
              <OffRow row={r} />
            </Pickable>
          ))}
        </div>
      )}
    </section>
  );
};

/** The picked tasks, as a set of ids. */
const usePick = (rows: TaskListRow[]) => {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  // A task deleted meanwhile is no longer picked.
  const present = new Set(rows.map((r) => r.task.id));
  const picked = [...ids].filter((id) => present.has(id));
  const active = picked.length > 0;
  const toggle = (id: string) =>
    setIds((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const clear = () => {
    setIds(new Set());
  };
  const all = picked.length > 0 && picked.length === present.size;
  return {
    active,
    all,
    clear,
    context: { active, has: (id: string) => ids.has(id), toggle },
    // Every task on the list, the ones under «Выключены» too; all picked — none.
    handleAll: () => setIds(all ? new Set() : new Set(present)),
    handleClear: clear,
    picked,
  };
};

/** «Удалить 2 задачи?» names the tasks: a count alone makes it easy to delete the wrong ones. */
const MAX_NAMED = 6;

/**
 * The bar over the page holds the list's picking (no row jumps when something is picked): «Выбрать все» beside
 * «Новая задача»; with something picked — how many, and what to do with them. The rows' checkboxes stay in sight.
 */
const ListBar = ({
  pick,
  rows,
}: {
  pick: ReturnType<typeof usePick>;
  rows: TaskListRow[];
}) => {
  const tasks = useTranslations("tasks");
  const t = useTranslations("tasks.list");
  const tt = useTranslations("tasks");
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const count = pick.picked.length;
  const none = count === 0 || pending;
  const names = rows
    .filter((r) => pick.picked.includes(r.task.id))
    .map((r) => r.task.name);
  const run = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      setFailed(false);
      const { ok } = await fn();
      setFailed(!ok);
      if (ok) {
        pick.clear();
      }
    });
  return (
    <TopBar>
      <h1
        aria-live="polite"
        className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium tabular-nums"
      >
        {count === 0 ? (
          <>
            {tasks("title")}
            <span className="text-muted-foreground">{rows.length}</span>
          </>
        ) : (
          t("selected", { count })
        )}
        {pending && <Spinner className="size-3.5" />}
        {failed && (
          <span
            className="text-destructive truncate text-xs font-normal"
            role="alert"
          >
            {tt("actionFailed")}
          </span>
        )}
      </h1>
      <Button
        className={PRESS}
        onClick={pick.handleAll}
        size="sm"
        variant="ghost"
      >
        <ListChecks />
        <span className="max-sm:sr-only">
          {pick.all ? t("clearSelection") : t("selectAll")}
        </span>
      </Button>
      {count === 0 ? (
        <Button
          className={PRESS}
          nativeButton={false}
          render={<Link href="/tasks/new" />}
          size="sm"
          variant="outline"
        >
          <Plus />
          {tasks("list.new")}
        </Button>
      ) : (
        <>
          <Button
            className={PRESS}
            disabled={none}
            onClick={() => run(() => setTasksEnabledAction(pick.picked, true))}
            size="sm"
            variant="ghost"
          >
            <Play />
            <span className="max-md:sr-only">{t("turnOnMany")}</span>
          </Button>
          <Button
            className={PRESS}
            disabled={none}
            onClick={() => run(() => setTasksEnabledAction(pick.picked, false))}
            size="sm"
            variant="ghost"
          >
            <Pause />
            <span className="max-md:sr-only">{t("turnOffMany")}</span>
          </Button>
          <Button
            className={PRESS}
            disabled={none}
            onClick={() => setConfirming(true)}
            size="sm"
            variant="ghost"
          >
            <Trash2 className="text-destructive" />
            <span className="max-md:sr-only">{t("deleteMany")}</span>
          </Button>
          <Button
            aria-label={t("clearSelection")}
            className={PRESS}
            onClick={pick.handleClear}
            size="icon-sm"
            variant="ghost"
          >
            <X />
          </Button>
        </>
      )}
      <Dialog onOpenChange={setConfirming} open={confirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteManyTitle", { count })}</DialogTitle>
            <DialogDescription>{t("deleteManyText")}</DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {names.slice(0, MAX_NAMED).map((n) => (
              <li key={n}>{n}</li>
            ))}
            {names.length > MAX_NAMED && (
              <li className="text-muted-foreground list-none">
                {t("andMore", { count: names.length - MAX_NAMED })}
              </li>
            )}
          </ul>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>
              {t("cancel")}
            </DialogClose>
            <Button
              onClick={() => {
                setConfirming(false);
                run(() => deleteTasksAction(pick.picked));
              }}
              variant="destructive"
            >
              {t("deleteMany")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TopBar>
  );
};

export const TaskList = ({
  rows,
  servers,
  mailboxes,
}: {
  rows: TaskListRow[];
  servers: ChatServer[];
  /** The owner's mailboxes, for «Войти в почту» in a row that needs it. */
  mailboxes: FixMailbox[];
}) => {
  const t = useTranslations("tasks");
  // The groups as the page came: what a row was when the page opened.
  // oxlint-disable-next-line react/hook-use-state -- decided once, when the page came: no setter to name
  const [groups] = useState(
    () => new Map(rows.map((r) => [r.task.id, groupOf(r)]))
  );
  usePoll(rows.some((r) => r.going));
  // Turned on or off — to its group at once. A result read or a failure fixed stays where it was while the page is open.
  const placed = (r: TaskListRow): Group => {
    const now = groupOf(r);
    const was = groups.get(r.task.id);
    return now === "rest" && (was === "fresh" || was === "action") ? was : now;
  };
  const of = (g: Group) => rows.filter((r) => placed(r) === g);
  const action = of("action");
  const fresh = of("fresh");
  const rest = of("rest");
  const off = of("off");
  // One group alone needs no title.
  const only = [action, fresh, rest].filter((g) => g.length > 0).length === 1;
  const pick = usePick(rows);
  return (
    <Picked value={pick.context}>
      <ListBar pick={pick} rows={rows} />
      <div className="@container min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pt-6 pb-24 md:px-6">
          {action.length > 0 && (
            <Section
              count={action.length}
              title={only ? undefined : t("list.actionGroup")}
            >
              {action.map((r) => (
                <Pickable key={r.task.id} row={r}>
                  <ActionRow mailboxes={mailboxes} row={r} servers={servers} />
                </Pickable>
              ))}
            </Section>
          )}
          {fresh.length > 0 && <FreshSection rows={fresh} servers={servers} />}
          {rest.length > 0 && (
            <Section
              count={rest.length}
              title={only ? undefined : t("list.restGroup")}
            >
              {rest.map((r) => (
                <Pickable key={r.task.id} row={r}>
                  <RestRow row={r} />
                </Pickable>
              ))}
            </Section>
          )}
          {off.length > 0 && (
            <OffSection
              alone={action.length + fresh.length + rest.length === 0}
              rows={off}
            />
          )}
        </div>
      </div>
    </Picked>
  );
};
