"use client";

import type { MemoryDue } from "@metobe/contracts/memory";
import { EventCalendar } from "@metobe/ui/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@metobe/ui/components/reui/event-calendar/event-calendar-content";
import { EventCalendarNav } from "@metobe/ui/components/reui/event-calendar/event-calendar-nav";
import type {
  EventCalendarProposedUpdate,
  CalendarEvent,
} from "@metobe/ui/components/reui/event-calendar/event-calendar-types";
import { toast } from "@metobe/ui/components/sonner";
import { enUS, ru } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { dayKey, localMidnightOf } from "@/lib/memory-dates";

import { readJson } from "./use-memory-actions";

// «Сроки» (Д6, P27, a calendar — ReUI's Event Calendar): every open commitment with a deadline stands on its day, a
// whole-day bar; the ones past their day are red. Dragging one to another day moves its deadline (`PATCH` the record,
// with «Вернуть»). A click opens the card of the other side. On a phone the agenda — a list by day — comes first.

interface Data {
  who: string | null;
  card: string | null;
  dueAt: string;
}

const COLOR = {
  late: "var(--color-rose-500)",
  mine: "var(--color-blue-500)",
  theirs: "var(--color-emerald-500)",
  unconfirmed: "var(--color-amber-500)",
} as const;

const DAY_MS = 86_400_000;

/** A commitment as an event: its day, the whole of it, in the person's zone. */
const eventOf = (
  row: MemoryDue["rows"][number],
  today: string,
  timeZone: string
): CalendarEvent<Data> => {
  const day = dayKey(new Date(row.dueAt), timeZone);
  const start = localMidnightOf(day, timeZone);
  const end = localMidnightOf(
    dayKey(new Date(start.getTime() + 1.5 * DAY_MS), timeZone),
    timeZone
  );
  let color: string = row.side === "mine" ? COLOR.mine : COLOR.theirs;
  if (row.status === "unconfirmed") {
    color = COLOR.unconfirmed;
  }
  if (day < today) {
    color = COLOR.late;
  }
  return {
    allDay: true,
    color,
    data: {
      card: row.who?.id ?? null,
      dueAt: row.dueAt,
      who: row.who?.name ?? null,
    },
    end,
    id: row.id,
    start,
    title: row.text,
  };
};

const patchDue = (id: string, dueAt: Date) =>
  fetch(`/api/memory/records/${id}`, {
    body: JSON.stringify({ dueAt: dueAt.toISOString() }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });

export const DueView = ({
  phone,
  timeZone,
}: {
  phone: boolean;
  timeZone: string;
}) => {
  const t = useTranslations("memory");
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<MemoryDue | null>(null);
  const [events, setEvents] = useState<CalendarEvent<Data>[]>([]);

  useEffect(() => {
    const read = async () => {
      const due = await readJson<MemoryDue>("/api/memory/due");
      if (!due) {
        toast.error(t("loadFailed"));
        return;
      }
      setData(due);
      setEvents(due.rows.map((r) => eventOf(r, due.today, timeZone)));
    };
    read();
  }, [t, timeZone]);

  const late = data
    ? data.rows.filter((r) => dayKey(new Date(r.dueAt), timeZone) < data.today)
        .length
    : 0;

  const i18n = useMemo(
    () => ({
      formats: {
        agendaDayHeader: "EEEE, d MMMM",
        agendaTitle: "LLLL yyyy",
        dayTitle: "EEEE, d MMMM yyyy",
        monthTitle: "LLLL yyyy",
        moreDayHeader: "EEEE, d MMMM",
      },
      labels: {
        allDay: t("calAllDay"),
        more: (count: number) => t("calMore", { count }),
        next: t("calNext"),
        noEvents: t("calNoEvents"),
        previous: t("calPrevious"),
        selectView: t("calSelectView"),
        today: t("calToday"),
      },
      viewNames: { agenda: t("calAgenda"), month: t("calMonth") },
    }),
    [t]
  );

  /** A bar dragged to another day: the deadline moves to its midnight; not saved — it goes back. */
  const move = (update: EventCalendarProposedUpdate<Data>) => {
    const before = update.event;
    const day = dayKey(update.start, timeZone);
    if (day === dayKey(before.start, timeZone)) {
      return;
    }
    const dueAt = localMidnightOf(day, timeZone);
    const undo = async () => {
      const response = await patchDue(
        before.id,
        new Date(before.data?.dueAt ?? dueAt)
      );
      if (response.ok) {
        setEvents((all) => all.map((e) => (e.id === before.id ? before : e)));
      }
    };
    const save = async () => {
      const response = await patchDue(before.id, dueAt);
      if (!response.ok) {
        toast.error(t("failed"));
        setEvents((all) => all.map((e) => (e.id === before.id ? before : e)));
        return;
      }
      toast(t("savedMoved"), {
        action: { label: t("restore"), onClick: undo },
      });
    };
    save();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="h-[34rem] max-h-[75svh] overflow-hidden rounded-xl border">
        <EventCalendar<Data>
          defaultInteractions={{ drag: true, resize: false, selectSlot: false }}
          defaultView={phone ? "agenda" : "month"}
          events={events}
          i18n={i18n}
          locale={locale === "ru" ? ru : enUS}
          onEventClick={(occurrence) => {
            const card = occurrence.event.data?.card;
            if (card) {
              router.push(`/memory?card=${card}`);
            }
          }}
          onEventsChange={setEvents}
          onEventUpdate={move}
          timeZone={timeZone}
          views={["month", "agenda"]}
          weekStartsOn={1}
        >
          <EventCalendarNav />
          <EventCalendarContent />
        </EventCalendar>
      </div>
      {data && (late > 0 || data.none > 0) && (
        <p className="text-muted-foreground flex flex-wrap gap-x-4 text-sm">
          {late > 0 && <span>{t("dueLate", { count: late })}</span>}
          {data.none > 0 && <span>{t("dueNone", { count: data.none })}</span>}
        </p>
      )}
    </div>
  );
};
