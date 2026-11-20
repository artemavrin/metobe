"use client";

import type { AskUserOutput } from "@metobe/contracts/chat";
import type { FilePreview } from "@metobe/contracts/files";
import { Button } from "@metobe/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@metobe/ui/components/input-group";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@metobe/ui/components/message-scroller";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import {
  ArrowUp,
  BellRing,
  BookUser,
  CalendarClock,
  CalendarHeart,
  Check,
  ChevronRight,
  Copy,
  Mail,
  Plus,
  RotateCcw,
  SquareTerminal,
  UsersRound,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { CodeBlocks } from "@/components/chat/activity";
import { AskedAnswer, AskPanel } from "@/components/chat/ask-user";
import { ChatHeader } from "@/components/chat/chat-header";
import type { ChatItem, ChatOps } from "@/components/chat/chat-item";
import { CompactionCard, CompactOffer } from "@/components/chat/compaction";
import { PreviewMark, PreviewPanel } from "@/components/chat/composer-privacy";
import {
  FileBody,
  FileGlyph,
  MadeFileCard,
} from "@/components/chat/file-viewer";
import type { PreviewLoader, ViewedFile } from "@/components/chat/file-viewer";
import { LensMark, Seen, useLens } from "@/components/chat/model-lens";
import { NightSky } from "@/components/chat/night-sky";
import { ThreadMap } from "@/components/chat/thread-map";
import { TaskDot } from "@/components/tasks/task-dot";
import type { CodePart } from "@/lib/answer-work";
import type { AskUserPart, OpenAskPart } from "@/lib/ask-user";
import { splitLabels } from "@/lib/model-view";

// The product itself on the tour's stage (docs/RELEASE.md, «Демо, а не скриншоты»): the chat's header and
// «Поделиться», the model's question panel, the thread's map in a real scroller, the new chat's sky — at their real
// size, in the reader's language, with neutral examples. What would reach the server (sharing) is a copy of the
// dialog's body with the same parts and words, kept on the page. `data-demo` marks what the cursor points at.

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/** Keys typed into a demo stay in it: ←/→ must not turn the tour's page, Esc must not close the window. */
const Contained = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn("relative h-full", className)}
    onKeyDown={(e) => e.stopPropagation()}
    role="presentation"
  >
    {children}
  </div>
);

