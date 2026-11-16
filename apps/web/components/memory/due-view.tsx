"use client";

import type { MemoryCardItem, MemoryDue } from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import { EventCalendar } from "@metobe/ui/components/reui/event-calendar/event-calendar";
import type { EventCalendarRenderEventProps } from "@metobe/ui/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@metobe/ui/components/reui/event-calendar/event-calendar-content";
import {
  EventCalendarNav,
  EventCalendarToolbar,
} from "@metobe/ui/components/reui/event-calendar/event-calendar-nav";
import type {
  EventCalendarProposedUpdate,
  CalendarEvent,
} from "@metobe/ui/components/reui/event-calendar/event-calendar-types";
import { toast } from "@metobe/ui/components/sonner";
import type { Locale } from "date-fns";
import { format, isSameMonth, subMilliseconds } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import { Bell, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";

import { dayKey, localMidnightOf } from "@/lib/memory-dates";
import { isLate } from "@/lib/memory-late";

import { PromiseDialog, newDraft } from "./promise-dialog";
import { usePromiseEditor } from "./use-promise-editor";

// «Календарь» (Д6, P27 — ReUI's Event Calendar): every open commitment with a deadline stands on its day, a whole-day
// bar; the ones past their day are red. One with a reminder still to go off stands at the reminder's time instead, with
// a bell — the week is a time grid for these. Dragging a bar to another day moves its deadline, dragging a reminder
// moves the time it goes off (`PATCH` the record, with «Вернуть»). A click on a bar opens the promise in a dialog, a
// click on an empty day or hour starts a new one there (`PromiseDialog`: add, change, done, delete). On a phone the
// agenda — a list by day — comes first.
// The rows are the page's own state (`MemoryView`), shared with the list's «просрочено»: the bars are drawn from them,
// a move changes them first and is saved after, and what cannot be saved is read back from the server.

interface Data {
  who: string | null;
  card: string | null;
  dueAt: string;
  /** Its color while not late: whose it is, or «ждёт проверки». */
  base: string;
  /** «pending» — a reminder is still to go off, the event stands at its time; «sent» — it has; null — none was asked for. */
  remind: "pending" | "sent" | null;
  /** When the reminder goes off (went off), ISO. */
  remindAt: string | null;
}

const COLOR = {
  late: "var(--color-rose-500)",
  mine: "var(--color-blue-500)",
  theirs: "var(--color-emerald-500)",
  unconfirmed: "var(--color-amber-500)",
} as const;

const DAY_MS = 86_400_000;
const REMINDER_MS = 30 * 60_000;

/** The week as «9–15 ноября 2026» or «30 ноября – 6 декабря 2026»; the other views by their month. */
const formatTitle = (
  view: string,
  {
    date,
    activeRange,
    locale,
  }: { date: Date; activeRange: { start: Date; end: Date }; locale?: Locale }
) => {
  const opts = { locale };
  if (view !== "week") {
    return format(date, "LLLL yyyy", opts);
  }
  const { start } = activeRange;
  const end = subMilliseconds(activeRange.end, 1);
  const last = format(end, "d MMMM yyyy", opts);
  return isSameMonth(start, end)
    ? `${format(start, "d", opts)}–${last}`
    : `${format(start, "d MMMM", opts)} – ${last}`;
};

const clock = (iso: string, locale: string, timeZone: string) =>
  new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));

/** A commitment as an event: its day, the whole of it — or, with a reminder to come, the reminder's time. */
const eventOf = (
  row: MemoryDue["rows"][number],
  today: string,
  timeZone: string
): CalendarEvent<Data> => {
  const day = dayKey(new Date(row.dueAt), timeZone);
  let remind: Data["remind"] = null;
  if (row.remindAt) {
    remind = row.reminded ? "sent" : "pending";
  }
  const data = {
    base: "",
    card: row.who?.id ?? null,
    dueAt: row.dueAt,
    remind,
    remindAt: row.remindAt,
    who: row.who?.name ?? null,
  };
  let base: string = row.side === "mine" ? COLOR.mine : COLOR.theirs;
  if (row.status === "unconfirmed") {
    base = COLOR.unconfirmed;
  }
  const color = day < today ? COLOR.late : base;
  if (remind === "pending" && row.remindAt) {
    const at = new Date(row.remindAt);
    return {
      allDay: false,
      color,
      data: { ...data, base },
      end: new Date(at.getTime() + REMINDER_MS),
      id: row.id,
      start: at,
      title: row.text,
    };
  }
  const start = localMidnightOf(day, timeZone);
  const end = localMidnightOf(
    dayKey(new Date(start.getTime() + 1.5 * DAY_MS), timeZone),
    timeZone
  );
  return {
    allDay: true,
    color,
    data: { ...data, base },
    end,
    id: row.id,
    start,
    title: row.text,
  };
};

