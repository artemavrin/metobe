"use client";

import { cn } from "@metobe/ui/lib/utils";
import { BellRing } from "lucide-react";
import { useState } from "react";

import { ENTER, Shell, rise, usePhone } from "../memory/frame";
import { AddButton, CardTag, ClosedBySend, Empty, RepeatTag, ReminderWindow, RowActions, dayName, useReminders } from "./shared";
import type { Actions, Reminder } from "./shared";

// Вариант 3 · «Лента». Одна страница «Напоминания» (из списка «Памяти»), один список по времени — что придёт и что
// уже пришло. Пришедшее не уходит в отдельную группу: остаётся на своём месте со звонком и подписью «пришло», пока не
// отмечено. Повтор — одной строкой, ближайшим разом. Сверху — «Все / Разовые / Повторяются».

type Filter = "all" | "once" | "repeat";
const FILTERS: [Filter, string][] = [
  ["all", "Все"],
  ["once", "Разовые"],
  ["repeat", "Повторяются"],
];

const Item = ({ r, actions, i }: { r: Reminder; actions: Actions; i: number }) => (
  <li className={cn("group hover:bg-muted/50 -mx-2 flex items-start gap-3 rounded-md px-2 py-2", ENTER)} style={rise(i)}>
    <span className={cn("w-12 shrink-0 pt-0.5 text-sm tabular-nums", r.sent ? "text-foreground font-medium" : "text-muted-foreground")}>{r.time}</span>
    <button className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left" onClick={() => actions.open(r)} type="button">
      <span className="line-clamp-2 text-sm">{r.text}</span>
      <span className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-0.5">
        {r.sent && (
          <span className="text-foreground inline-flex items-center gap-1 text-xs">
            <BellRing className="size-3" /> пришло, не отмечено
          </span>
        )}
        <CardTag r={r} />
        <RepeatTag r={r} />
      </span>
    </button>
    <RowActions actions={actions} always={r.sent} r={r} />
  </li>
);

const Feed = () => {
  const phone = usePhone();
  const [filter, setFilter] = useState<Filter>("all");
  const { list, closedBySend, actions, edit } = useReminders();
  const shown = list
    .filter((r) => filter === "all" || (filter === "repeat") === Boolean(r.repeat))
    .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  const days = [...new Set(shown.map((r) => r.day))];
  let n = 0;
  return (
    <Shell area="memory" title="Напоминания">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 @lg:pt-20">
        <header className="flex items-center justify-between gap-3">
          {!phone && <h2 className="text-lg font-semibold">Напоминания</h2>}
          {list.length > 0 && <AddButton actions={actions} />}
        </header>
        {list.length > 0 && (
          <div className="flex gap-1 text-sm">
            {FILTERS.map(([key, label]) => (
              <button
                aria-pressed={filter === key}
                className={cn("rounded-full px-3 py-1 transition-colors duration-150", filter === key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {list.length === 0 && closedBySend.length === 0 ? (
          <Empty actions={actions} />
        ) : (
          days.map((d) => (
            <section className="flex flex-col" key={d}>
              <h3 className="bg-background/95 text-muted-foreground sticky top-0 z-10 py-1.5 text-xs font-medium backdrop-blur">{dayName(d)}</h3>
              <ul className="flex flex-col">
                {shown
                  .filter((r) => r.day === d)
                  .map((r) => (
                    <Item actions={actions} i={n++} key={r.id} r={r} />
                  ))}
              </ul>
            </section>
          ))
        )}
        <ClosedBySend actions={actions} list={closedBySend} />
      </div>
      <ReminderWindow actions={actions} edit={edit} key={edit ? (edit.mode === "edit" ? edit.reminder.id : "new") : "none"} />
    </Shell>
  );
};

export default Feed;