/** «Ещё раз»: the demo back to its start. */
const Again = ({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) => {
  const t = useTranslations("whatsNew");
  return (
    <Button
      className={cn(
        "text-muted-foreground absolute bottom-3 left-3 z-10",
        className
      )}
      onClick={onClick}
      size="xs"
      variant="ghost"
    >
      <RotateCcw /> {t("again")}
    </Button>
  );
};

// ——— Share ———

/** The header's pin and delete do nothing in a demo. */
const nothing = () => null;

const opsOf = (
  share: () => void,
  rename: (title: string) => void
): ChatOps => ({
  pin: nothing,
  remove: nothing,
  rename: (_, title) => rename(title),
  share,
});

const SharePanel = ({
  shared,
  onShared,
}: {
  shared: boolean;
  onShared: (shared: boolean) => void;
}) => {
  const t = useTranslations("chat.share");
  const [copied, setCopied] = useState(false);
  // This install's own address: the link the reader's colleagues would get.
  const link = `${window.location.origin}/chat/5f0c8a…e21a`;
  return (
    <div
      className={cn(
        "bg-popover ring-foreground/10 animate-in fade-in zoom-in-[0.97] motion-reduce:zoom-in-100 absolute inset-x-6 top-4 flex flex-col gap-4 rounded-xl p-4 shadow-lg ring-1 duration-200",
        EASE
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="font-medium">{t("title")}</span>
        <span className="text-muted-foreground line-clamp-2 text-sm">
          {t("text")}
        </span>
      </div>
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <label
          className="flex min-w-0 flex-1 flex-col"
          htmlFor="whats-new-share"
        >
          <span className="text-sm font-medium">{t("toggle")}</span>
          <span className="text-muted-foreground text-xs">
            {shared ? t("on") : t("off")}
          </span>
        </label>
        <Switch
          checked={shared}
          data-demo="share-switch"
          id="whats-new-share"
          onCheckedChange={onShared}
        />
      </div>
      {shared && (
        <InputGroup
          className={cn(
            "animate-in fade-in slide-in-from-top-1 duration-200",
            EASE
          )}
        >
          <InputGroupInput aria-label={t("link")} readOnly value={link} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              data-demo="share-copy"
              onClick={() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              size="xs"
            >
              {copied ? <Check /> : <Copy />}
              {copied ? t("copied") : t("copy")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}
    </div>
  );
};

const ShareDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const [chat, setChat] = useState<ChatItem>({
    group: "today",
    id: "whats-new-share",
    shared: false,
    title: t("chatTitle"),
  });
  const [open, setOpen] = useState(false);
  return (
    <Contained className="bg-background flex flex-col">
      <header
        className="flex h-12 shrink-0 items-center gap-2 border-b px-3 pr-12"
        data-demo="share-header"
      >
        <ChatHeader
          chat={chat}
          ops={opsOf(
            () => setOpen(true),
            (title) => setChat((c) => ({ ...c, title }))
          )}
        />
      </header>
      <div className="relative flex-1 overflow-hidden px-6 pt-5">
        {/* The chat under the header, faint: the share card is what to look at. */}
        <div aria-hidden className="flex flex-col gap-3 opacity-40">
          <div className="bg-muted ml-auto w-fit rounded-2xl px-4 py-2 text-sm">
            {t("question")}
          </div>
          <p className="text-sm">{t("answer")}</p>
        </div>
        {open && (
          <SharePanel
            onShared={(shared) => setChat((c) => ({ ...c, shared }))}
            shared={Boolean(chat.shared)}
          />
        )}
      </div>
      {(open || chat.shared) && (
        <Again
          onClick={() => {
            setOpen(false);
            setChat((c) => ({ ...c, shared: false }));
          }}
        />
      )}
    </Contained>
  );
};

// ——— The model asks ———

const AskDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const [output, setOutput] = useState<AskUserOutput | null>(null);
  const [round, setRound] = useState(0);
  const part = useMemo(
    () =>
      ({
        input: {
          questions: [
            {
              header: t("periodHeader"),
              options: t.raw("options") as {
                label: string;
                description: string;
              }[],
              question: t("period"),
            },
          ],
        },
        state: "input-available",
        toolCallId: "whats-new-ask",
        type: "tool-ask_user",
      }) as OpenAskPart,
    [t]
  );
  const said = output?.answers[t("period")]?.[0];
  return (
    <Contained
      className={cn(
        "bg-background flex flex-col gap-4 px-6 pt-12 pb-5",
        output ? "justify-end" : "justify-center"
      )}
    >
      {/* While it asks, the panel needs the room: the thread around it shows once it is answered. */}
      {output ? (
        <>
          <div className="bg-muted ml-auto w-fit rounded-2xl px-4 py-2 text-sm">
            {t("report")}
          </div>
          <p className="text-sm">{t("lead")}</p>
          <AskedAnswer
            part={{ ...part, output, state: "output-available" } as AskUserPart}
          />
          <p className="text-muted-foreground animate-in fade-in fill-mode-backwards text-sm delay-300 duration-300">
            <span className="animate-pulse motion-reduce:animate-none">
              {said ? t("working", { answer: said }) : t("workingSkipped")}
            </span>
          </p>
          <Again
            className="top-3 bottom-auto"
            onClick={() => {
              setOutput(null);
              setRound((r) => r + 1);
            }}
          />
        </>
      ) : (
        <AskPanel key={round} onAnswer={setOutput} part={part} />
      )}
    </Contained>
  );
};

// ——— The thread's map ———

const MapDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const thread = t.raw("thread") as [string, string][];
  const items = thread.map(([question, answer], i) => ({
    answer,
    answerId: `a${i}`,
    id: `q${i}`,
    question,
  }));
  return (
    <Contained className="bg-background">
      <MessageScrollerProvider defaultScrollPosition="last-anchor">
        <MessageScroller>
          <MessageScrollerViewport aria-label={t("threadLabel")}>
            <MessageScrollerContent className="mx-auto w-full max-w-[420px] px-2 py-6 text-sm">
              {thread.flatMap(([q, a], i) => [
                <MessageScrollerItem
                  key={`q${q}`}
                  messageId={`q${i}`}
                  scrollAnchor
                >
                  <div className="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl px-4 py-2">
                    {q}
                  </div>
                </MessageScrollerItem>,
                <MessageScrollerItem key={`a${q}`} messageId={`a${i}`}>
                  <p className="leading-relaxed">{a}</p>
                  <div aria-hidden className="mt-3 flex flex-col gap-2">
                    <span className="bg-muted h-2 w-11/12 rounded-full" />
                    <span className="bg-muted h-2 w-4/5 rounded-full" />
                    <span className="bg-muted h-2 w-2/3 rounded-full" />
                  </div>
                </MessageScrollerItem>,
              ])}
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
        <ThreadMap column={420} items={items} />
      </MessageScrollerProvider>
    </Contained>
  );
};

// ——— Compact a long chat ———

/** The end of a long chat, the offer under its last answer, and — a click on «Сжать чат» — the summary in its place. */
const CompactDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const thread = (t.raw("thread") as [string, string][]).slice(-2);
  const [stage, setStage] = useState<"offer" | "writing" | "done">("offer");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compact = () => {
    setStage("writing");
    // The service model at work, played: the summary comes after a breath.
    timer.current = setTimeout(() => setStage("done"), 1400);
  };
  return (
    <Contained className="bg-background">
      <div className="flex h-full flex-col justify-end gap-4 overflow-hidden px-6 pb-14">
        <div aria-hidden className="flex flex-col gap-3 opacity-40">
          {thread.map(([q, a]) => (
            <div className="flex flex-col gap-3" key={q}>
              <div className="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl px-4 py-2 text-sm">
                {q}
              </div>
              <p className="text-sm">{a}</p>
            </div>
          ))}
        </div>
        <div data-demo="compact-offer">
          {stage === "done" ? (
            <CompactionCard
              data={{
                messages: t.raw("compact.messages") as number,
                summary: t("compact.summary"),
              }}
            />
          ) : (
            <CompactOffer
              onCompact={compact}
              onLater={() => setStage("done")}
              stepTokens={180_000}
              writing={stage === "writing"}
            />
          )}
        </div>
      </div>
      {stage !== "offer" && (
        <Again
          onClick={() => {
            if (timer.current) {
              clearTimeout(timer.current);
            }
            setStage("offer");
          }}
        />
      )}
    </Contained>
  );
};

// ——— Tasks ———

/** The sidebar's «Задачи» with a task that has a new result, ringing; a click opens the result and the ringing stops. */
const TasksDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const tasks = useTranslations("tasks");
  const [open, setOpen] = useState(false);
  return (
    <Contained className="bg-background flex">
      <aside className="bg-sidebar flex w-40 shrink-0 flex-col gap-1 border-r p-3 pt-12 text-sm sm:w-52">
        <span className="flex items-center gap-2 px-2 py-1.5 font-medium">
          <CalendarClock className="size-4" /> {tasks("nav")}
        </span>
        <button
          className={cn(
            "hover:bg-sidebar-accent ml-4 flex items-center gap-2 rounded-md border-l-0 px-2 py-1.5 text-left transition-colors duration-150",
            open && "bg-sidebar-accent"
          )}
          data-demo="task-row"
          onClick={() => setOpen(true)}
          type="button"
        >
          <TaskDot color="var(--chart-1)" ringing={!open} />
          <span className="min-w-0 flex-1 truncate">{t("tasks.name")}</span>
          {!open && <span className="sr-only">, {tasks("waiting")}</span>}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-6 pt-12 pb-5">
        {open ? (
          <div
            className={cn(
              "animate-in fade-in slide-in-from-bottom-1 flex flex-col gap-3 duration-200",
              EASE
            )}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{t("tasks.name")}</span>
              <span className="text-muted-foreground text-xs">
                {t("tasks.schedule")}
              </span>
            </div>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-medium">{tasks("latestTitle")}</span>
              <span className="text-muted-foreground text-xs">
                {tasks("todayAt", { time: "9:00" })}
              </span>
            </div>
            <p className="text-sm leading-relaxed">{t("tasks.result")}</p>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">{t("tasks.hint")}</p>
            <div aria-hidden className="flex flex-col gap-2 opacity-60">
              <span className="bg-muted h-2 w-11/12 rounded-full" />
              <span className="bg-muted h-2 w-4/5 rounded-full" />
              <span className="bg-muted h-2 w-2/3 rounded-full" />
            </div>
          </>
        )}
      </div>
      {open && <Again onClick={() => setOpen(false)} />}
    </Contained>
  );
};

// ——— A new chat ———

const greetingOf = (hour: number) => {
  if (hour < 5 || hour >= 23) {
    return "night";
  }
  if (hour < 12) {
    return "morning";
  }
  return hour < 18 ? "day" : "evening";
};

const GreetingDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const composer = useRef<HTMLDivElement>(null);
  // The reader's own hour and day; nothing of anyone's data.
  const now = new Date();
  const today = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(now);
  return (
    <Contained className="bg-background flex flex-col items-center justify-end overflow-hidden px-8 pb-6">
      <NightSky composer={composer} />
      <div className="relative mb-auto flex flex-col items-center pt-14 text-center">
        <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.22em] uppercase">
          {today}
        </p>
        <p className="text-3xl font-semibold tracking-tight">
          {t(`greetings.${greetingOf(now.getHours())}`)}
        </p>
        <p className="text-muted-foreground mt-2 text-sm">{t("line")}</p>
      </div>
      <div
        className="bg-background relative flex w-full items-center gap-1 rounded-3xl border p-1.5 shadow-xs"
        ref={composer}
      >
        <span className="text-muted-foreground grid size-8 place-items-center">
          <Plus className="size-4" />
        </span>
        <span className="text-muted-foreground flex-1 px-1 text-sm">
          {t("placeholder")}
        </span>
        <span className="bg-primary/60 text-primary-foreground grid size-8 place-items-center rounded-full">
          <ArrowUp className="size-4" />
        </span>
      </div>
    </Contained>
  );
};

