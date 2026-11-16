"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { Bell, BellRing, ChevronLeft, ChevronRight, Repeat } from "lucide-react";

import { ENTER, PRESS, Shell, rise } from "../memory/frame";
import { AddButton, CardTag, ClosedBySend, Empty, RepeatTag, ReminderWindow, RowActions, dayAt, dayName, occurrences, useReminders } from "./shared";
import type { Actions, Reminder } from "./shared";

// Вариант 2 · «В календаре». Отдельного места нет: в календаре «Памяти» к «Месяц / Неделя / Список» добавлен вид
// «Напоминания» — 14 дней по дням, только то, у чего есть время напоминания. Повтор развёрнут по дням: ближайший раз —
// обычной строкой, следующие — бледно, со значком повтора (видно, сколько их будет на неделе). Пришедшее и не
// отмеченное — в своём дне со звонком.

const VIEWS = ["Месяц", "Неделя", "Список", "Напоминания"];
const DAYS = 14;

interface Slot {
  r: Reminder;
  day: number;
  /** Не ближайший раз повтора — показан для обзора, действий нет. */
  later: boolean;
}

const SlotRow = ({ slot, actions, i }: { slot: Slot; actions: Actions; i: number }) => {
  const { r, later } = slot;
  return (
    <li className={cn("group hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5", ENTER, later && "opacity-50")} style={rise(i)}>
      <span className="text-muted-foreground flex w-14 shrink-0 items-center gap-1 text-xs tabular-nums">
        {r.sent ? <BellRing className="text-foreground size-3" /> : later ? <Repeat className="size-3" /> : <Bell className="size-3" />}
        {r.time}
      </span>
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => actions.open(r)} type="button">
        <span className="min-w-0 truncate text-sm">{r.text}</span>
        <span className="hidden shrink-0 items-center gap-3 @lg:flex">
          <CardTag r={r} />
          {!later && <RepeatTag r={r} />}
        </span>
      </button>
      {!later && <RowActions actions={actions} r={r} />}
    </li>
  );
};

const CalendarView = () => {
  const { list, closedBySend, actions, edit } = useReminders();
  const slots: Slot[] = list.flatMap((r) => occurrences(r, DAYS - 1).map((day, k) => ({ day: Math.max(day, r.sent ? r.day : 0), later: k > 0, r })));
  const days = Array.from({ length: DAYS + 1 }, (_, d) => d - 1).filter((d) => slots.some((s) => s.day === d));
  let n = 0;
  return (
    <Shell area="memory" title="Календарь">
      <div className="flex flex-col gap-4 px-4 py-4 @lg:px-6 @lg:pt-20">
        <header className="flex flex-wrap items-center gap-2">
          <Button className={PRESS} size="sm" variant="outline">
            Сегодня
          </Button>
          <Button aria-label="Назад" size="icon-sm" variant="ghost">
            <ChevronLeft />
          </Button>
          <Button aria-label="Вперёд" size="icon-sm" variant="ghost">
            <ChevronRight />
          </Button>
          <span className="text-sm font-medium">
            {dayAt(0).toLocaleDateString("ru", { day: "numeric", month: "short" })} — {dayAt(DAYS - 1).toLocaleDateString("ru", { day: "numeric", month: "short" })}
          </span>
          <div className="bg-muted ms-auto flex rounded-md p-0.5 text-xs">
            {VIEWS.map((v) => (
              <span className={cn("rounded px-2 py-1", v === "Напоминания" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")} key={v}>
                {v}
              </span>
            ))}
          </div>
          <AddButton actions={actions} />
        </header>
        {list.length === 0 && closedBySend.length === 0 ? (
          <Empty actions={actions} />
        ) : (
          <div className="flex max-w-3xl flex-col gap-5">
            {days.map((d) => (
              <section className="flex flex-col gap-1" key={d}>
                <h3 className={cn("text-xs font-medium", d === 0 ? "text-foreground" : "text-muted-foreground")}>{dayName(d)}</h3>
                <ul className="flex flex-col border-s ps-3">
                  {slots
                    .filter((s) => s.day === d)
                    .sort((a, b) => a.r.time.localeCompare(b.r.time))
                    .map((s) => (
                      <SlotRow actions={actions} i={n++} key={`${s.r.id}-${s.day}`} slot={s} />
                    ))}
                </ul>
              </section>
            ))}
            <ClosedBySend actions={actions} list={closedBySend} />
          </div>
        )}
      </div>
      <ReminderWindow actions={actions} edit={edit} key={edit ? (edit.mode === "edit" ? edit.reminder.id : "new") : "none"} />
    </Shell>
  );
};

export default CalendarView;
