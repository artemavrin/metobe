"use client";

import type { MemoryCardItem, MemoryDue } from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { cn } from "@metobe/ui/lib/utils";
import {
  Bell,
  BellRing,
  CalendarClock,
  Check,
  Clock,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  UserRound,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { dayKey } from "@/lib/memory-dates";
import { cameAgain, reminderGroups } from "@/lib/memory-reminders";
import type { ReminderGroup, ReminderRow } from "@/lib/memory-reminders";

import { Header } from "./memory-header";
import { ENTER, PRESS } from "./memory-record";
import { PromiseDialog, newDraft, useRepeatWords } from "./promise-dialog";
import { usePromiseEditor } from "./use-promise-editor";

// «Напоминания» (P29 «Раздел»): every reminder in one place, next to «Календарь» in the list. Groups by what is with it
// now — «Пришли, не отмечены» on top, then today, tomorrow, this week, later, and «Повторяются» apart; at the bottom,
// the person's own that closed themselves when they came, with «Не сделано». «Готово» is at hand, the rest in a menu;
// a row opens the same dialog as the calendar. The data is the calendar's (`/api/memory/due`).

type Editor = ReturnType<typeof usePromiseEditor>;

const GROUP_TITLE = {
  later: "remindersLater",
  repeat: "remindersRepeat",
  sent: "remindersSent",
  today: "remindersToday",
  tomorrow: "remindersTomorrow",
  week: "remindersWeek",
} as const satisfies Record<ReminderGroup, string>;

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

const RowMenu = ({ row, editor }: { row: ReminderRow; editor: Editor }) => {
  const t = useTranslations("memory");
  return (
    <DropdownMenu>
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
      <DropdownMenuContent align="end">
        {/* One that comes again keeps its time of day: moving one time would move them all. */}
        {row.repeat ? null : (
          <>
            <DropdownMenuItem onClick={() => editor.handleHour(row.id)}>
              <Clock /> {t("remindersHour")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.handleTomorrow(row.id)}>
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
  );
};

const Row = ({
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
  const came = cameAgain(row);
  return (
    <li
      className={cn(
        "group hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2",
        ENTER
      )}
    >
      <span className="text-muted-foreground hidden w-28 shrink-0 text-xs tabular-nums @lg:block">
        {when}
      </span>
      <button
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start"
        onClick={() => editor.edit(row.id)}
        type="button"
      >
        <span className="line-clamp-2 text-sm">{row.text}</span>
        <span className="text-muted-foreground flex max-w-full flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="tabular-nums @lg:hidden">{when}</span>
          {came && (
            <span className="text-foreground inline-flex items-center gap-1">
              <BellRing className="size-3" /> {t("remindersCame")}
            </span>
          )}
          {row.who && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <UserRound className="size-3 shrink-0" />
              <span className="truncate">{row.who.name}</span>
            </span>
          )}
          {row.repeat && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-3" />
              {words(row.repeat, dayKey(new Date(row.remindAt), timeZone))}
            </span>
          )}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 @lg:opacity-0 @lg:transition-opacity @lg:duration-150 @lg:group-focus-within:opacity-100 @lg:group-hover:opacity-100">
        <Button
          aria-label={t(row.repeat ? "remindersDoneOnce" : "done")}
          className={PRESS}
          disabled={editor.busy}
          onClick={() => editor.handleDone(row.id)}
          size="icon-sm"
          title={t(row.repeat ? "remindersDoneOnce" : "done")}
          variant="ghost"
        >
          <Check />
        </Button>
        <RowMenu editor={editor} row={row} />
      </div>
    </li>
  );
};

/** The person's own that closed themselves when they came: crossed out, with «Не сделано». */
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

export const RemindersView = ({
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
  const groups = due ? reminderGroups(due, new Date(), timeZone) : [];
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
          <Bell className="size-5" />
          <p className="max-w-sm">{t("remindersEmpty")}</p>
        </div>
      ) : (
        groups.map(({ group, rows }) => (
          <section className="flex flex-col gap-1" key={group}>
            <h3 className="text-muted-foreground text-xs font-medium">
              {t(GROUP_TITLE[group])}{" "}
              <span className="tabular-nums">{rows.length}</span>
            </h3>
            <ul className="flex flex-col">
              {rows.map((row) => (
                <Row
                  editor={editor}
                  key={row.id}
                  row={row}
                  short={group === "today" || group === "tomorrow"}
                  timeZone={timeZone}
                />
              ))}
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
