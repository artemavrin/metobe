"use client";

import type {
  MemoryCardItem,
  MemoryDue,
  MemoryScheduleDate,
  MemoryScheduleRhythm,
} from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { toast } from "@metobe/ui/components/sonner";
import { cn } from "@metobe/ui/lib/utils";
import {
  BellRing,
  CalendarClock,
  CalendarHeart,
  Check,
  Clock,
  EyeOff,
  Handshake,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { dayKey } from "@/lib/memory-dates";
import { overdueDays, scheduleGroups } from "@/lib/memory-schedule";
import type {
  ReminderRow,
  ScheduleGroup,
  ScheduleItem,
} from "@/lib/memory-schedule";

import { Header } from "./memory-header";
import { ENTER, PRESS } from "./memory-record";
import { PromiseDialog, newDraft, useRepeatWords } from "./promise-dialog";
import { usePromiseEditor } from "./use-promise-editor";

// «Расписание» (D45, P30 «Расписание»): everything that comes by itself, in one list by when — reminders (the person's
// own, and those about a promise, told in its words with «обещание · Ольга Ли»), days that come again and rhythms with
// people. On top what wants the person: reminders sent and not marked, rhythms overdue; then today, tomorrow, this
// week, later. A reminder opens the calendar's dialog; a date has «Уже сделано» (until the next time), a rhythm «Уже
// было» (a contact today) and «Убрать до следующей встречи». At the bottom, the person's own reminders closed after
// sending, with «Не сделано». The data is the calendar's (`/api/memory/due`).

type Editor = ReturnType<typeof usePromiseEditor>;

const GROUP_TITLE = {
  later: "remindersLater",
  overdue: "scheduleOverdue",
  sent: "remindersSent",
  today: "remindersToday",
  tomorrow: "remindersTomorrow",
  week: "remindersWeek",
} as const satisfies Record<ScheduleGroup, string>;

const KIND = {
  date: { icon: CalendarHeart, name: "scheduleKindDate" },
  reminder: { icon: BellRing, name: "scheduleKindReminder" },
  rhythm: { icon: UsersRound, name: "scheduleKindRhythm" },
} as const;

const send = (url: string, method: string, body?: object) =>
  fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
    method,
  });

/** «15:00» for today and tomorrow; «ср, 18 нояб., 12:00» otherwise. */
const useWhen = (timeZone: string) => {
  const locale = useLocale();
  return (at: string, short: boolean) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
      ...(short ? {} : { day: "numeric", month: "short", weekday: "short" }),
    }).format(new Date(at));
};

/** «ср, 18 нояб.» for a day, `2026-11-18`. */
const useDay = () => {
  const locale = useLocale();
  return (day: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      weekday: "short",
    }).format(new Date(`${day}T00:00:00Z`));
};

/** Done at once, with «Вернуть» in a toast; reads the list again either way. */
const useAct = (reread: () => Promise<void>) => {
  const t = useTranslations("memory");
  return async (
    run: () => Promise<Response>,
    done: string,
    undo?: () => Promise<Response>
  ) => {
    const response = await run();
    if (!response.ok) {
      toast.error(t("failed"));
      return;
    }
    await reread();
    toast(done, {
      action: undo
        ? {
            label: t("restore"),
            onClick: async () => {
              await undo();
              await reread();
            },
          }
        : undefined,
    });
  };
};

/** The kind, as a small tile on the left. */
const KindTile = ({ kind }: { kind: ScheduleItem["kind"] }) => {
  const t = useTranslations("memory");
  const { icon: Icon, name } = KIND[kind];
  return (
    <span
      className="text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md border"
      title={t(name)}
    >
      <Icon className="size-3.5" />
    </span>
  );
};