// ——— Memory (0.9.0) ———

/** A message, the answer, and under it what was kept — «Отменить» takes it back. */
const MemoryDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const [undone, setUndone] = useState(false);
  return (
    <Contained className="bg-background flex flex-col justify-end gap-3 px-6 pt-12 pb-14">
      <div className="bg-muted ml-auto max-w-[80%] rounded-2xl px-4 py-2.5 text-sm">
        {t("memory.message")}
      </div>
      <p className="text-sm leading-relaxed">{t("memory.reply")}</p>
      <div
        className={cn(
          "text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs transition-opacity duration-200",
          undone && "opacity-50"
        )}
      >
        <BookUser className="size-3.5" />
        <span className="font-medium">
          {undone ? t("memory.undone") : t("memory.kept")}
        </span>
        <span
          className={cn(
            "bg-muted rounded-md px-2 py-0.5",
            undone && "line-through"
          )}
        >
          {t("memory.record")}
        </span>
        {!undone && (
          <Button
            className="h-6 px-2 text-xs"
            data-demo="memory-undo"
            onClick={() => setUndone(true)}
            size="xs"
            variant="ghost"
          >
            {t("memory.undo")}
          </Button>
        )}
      </div>
      {undone && <Again onClick={() => setUndone(false)} />}
    </Contained>
  );
};

