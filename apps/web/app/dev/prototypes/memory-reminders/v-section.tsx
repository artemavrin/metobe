"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Bell, BookUser, CalendarDays, ListChecks, UserRound } from "lucide-react";

import { ENTER, Shell, rise, usePhone } from "../memory/frame";
import { AddButton, CardTag, ClosedBySend, Empty, RepeatTag, ReminderWindow, RowActions, shortDay, useReminders, useWorld } from "./shared";
import type { Actions, Reminder } from "./shared";

// Вариант 1 · «Раздел». В списке страницы «Память» рядом с «Календарём» — «Напоминания» со счётчиком. Справа группы
// по тому, что с напоминанием сейчас: «Пришли, не отмечены» (сверху, их надо закрыть), «Сегодня», «Завтра», «На
// неделе», «Позже»; повторяющиеся — отдельной группой «Повторяются»: каждое один раз, с правилом и ближайшим разом.

const NAV = [
  { icon: CalendarDays, label: "Календарь" },
  { active: true, icon: Bell, label: "Напоминания" },
  { icon: UserRound, label: "Обо мне" },
  { icon: ListChecks, label: "Правила" },
];
const CARDS = ["Ольга Ли", "Ирина Белова", "ООО «Вектор»", "«Склад 2.0»"];

/** На компьютере время — колонкой слева; в узком месте — в подписи под текстом. */
const Row = ({ r, actions, i, when }: { r: Reminder; actions: Actions; i: number; when: string }) => (
  <li className={cn("group hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2", ENTER)} style={rise(i)}>
    <span className="text-muted-foreground hidden w-24 shrink-0 text-xs tabular-nums @lg:block">{when}</span>
    <button className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left" onClick={() => actions.open(r)} type="button">
      <span className="line-clamp-2 text-sm">{r.text}</span>
      <span className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="text-muted-foreground text-xs tabular-nums @lg:hidden">{when}</span>
        <CardTag r={r} />
        <RepeatTag r={r} />
      </span>
    </button>
    <RowActions actions={actions} r={r} />
  </li>
);

const Group = ({ title, list, actions, when, start }: { title: string; list: Reminder[]; actions: Actions; when: (r: Reminder) => string; start: number }) =>
  list.length > 0 ? (
    <section className="flex flex-col gap-1">
      <h3 className="text-muted-foreground text-xs font-medium">
        {title} <span className="tabular-nums">{list.length}</span>
      </h3>
      <ul className="flex flex-col">
        {list.map((r, i) => (
          <Row actions={actions} i={start + i} key={r.id} r={r} when={when(r)} />
        ))}
      </ul>
    </section>
  ) : null;

const Section = () => {
  const phone = usePhone();
  const { empty } = useWorld();
  const { list, closedBySend, actions, edit } = useReminders();
  const byTime = (a: Reminder, b: Reminder) => a.day - b.day || a.time.localeCompare(b.time);
  const once = list.filter((r) => !r.repeat).sort(byTime);
  const sent = once.filter((r) => r.sent);
  const ahead = once.filter((r) => !r.sent);
  const groups = [
    { list: sent, title: "Пришли, не отмечены", when: (r: Reminder) => `${shortDay(r.day)}, ${r.time}` },
    { list: ahead.filter((r) => r.day <= 0), title: "Сегодня", when: (r: Reminder) => r.time },
    { list: ahead.filter((r) => r.day === 1), title: "Завтра", when: (r: Reminder) => r.time },
    { list: ahead.filter((r) => r.day > 1 && r.day <= 7), title: "На неделе", when: (r: Reminder) => `${shortDay(r.day)}, ${r.time}` },
    { list: ahead.filter((r) => r.day > 7), title: "Позже", when: (r: Reminder) => `${shortDay(r.day)}, ${r.time}` },
    { list: list.filter((r) => r.repeat).sort(byTime), title: "Повторяются", when: (r: Reminder) => `${shortDay(r.day)}, ${r.time}` },
  ];
  let n = 0;
  return (
    <Shell area="memory" title="Напоминания">
      <div className="flex min-h-full">
        {!phone && (
          <nav className="flex w-56 shrink-0 flex-col gap-0.5 border-r p-2 text-sm">
            {NAV.map(({ icon: Icon, label, active }) => (
              <span className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", active ? "bg-muted font-medium" : "text-muted-foreground")} key={label}>
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                {active && !empty && <span className="text-muted-foreground text-xs tabular-nums">{list.length}</span>}
              </span>
            ))}
            <span className="text-muted-foreground px-2 pt-3 pb-1 text-xs">Люди и проекты</span>
            {CARDS.map((c) => (
              <span className="text-muted-foreground flex items-center gap-2 rounded-md px-2 py-1.5" key={c}>
                <BookUser className="size-4" />
                {c}
              </span>
            ))}
          </nav>
        )}
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 @lg:px-8 @lg:pt-20">
          <header className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              {!phone && <h2 className="text-lg font-semibold">Напоминания</h2>}
              <p className="text-muted-foreground text-xs">Приходят в Telegram и на почту. Повторяющееся после «Готово» ждёт следующего раза.</p>
            </div>
            {list.length > 0 && <AddButton actions={actions} className="shrink-0" />}
          </header>
          {list.length === 0 && closedBySend.length === 0 ? (
            <Empty actions={actions} />
          ) : (
            groups.map((g) => {
              const start = n;
              n += g.list.length;
              return <Group actions={actions} key={g.title} list={g.list} start={start} title={g.title} when={g.when} />;
            })
          )}
          <ClosedBySend actions={actions} list={closedBySend} />
        </div>
      </div>
      <ReminderWindow actions={actions} edit={edit} key={edit ? (edit.mode === "edit" ? edit.reminder.id : "new") : "none"} />
    </Shell>
  );
};

export default Section;