const patchRecord = (id: string, body: { dueAt?: string; remindAt?: string }) =>
  fetch(`/api/memory/records/${id}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });

/** The row with another day's midnight for its deadline, or another time for its reminder. */
const withRow = (
  due: MemoryDue,
  id: string,
  patch: { dueAt: string } | { remindAt: string }
): MemoryDue => ({
  ...due,
  rows: due.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
});

/** A reminder still to go off: a bell before the title, and the time after it. */
const renderReminder = (
  { occurrence }: EventCalendarRenderEventProps<Data>,
  locale: string,
  timeZone: string
) => {
  const { data } = occurrence.event;
  if (data?.remind !== "pending" || !data.remindAt) {
    return;
  }
  return (
    <>
      <Bell aria-hidden className="size-3 shrink-0" />
      <span className="truncate font-medium">{occurrence.event.title}</span>
      <span className="text-muted-foreground shrink-0">
        {clock(data.remindAt, locale, timeZone)}
      </span>
    </>
  );
};

export const DueView = ({
  due,
  setDue,
  reread,
  phone,
  timeZone,
  cards,
}: {
  /** The deadlines; null while they are being read. */
  due: MemoryDue | null;
  setDue: Dispatch<SetStateAction<MemoryDue | null>>;
  /** Reads the page again: the list, the deadlines, the open card. */
  reread: () => Promise<void>;
  phone: boolean;
  timeZone: string;
  /** The cards a promise can be to or from. */
  cards: MemoryCardItem[];
}) => {
  const t = useTranslations("memory");
  const editor = usePromiseEditor({ due, reread, timeZone });
  const locale = useLocale();
  const router = useRouter();
  // The week opens at the hour before now, the way a calendar does.
  const scrollToHour = useMemo(
    () =>
      Math.max(
        0,
        Number(
          new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            hourCycle: "h23",
            timeZone,
          }).format(new Date())
        ) - 1
      ),
    [timeZone]
  );
  const events = useMemo(
    () => (due ? due.rows.map((r) => eventOf(r, due.today, timeZone)) : []),
    [due, timeZone]
  );
  const late = due
    ? due.rows.filter((r) => isLate(r, due.today, timeZone)).length
    : 0;

  const i18n = useMemo(
    () => ({
      formats: {
        agendaDayHeader: "EEEE, d MMMM",
        agendaTitle: "LLLL yyyy",
        dayTitle: "EEEE, d MMMM yyyy",
        eventTime: "HH:mm",
        monthTitle: "LLLL yyyy",
        moreDayHeader: "EEEE, d MMMM",
        timeGutter: "HH:mm",
        timeGutterMinute: "HH:mm",
      },
      functions: { formatTitle },
      labels: {
        allDay: t("calAllDay"),
        more: (count: number) => t("calMore", { count }),
        next: t("calNext"),
        noEvents: t("calNoEvents"),
        previous: t("calPrevious"),
        selectView: t("calSelectView"),
        today: t("calToday"),
      },
      viewNames: {
        agenda: t("calAgenda"),
        month: t("calMonth"),
        week: t("calWeek"),
      },
    }),
    [t]
  );

  /** A deadline or a reminder set in the shared rows at once, so the list and the line under the calendar follow. */
  const place = (id: string, patch: { dueAt: string } | { remindAt: string }) =>
    setDue((d) => (d ? withRow(d, id, patch) : d));

  /** A bar dropped on another day or a reminder on another time: the calendar has moved it; here it is saved, or read back. */
  const move = (update: EventCalendarProposedUpdate<Data>) => {
    const before = update.event;
    const reminder = before.data?.remind === "pending";
    let now: { dueAt: string } | { remindAt: string };
    let was: { dueAt: string } | { remindAt: string };
    if (reminder) {
      if (update.start.getTime() === before.start.getTime()) {
        return;
      }
      if (update.start.getTime() <= Date.now()) {
        toast.error(t("calRemindPast"));
        reread();
        return;
      }
      now = { remindAt: update.start.toISOString() };
      was = { remindAt: before.start.toISOString() };
    } else {
      const day = dayKey(update.start, timeZone);
      if (day === dayKey(before.start, timeZone)) {
        return;
      }
      now = { dueAt: localMidnightOf(day, timeZone).toISOString() };
      was = { dueAt: before.data?.dueAt ?? before.start.toISOString() };
    }
    const undo = async () => {
      place(before.id, was);
      const response = await patchRecord(before.id, was);
      if (!response.ok) {
        toast.error(t("failed"));
      }
      await reread();
    };
    const save = async () => {
      const response = await patchRecord(before.id, now);
      if (!response.ok) {
        toast.error(t("failed"));
        await reread();
        return;
      }
      toast(t("savedMoved"), {
        action: { label: t("restore"), onClick: undo },
      });
      await reread();
    };
    save();
  };

  /** The calendar's own result of a drag: every bar where it now stands, in the shared rows. */
  const apply = (all: CalendarEvent<Data>[]) =>
    setDue((d) => {
      if (!d) {
        return d;
      }
      let next = d;
      for (const e of all) {
        const row = next.rows.find((r) => r.id === e.id);
        if (!row) {
          continue;
        }
        if (e.data?.remind === "pending") {
          if (e.start.toISOString() !== row.remindAt) {
            next = withRow(next, e.id, { remindAt: e.start.toISOString() });
          }
        } else if (
          dayKey(new Date(row.dueAt), timeZone) !== dayKey(e.start, timeZone)
        ) {
          next = withRow(next, e.id, {
            dueAt: localMidnightOf(
              dayKey(e.start, timeZone),
              timeZone
            ).toISOString(),
          });
        }
      }
      return next;
    });

  /** What the bar says of its notification: when it goes off, that it went, or that none was asked for. */
  const tooltip = ({
    occurrence,
  }: {
    occurrence: { event: CalendarEvent<Data> };
  }) => {
    const { data, title } = occurrence.event;
    let line = t("calNoRemind");
    if (data?.remindAt && data.remind) {
      line = t(data.remind === "pending" ? "calRemindAt" : "calReminded", {
        time: clock(data.remindAt, locale, timeZone),
      });
    }
    return (
      <span className="flex flex-col">
        <span>{title}</span>
        <span className="opacity-70">{line}</span>
      </span>
    );
  };

  /** A click on an empty day or hour: a new promise there; on an hour, with a reminder at it, if it is still ahead. */
  const startAt = (slot: { date: Date; allDay: boolean }) => {
    const day = dayKey(slot.date, timeZone);
    if (slot.allDay || slot.date.getTime() <= Date.now()) {
      editor.open(newDraft(day));
      return;
    }
    editor.open(
      newDraft(
        day,
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          hourCycle: "h23",
          minute: "2-digit",
          timeZone,
        }).format(slot.date)
      )
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-h-[24rem] flex-1 overflow-hidden rounded-xl border">
        <EventCalendar<Data>
          className="h-full"
          defaultInteractions={{ drag: true, resize: false, selectSlot: false }}
          defaultView={phone ? "agenda" : "week"}
          events={events}
          eventTooltip
          i18n={i18n}
          locale={locale === "ru" ? ru : enUS}
          onEventClick={(occurrence, e) => {
            e.preventDefault();
            editor.edit(occurrence.event.id);
          }}
          onEventsChange={apply}
          onEventUpdate={move}
          onSlotClick={startAt}
          renderEvent={(props) => renderReminder(props, locale, timeZone)}
          renderEventTooltip={tooltip}
          scrollToHour={scrollToHour}
          timeZone={timeZone}
          views={["month", "week", "agenda"]}
          weekStartsOn={1}
        >
          <EventCalendarNav />
          <EventCalendarToolbar className="justify-end border-b px-3 py-2">
            <Button
              onClick={() => startAt({ allDay: true, date: new Date() })}
              size="sm"
              variant="outline"
            >
              <Plus /> {t("promiseAdd")}
            </Button>
          </EventCalendarToolbar>
          <EventCalendarContent />
        </EventCalendar>
      </div>
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
      {due && (late > 0 || due.none > 0) && (
        <p className="text-muted-foreground flex flex-wrap gap-x-4 text-sm">
          {late > 0 && <span>{t("dueLate", { count: late })}</span>}
          {due.none > 0 && <span>{t("dueNone", { count: due.none })}</span>}
        </p>
      )}
    </div>
  );
};