/** «Не упустить» over the new chat's input: a click on a line puts a ready request into it. */
const ForTodayDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const forToday = useTranslations("memory.forToday");
  const [asked, setAsked] = useState(false);
  const rows = [
    {
      demo: "today-late",
      text: `${t("forToday.lateWho")} · ${t("forToday.late")}`,
      warn: true,
      why: t("forToday.lateWhy"),
    },
    { text: t("forToday.today"), why: t("forToday.todayWhy") },
    { text: t("forToday.rhythm"), why: t("forToday.rhythmWhy") },
  ];
  return (
    <Contained className="bg-background flex flex-col justify-end gap-3 px-6 pt-12 pb-6">
      <div className="flex flex-col gap-0.5">
        <span className="text-muted-foreground px-2 text-xs font-medium">
          {forToday("title")}
        </span>
        {rows.map((r) => (
          <button
            className="hover:bg-muted/60 flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150"
            data-demo={r.demo}
            key={r.text}
            onClick={() => setAsked(true)}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">{r.text}</span>
            <span
              className={cn(
                "shrink-0 text-xs",
                r.warn ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {r.why}
            </span>
          </button>
        ))}
      </div>
      <div className="bg-background flex min-h-11 items-center gap-1 rounded-3xl border p-1.5 shadow-xs">
        <span className="text-muted-foreground grid size-8 place-items-center">
          <Plus className="size-4" />
        </span>
        <span
          className={cn(
            "flex-1 px-1 text-sm",
            !asked && "text-muted-foreground"
          )}
        >
          {asked ? t("forToday.ask") : null}
        </span>
        <span className="bg-primary/60 text-primary-foreground grid size-8 shrink-0 place-items-center rounded-full">
          <ArrowUp className="size-4" />
        </span>
      </div>
      {asked && (
        <Again className="top-3 bottom-auto" onClick={() => setAsked(false)} />
      )}
    </Contained>
  );
};

/** A week of deadlines; a click on a promise moves it a day on, as dragging it does. */
const CalendarDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const [moved, setMoved] = useState(false);
  // The reader's own week, Monday to Friday, in their language.
  const days = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return Array.from({ length: 5 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        weekday: "short",
      }).format(day);
    });
  }, []);
  const chip =
    "rounded-md border bg-background px-2 py-1 text-left text-xs shadow-xs";
  return (
    <Contained className="bg-background flex flex-col gap-3 px-6 pt-12 pb-14">
      <div className="grid flex-1 grid-cols-5 overflow-hidden rounded-lg border">
        {days.map((d, i) => (
          <div
            className={cn("flex flex-col gap-1.5 p-1.5", i > 0 && "border-l")}
            key={d}
          >
            <span className="text-muted-foreground text-[11px]">{d}</span>
            {i === 1 && <span className={chip}>{t("calendar.contract")}</span>}
            {i === (moved ? 3 : 2) && (
              <button
                className={cn(
                  chip,
                  "wn-chip hover:bg-muted transition-colors duration-150"
                )}
                data-demo="calendar-chip"
                key={moved ? "moved" : "here"}
                onClick={() => setMoved(true)}
                type="button"
              >
                {t("calendar.report")}
              </button>
            )}
          </div>
        ))}
      </div>
      {moved && (
        <>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Check className="size-3.5" /> {t("calendar.moved")}
          </p>
          <Again onClick={() => setMoved(false)} />
        </>
      )}
    </Contained>
  );
};