/** The row's frame: the kind, when (a column on a computer, under the text on a phone), the text and its line. */
const Frame = ({
  kind,
  when,
  late,
  text,
  onOpen,
  line,
  actions,
}: {
  kind: ScheduleItem["kind"];
  when: string;
  late?: boolean;
  text: string;
  onOpen?: () => void;
  line: React.ReactNode;
  actions: React.ReactNode;
}) => {
  const whenClass = cn(
    "text-xs tabular-nums",
    late ? "text-warning" : "text-muted-foreground"
  );
  const body = (
    <>
      <span className="line-clamp-2 text-sm">{text}</span>
      <span className="text-muted-foreground flex max-w-full flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <span className={cn(whenClass, "@lg:hidden")}>{when}</span>
        {line}
      </span>
    </>
  );
  return (
    <li
      className={cn(
        "group hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2",
        ENTER
      )}
    >
      <KindTile kind={kind} />
      <span className={cn(whenClass, "hidden w-28 shrink-0 @lg:block")}>
        {when}
      </span>
      {onOpen ? (
        <button
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start"
          onClick={onOpen}
          type="button"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          {body}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-0.5 @lg:opacity-0 @lg:transition-opacity @lg:duration-150 @lg:group-focus-within:opacity-100 @lg:group-hover:opacity-100">
        {actions}
      </div>
    </li>
  );
};

/** «Удалить» a date or a rhythm, with «Вернуть». */
const RemoveItem = ({
  id,
  act,
}: {
  id: string;
  act: ReturnType<typeof useAct>;
}) => {
  const t = useTranslations("memory");
  return (
    <DropdownMenuItem
      className="text-destructive"
      onClick={() =>
        act(
          () => send(`/api/memory/records/${id}`, "DELETE"),
          t("deleted"),
          () => send(`/api/memory/records/${id}/restore`, "POST")
        )
      }
    >
      <Trash2 /> {t("delete")}
    </DropdownMenuItem>
  );
};

const DoneButton = ({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <Button
    aria-label={label}
    className={PRESS}
    disabled={disabled}
    onClick={onClick}
    size="icon-sm"
    title={label}
    variant="ghost"
  >
    <Check />
  </Button>
);

const MoreButton = () => {
  const t = useTranslations("memory");
  return (
    <DropdownMenuTrigger
      render={
        <Button
          aria-label={t("more")}
          className={PRESS}
          size="icon-sm"
          variant="ghost"
        />
      }
    >
      <MoreHorizontal />
    </DropdownMenuTrigger>
  );
};

const ReminderItem = ({
  row,
  short,
  editor,
  timeZone,
}: {
  row: ReminderRow;
  short: boolean;
  editor: Editor;
  timeZone: string;
}) => {
  const t = useTranslations("memory");
  const when = useWhen(timeZone)(row.remindAt, short);
  const words = useRepeatWords();
  return (
    <Frame
      actions={
        <>
          <DoneButton
            disabled={editor.busy}
            label={t(row.repeat ? "remindersDoneOnce" : "done")}
            onClick={() => editor.handleDone(row.id)}
          />
          <DropdownMenu>
            <MoreButton />
            <DropdownMenuContent align="end">
              {/* One that comes again keeps its time of day: moving one time would move them all. */}
              {row.repeat ? null : (
                <>
                  <DropdownMenuItem onClick={() => editor.handleHour(row.id)}>
                    <Clock /> {t("remindersHour")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => editor.handleTomorrow(row.id)}
                  >
                    <CalendarClock /> {t("remindersTomorrowAction")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => editor.edit(row.id)}>
                <Pencil /> {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => editor.handleRemove(row.id)}
              >
                <Trash2 /> {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      kind="reminder"
      line={
        <>
          {row.repeat && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-3" />
              {words(
                row.repeat,
                dayKey(new Date(row.remindAt), timeZone),
                row.repeatDays
              )}
            </span>
          )}
          {row.who && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Handshake className="size-3 shrink-0" />
              <span className="truncate">
                {t("schedulePromise", { name: row.who.name })}
              </span>
            </span>
          )}
        </>
      }
      onOpen={() => editor.edit(row.id)}
      text={row.text}
      when={when}
    />
  );
};

const DateItem = ({
  date,
  act,
}: {
  date: MemoryScheduleDate;
  act: ReturnType<typeof useAct>;
}) => {
  const t = useTranslations("memory");
  const day = useDay();
  const words = useRepeatWords();
  const dismiss = `/api/memory/records/${date.id}/dismiss`;
  return (
    <Frame
      actions={
        <>
          <DoneButton
            label={t("scheduleDateDone")}
            onClick={() =>
              act(
                () => send(dismiss, "POST", { date: date.day }),
                t("scheduleDateDone"),
                () => send(`${dismiss}?date=${date.day}`, "DELETE")
              )
            }
          />
          <DropdownMenu>
            <MoreButton />
            <DropdownMenuContent align="end">
              <RemoveItem act={act} id={date.id} />
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      kind="date"
      line={
        <span className="inline-flex items-center gap-1">
          <Repeat className="size-3" />
          {words(date.repeat, date.day)}
        </span>
      }
      text={date.text}
      when={day(date.day)}
    />
  );
};

const RhythmItem = ({
  rhythm,
  today,
  timeZone,
  act,
}: {
  rhythm: MemoryScheduleRhythm;
  today: string;
  timeZone: string;
  act: ReturnType<typeof useAct>;
}) => {
  const t = useTranslations("memory");
  const forToday = useTranslations("memory.forToday");
  const day = useDay();
  const late = overdueDays(rhythm, today);
  const dismiss = `/api/memory/records/${rhythm.id}/dismiss`;
  const since = rhythm.last
    ? Math.max(
        0,
        Math.round(
          (Date.parse(`${today}T00:00:00Z`) -
            Date.parse(
              `${dayKey(new Date(rhythm.last), timeZone)}T00:00:00Z`
            )) /
            86_400_000
        )
      )
    : null;
  return (
    <Frame
      actions={
        <>
          <DoneButton
            label={t("scheduleRhythmDone")}
            onClick={() => {
              let made: { id: string } | null = null;
              void act(
                async () => {
                  const response = await send(
                    `/api/memory/cards/${rhythm.who.id}/contact`,
                    "POST",
                    { text: forToday("contactText", { name: rhythm.who.name }) }
                  );
                  made = response.ok
                    ? ((await response.clone().json()) as { id: string })
                    : null;
                  return response;
                },
                forToday("savedContact", { name: rhythm.who.name }),
                () => send(`/api/memory/records/${made?.id ?? ""}`, "DELETE")
              );
            }}
          />
          <DropdownMenu>
            <MoreButton />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  act(
                    () =>
                      send(dismiss, "POST", {
                        entityId: rhythm.who.id,
                        since: rhythm.last,
                      }),
                    t("scheduleRhythmAwayDone"),
                    () => send(`${dismiss}?entity=${rhythm.who.id}`, "DELETE")
                  )
                }
              >
                <EyeOff /> {t("scheduleRhythmAway")}
              </DropdownMenuItem>
              <RemoveItem act={act} id={rhythm.id} />
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      kind="rhythm"
      late={late > 0}
      line={
        <span className="flex max-w-full min-w-0 items-center gap-1">
          <Repeat className="size-3 shrink-0" />
          <span className="truncate">{rhythm.text}</span>
          <span className="shrink-0">
            ·{" "}
            {since === null
              ? t("scheduleNever")
              : t("scheduleLast", { days: since })}
          </span>
        </span>
      }
      text={rhythm.who.name}
      when={
        late > 0 ? t("scheduleOverdueDays", { days: late }) : day(rhythm.day)
      }
    />
  );
};

/** The person's own reminders closed after sending: crossed out, with «Не сделано». */
const ClosedBySend = ({
  rows,
  editor,
  timeZone,
}: {
  rows: MemoryDue["closedBySend"];
  editor: Editor;
  timeZone: string;
}) => {
  const t = useTranslations("memory");
  const when = useWhen(timeZone);
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="text-muted-foreground flex flex-col gap-1 border-t pt-3 text-xs">
      <h3 className="font-medium">{t("remindersClosed")}</h3>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li className="flex min-h-8 items-center gap-2" key={r.id}>
            <Check className="size-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate line-through decoration-1">
              {r.text}
            </span>
            <span className="shrink-0 tabular-nums">
              {when(r.remindedAt, false)}
            </span>
            <Button
              className="text-muted-foreground h-7 px-2 text-xs font-normal"
              disabled={editor.busy}
              onClick={() => editor.handleReopen(r.id)}
              size="sm"
              variant="ghost"
            >
              {t("remindersNotDone")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** A new reminder: today (tomorrow, late in the evening) at the next whole hour. */
const freshReminder = (timeZone: string) => {
  const at = new Date(Date.now() + 3_600_000);
  const hour = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(at);
  return newDraft(dayKey(at, timeZone), `${hour}:00`);
};

const keyOf = (item: ScheduleItem) => {
  if (item.kind === "reminder") {
    return item.row.id;
  }
  return item.kind === "date"
    ? `date:${item.date.id}`
    : `rhythm:${item.rhythm.id}:${item.rhythm.who.id}`;
};

export const ScheduleView = ({
  due,
  cards,
  timeZone,
  reread,
  onBack,
}: {
  due: MemoryDue | null;
  cards: MemoryCardItem[];
  timeZone: string;
  reread: () => Promise<void>;
  /** «Назад» on a phone, to the list. */
  onBack?: () => void;
}) => {
  const t = useTranslations("memory");
  const router = useRouter();
  const editor = usePromiseEditor({ due, reread, timeZone });
  const act = useAct(reread);
  const groups = due ? scheduleGroups(due, timeZone) : [];
  const closed = due?.closedBySend ?? [];
  const add = (
    <Button
      aria-label={t("remindersAdd")}
      className={PRESS}
      onClick={() => editor.open(freshReminder(timeZone))}
      size="sm"
      variant="outline"
    >
      <Plus />
      <span className="hidden @md:inline">{t("remindersAdd")}</span>
    </Button>
  );
  return (
    <div className={cn("@container flex flex-col gap-6", ENTER)}>
      <Header
        action={add}
        hint={t("remindersHint")}
        onBack={onBack}
        title={t("reminders")}
      />
      {due && groups.length === 0 && closed.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 py-12 text-center text-sm">
          <CalendarClock className="size-5" />
          <p className="max-w-sm">{t("remindersEmpty")}</p>
        </div>
      ) : (
        groups.map(({ group, items }) => (
          <section className="flex flex-col gap-1" key={group}>
            <h3 className="text-muted-foreground text-xs font-medium">
              {t(GROUP_TITLE[group])}{" "}
              <span className="tabular-nums">{items.length}</span>
            </h3>
            <ul className="flex flex-col">
              {items.map((item) => {
                if (item.kind === "reminder") {
                  return (
                    <ReminderItem
                      editor={editor}
                      key={keyOf(item)}
                      row={item.row}
                      short={group === "today" || group === "tomorrow"}
                      timeZone={timeZone}
                    />
                  );
                }
                return item.kind === "date" ? (
                  <DateItem act={act} date={item.date} key={keyOf(item)} />
                ) : (
                  <RhythmItem
                    act={act}
                    key={keyOf(item)}
                    rhythm={item.rhythm}
                    timeZone={timeZone}
                    today={due?.today ?? item.day}
                  />
                );
              })}
            </ul>
          </section>
        ))
      )}
      <ClosedBySend editor={editor} rows={closed} timeZone={timeZone} />
      <PromiseDialog
        busy={editor.busy}
        cards={cards}
        draft={editor.draft}
        onChange={editor.handleChange}
        onClose={editor.handleClose}
        onDelete={editor.handleRemove}
        onDone={editor.handleDone}
        onOpenCard={(card) => router.push(`/memory?card=${card}`)}
        onSave={editor.handleSave}
      />
    </div>
  );
};