/** A line of the schedule demo: the kind's tile, the text and its line, when, and an action. */
const scheduleRow = (
  icon: ReactNode,
  text: string,
  line: string,
  when: string,
  action?: ReactNode
) => (
  <li className="flex items-center gap-3 py-1.5">
    <span className="text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md border">
      {icon}
    </span>
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm">{text}</span>
      <span className="text-muted-foreground text-xs">{line}</span>
    </div>
    <span className="text-muted-foreground shrink-0 text-xs">{when}</span>
    {action}
  </li>
);

const scheduleGroup = (title: string, children: ReactNode) => (
  <section className="flex flex-col">
    <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
    <ul>{children}</ul>
  </section>
);

/** «Расписание»: a rhythm overdue, a reminder today, a birthday; «Уже было» sends the rhythm on. */
const ScheduleDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const memory = useTranslations("memory");
  const [met, setMet] = useState(false);
  const rhythm = scheduleRow(
    <UsersRound className="size-3.5" />,
    t("schedule.rhythm"),
    met ? memory("scheduleLast", { days: 0 }) : t("schedule.rhythmLine"),
    met ? "" : memory("scheduleOverdueDays", { days: 4 }),
    met ? null : (
      <Button
        aria-label={memory("scheduleRhythmDone")}
        data-demo="schedule-met"
        onClick={() => setMet(true)}
        size="icon-sm"
        title={memory("scheduleRhythmDone")}
        variant="ghost"
      >
        <Check />
      </Button>
    )
  );
  return (
    <Contained className="bg-background flex flex-col gap-4 px-6 pt-12 pb-14">
      {!met && scheduleGroup(memory("scheduleOverdue"), rhythm)}
      {scheduleGroup(
        memory("remindersToday"),
        scheduleRow(
          <BellRing className="size-3.5" />,
          t("schedule.bank"),
          "",
          "15:00"
        )
      )}
      {scheduleGroup(
        memory("remindersWeek"),
        scheduleRow(
          <CalendarHeart className="size-3.5" />,
          t("schedule.birthday"),
          t("schedule.birthdayLine"),
          ""
        )
      )}
      {met && scheduleGroup(memory("remindersLater"), rhythm)}
      {met && <Again onClick={() => setMet(false)} />}
    </Contained>
  );
};

/** The bot in Telegram: a reminder with its buttons, and a request written to it as to the chat. */
const TelegramDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const reminder = useTranslations("reminder");
  const [snoozed, setSnoozed] = useState(false);
  const bubble = "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm";
  return (
    <Contained className="bg-muted/40 flex flex-col justify-end gap-2 px-6 pt-12 pb-14">
      <div
        className={cn(bubble, "bg-background flex flex-col gap-1 shadow-xs")}
      >
        <span className="text-primary text-xs font-medium">
          {t("telegram.bot")}
        </span>
        <span className="font-medium">{reminder("title")}</span>
        <span>{t("telegram.text")}</span>
      </div>
      <div className="flex max-w-[80%] gap-1">
        {[reminder("done"), reminder("snooze"), reminder("tomorrow")].map(
          (label, i) => (
            <button
              className="bg-background/80 hover:bg-background flex-1 rounded-lg px-2 py-1.5 text-xs shadow-xs transition-colors duration-150"
              data-demo={i === 1 ? "telegram-snooze" : undefined}
              key={label}
              onClick={() => setSnoozed(true)}
              type="button"
            >
              {label}
            </button>
          )
        )}
      </div>
      {snoozed && (
        <div className={cn(bubble, "bg-background wn-chip shadow-xs")}>
          {t("telegram.snoozed")}
        </div>
      )}
      <div className={cn(bubble, "bg-primary text-primary-foreground ml-auto")}>
        {t("telegram.asked")}
      </div>
      <div className={cn(bubble, "bg-background shadow-xs")}>
        {t("telegram.answer")}
      </div>
      {snoozed && <Again onClick={() => setSnoozed(false)} />}
    </Contained>
  );
};

/** A letter with no answer in «Не упустить»; «Напомнить» opens a ready letter. */
const MailWaitsDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const forToday = useTranslations("memory.forToday");
  const remind = useTranslations("memory.remind");
  const [open, setOpen] = useState(false);
  return (
    <Contained className="bg-background flex flex-col gap-3 px-6 pt-12 pb-14">
      <span className="text-muted-foreground px-2 text-xs font-medium">
        {forToday("title")}
      </span>
      <div className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm">
        <Mail className="text-muted-foreground size-4 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">
            {forToday("mailLabel", { subject: t("mailWaits.subject") })}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {t("mailWaits.why")}
          </span>
        </span>
        <Button
          data-demo="mail-remind"
          onClick={() => setOpen(true)}
          size="xs"
          variant="outline"
        >
          {remind("action")}
        </Button>
      </div>
      {open && (
        <div className="wn-chip flex flex-col gap-3 rounded-xl border p-4 shadow-xs">
          <p className="text-sm leading-relaxed">{t("mailWaits.letter")}</p>
          <Button className="self-end" size="sm">
            {t("mailWaits.send")}
          </Button>
        </div>
      )}
      {open && <Again onClick={() => setOpen(false)} />}
    </Contained>
  );
};

/** A change's demo by its id in the release notes; a change without one has no page of its own. */
// ——— Data protection (0.10.0) ———

/**
 * One draft with a name, an address and a phone, and the labels the model gets for them — the label of a name is
 * the language's own (a Russian one is declined), so the masked text is in the messages too.
 */
const usePrivacyDraft = () => {
  const t = useTranslations("whatsNew.demo");
  return {
    labels: [
      {
        label: t("privacy.personLabel"),
        type: "PERSON",
        value: t("privacy.person"),
      },
      { label: "[[EMAIL_e1f2a3]]", type: "EMAIL", value: t("privacy.email") },
      { label: "[[PHONE_a91c02]]", type: "PHONE", value: t("privacy.phone") },
    ],
    masked: t("privacy.masked"),
    message: t("privacy.message"),
    reply: t("privacy.reply"),
  };
};

/** The person's message with its shield: pressed, the text turns into what the model got, labels for the values. */
const ModelSawDemo = () => {
  const lensText = useTranslations("chat.lens");
  const draft = usePrivacyDraft();
  const lens = useLens();
  return (
    <Contained className="bg-background flex flex-col justify-end gap-3 px-6 pt-12 pb-14">
      <div className="flex flex-col items-end gap-1">
        <div className="bg-muted max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6">
          <span className={lens.swap} key={String(lens.on)}>
            {lens.on ? (
              <Seen pieces={splitLabels(draft.masked, draft.labels)} />
            ) : (
              draft.message
            )}
          </span>
        </div>
        <span data-demo="privacy-shield">
          <LensMark
            count={draft.labels.length}
            hover=""
            label={lensText("asked")}
            on={lens.on}
            onToggle={lens.handleToggle}
          />
        </span>
      </div>
      <p className="text-sm leading-relaxed">{draft.reply}</p>
      {lens.on && <Again onClick={() => lens.set(false)} />}
    </Contained>
  );
};

/** The draft in the input, the shield counting what it hides: pressed, the draft as the model would get it opens above. */
const DraftCheckDemo = () => {
  const draft = usePrivacyDraft();
  const [open, setOpen] = useState(false);
  const preview = {
    labels: draft.labels,
    state: "masked" as const,
    text: draft.masked,
  };
  return (
    <Contained className="bg-background flex flex-col justify-end px-6 pt-12 pb-6">
      <div className="bg-background flex flex-col rounded-3xl border p-1.5 shadow-xs">
        <PreviewPanel
          files={[]}
          onClose={() => setOpen(false)}
          open={open}
          preview={preview}
        />
        <p className="px-2.5 pt-1.5 pb-2 text-sm leading-6">{draft.message}</p>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground grid size-8 place-items-center">
            <Plus className="size-4" />
          </span>
          <span className="flex-1" />
          <span data-demo="privacy-draft">
            <PreviewMark
              compact={false}
              onToggle={() => setOpen((was) => !was)}
              open={open}
              preview={preview}
            />
          </span>
          <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-full">
            <ArrowUp className="size-4" />
          </span>
        </div>
      </div>
      {open && (
        <Again className="top-3 bottom-auto" onClick={() => setOpen(false)} />
      )}
    </Contained>
  );
};

// ——— Code and files (D47) ———

const FILE_SHEET = "00000000-0000-4000-8000-0000000000a1";

/** The demo's files: names in the reader's language, the sizes made up. */
const useDemoFiles = () => {
  const t = useTranslations("whatsNew.demo");
  return {
    doc: {
      id: "00000000-0000-4000-8000-0000000000a2",
      kind: "doc" as const,
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      name: t("files.doc"),
      size: 24_120,
    },
    note: {
      id: "00000000-0000-4000-8000-0000000000a3",
      kind: "text" as const,
      mediaType: "text/markdown",
      name: t("files.note"),
      size: 1840,
    },
    sheet: {
      id: FILE_SHEET,
      kind: "sheet" as const,
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: t("files.sheet"),
      size: 18_432,
    },
  };
};

const REVENUE = [120_000, 137_500, 155_000, 172_500, 190_000, 207_500];
const ORDERS = [310, 332, 354, 376, 398, 420];

/** The sheet the panel shows: six months by the reader's locale, its columns in their language. */
const useSheetLoader = (): PreviewLoader => {
  const t = useTranslations("whatsNew.demo");
  const locale = useLocale();
  return useMemo(() => {
    const month = new Intl.DateTimeFormat(locale, { month: "long" });
    const rows = REVENUE.map((sum, i) => {
      const name = month.format(new Date(2026, i, 1));
      return [
        name.charAt(0).toLocaleUpperCase(locale) + name.slice(1),
        String(sum),
        String(ORDERS[i]),
        String(Math.round(sum / (ORDERS[i] ?? 1))),
      ];
    });
    const preview: FilePreview = {
      cut: false,
      sheets: [
        {
          name: t("files.sheetName"),
          rows: [
            [
              t("files.month"),
              t("files.revenue"),
              t("files.orders"),
              t("files.average"),
            ],
            ...rows,
          ],
        },
      ],
      type: "sheet",
    };
    return () => Promise.resolve(preview);
  }, [locale, t]);
};

/** An answer that ran code: «Выполнил код» opens the code and what it printed; the files it made stand under. */
const CodeFilesDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const say = useTranslations("chat.code");
  const files = useDemoFiles();
  const [open, setOpen] = useState(false);
  const part = {
    input: {
      code: `df = pd.read_excel("/workspace/in/${t("files.source")}")\nby_month = df.groupby("${t("files.month")}")["${t("files.revenue")}"].sum()\nby_month.to_excel("${files.sheet.name}")\nprint(by_month.tail(3))`,
    },
    output: { exitCode: 0, stdout: t("files.printed") },
    state: "output-available",
    toolCallId: "demo",
    type: "tool-run_code",
  } as unknown as CodePart;
  return (
    <Contained className="bg-background flex flex-col justify-end gap-3 overflow-hidden px-6 pt-10 pb-14">
      <div className="flex flex-col gap-2 text-sm">
        <button
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-2"
          data-demo="code-step"
          onClick={() => setOpen((was) => !was)}
          type="button"
        >
          <SquareTerminal className="size-3.5" />
          {say("done")}
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform duration-200",
              EASE,
              open && "rotate-90"
            )}
          />
        </button>
        {open && (
          <div className="pl-5">
            <CodeBlocks part={part} />
          </div>
        )}
      </div>
      {/* The stage is low: with the code open, the words give it their room. */}
      {!open && <p className="text-sm leading-relaxed">{t("files.answer")}</p>}
      <MadeFileCard file={files.sheet} onOpen={nothing} />
      {open && <Again onClick={() => setOpen(false)} />}
    </Contained>
  );
};

/** The cards of an answer; pressed, the file opens in the panel to the right, the talk stays in view. */
const FilePanelDemo = () => {
  const view = useTranslations("chat.viewer");
  const t = useTranslations("whatsNew.demo");
  const files = useDemoFiles();
  const load = useSheetLoader();
  const [shown, setShown] = useState<ViewedFile | null>(null);
  return (
    // Below the window's own ×: the panel's × must not stand on it.
    <Contained className="bg-background flex gap-2 overflow-hidden p-2 pt-12">
      <div className="flex min-w-0 flex-1 flex-col justify-end gap-3 px-4 pt-8 pb-12">
        {/* The narrow column would cut the words at the top: with the panel open, the cards are the answer. */}
        {!shown && (
          <p className="text-sm leading-relaxed">{t("files.answer")}</p>
        )}
        <div className="flex flex-col gap-2" data-demo="file-card">
          {[files.sheet, files.doc, files.note].map((file) => (
            <MadeFileCard
              active={shown?.id === file.id}
              file={file}
              key={file.id}
              onOpen={() => setShown(file)}
            />
          ))}
        </div>
      </div>
      {shown && (
        <aside
          aria-label={view("panel")}
          className="bg-background animate-in fade-in slide-in-from-right-4 flex w-[58%] shrink-0 flex-col overflow-hidden rounded-lg border duration-200 motion-reduce:animate-none"
        >
          <div className="flex h-11 shrink-0 items-center gap-1 border-b pr-1.5">
            <span className="flex size-11 shrink-0 items-center justify-center [&_svg]:size-5">
              <FileGlyph file={shown} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {shown.name}
            </span>
            <Button
              aria-label={view("close")}
              className="text-muted-foreground rounded-full"
              onClick={() => setShown(null)}
              size="icon-sm"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
          <div className="min-h-0 flex-1 p-3">
            <FileBody file={shown} key={shown.id} load={load} />
          </div>
        </aside>
      )}
      {shown && <Again onClick={() => setShown(null)} />}
    </Contained>
  );
};

export const DEMOS: Record<string, () => ReactNode> = {
  askUser: AskDemo,
  calendar: CalendarDemo,
  codeFiles: CodeFilesDemo,
  compactChat: CompactDemo,
  draftCheck: DraftCheckDemo,
  filePanel: FilePanelDemo,
  forToday: ForTodayDemo,
  greeting: GreetingDemo,
  mailWaits: MailWaitsDemo,
  memory: MemoryDemo,
  modelSaw: ModelSawDemo,
  schedule: ScheduleDemo,
  shareChat: ShareDemo,
  tasks: TasksDemo,
  telegram: TelegramDemo,
  threadMap: MapDemo,
};
