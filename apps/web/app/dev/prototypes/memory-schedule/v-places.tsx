"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Bell, BellRing, CalendarDays, ListChecks, UserRound } from "lucide-react";
import { useState } from "react";

import { ENTER, Shell, rise } from "../memory/frame";
import { Group, MemoryPage } from "./layout-parts";
import { EMPTY_TEXT, Empty, ItemActions, ItemRow, byNext, nextDay, shortDay, subline, useSchedule, whenOf } from "./shared";
import type { Actions, Item, ReminderItem } from "./shared";

// Вариант 3 · «По местам». Каждый вид там, где его ищут: обещания со сроками — в «Календаре», у обещания с
// напоминанием колокольчик со временем; «Напоминания» — только свои напоминания; даты и ритмы — в «Правилах», у
// каждого строка «следующий раз». Разделы слева переключаются.

const PROMISES = [
  { card: "Ольга Ли", day: 0, id: "olga", text: "Отправить Ольге договор поставки" },
  { card: "Ирина Белова", day: 1, id: "irina", text: "Согласовать с Ириной смету" },
  { card: "Андрей Седов", day: 2, id: "andrey-p", text: "Андрей пришлёт расчёт по складу" },
];

const RULES = ["В письма клиентам ставлю в копию Ирину", "Ответа от подрядчиков ждём пять рабочих дней"];

/** «Календарь»: обещания по сроку; напоминание о нём — колокольчиком со временем, «Готово» — в строке обещания. */
const Calendar = ({ reminders }: { reminders: ReminderItem[] }) => (
  <ul className="flex flex-col">
    {PROMISES.map((p, i) => {
      const bell = reminders.find((r) => r.id === p.id);
      return (
        <li className={cn("hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2", ENTER)} key={p.id} style={rise(i)}>
          <span className="text-muted-foreground w-24 shrink-0 text-xs">{shortDay(p.day)}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm">{p.text}</span>
            <span className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1">
                <UserRound className="size-3" />
                {p.card}
              </span>
              {bell && (
                <span className={cn("inline-flex items-center gap-1", bell.sent && "text-amber-600 dark:text-amber-400")}>
                  <BellRing className="size-3" />
                  {bell.sent ? "отправлено" : "напоминание"} {bell.time}
                </span>
              )}
            </span>
          </div>
        </li>
      );
    })}
  </ul>
);

/** «Правила»: обычные правила и те, что идут по времени, — с ближайшим разом. */
const Rules = ({ items, actions }: { items: Item[]; actions: Actions }) => (
  <div className="flex flex-col gap-6">
    <Group count={items.length} title="Даты и ритмы">
      {items.map((x, i) => (
        <li className={cn("group hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2", ENTER)} key={x.id} style={rise(i)}>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm">{x.text}</span>
            <span className="text-muted-foreground text-xs">
              {subline(x)} · <span className={cn(nextDay(x) <= 0 && x.kind === "rhythm" && "text-amber-600 dark:text-amber-400")}>следующий раз — {whenOf(x)}</span>
            </span>
          </div>
          <ItemActions actions={actions} item={x} />
        </li>
      ))}
    </Group>
    <Group count={RULES.length} title="Как делать">
      {RULES.map((r) => (
        <li className="-mx-2 px-2 py-2 text-sm" key={r}>
          {r}
        </li>
      ))}
    </Group>
  </div>
);

const NOTES: Record<string, [string, string]> = {
  calendar: ["Календарь", "Обещания по сроку. Колокольчик — к обещанию поставлено напоминание."],
  reminders: ["Напоминания", "Свои напоминания — без второй стороны. Приходят в Telegram и на почту."],
  rules: ["Правила", "Как вы хотите, чтобы делалось, и что идёт по времени: дни рождения, даты, ритмы встреч."],
};

const Places = () => {
  const { list, actions } = useSchedule();
  const [place, setPlace] = useState("reminders");
  const sorted = [...list].sort(byNext);
  const all = sorted.filter((x): x is ReminderItem => x.kind === "reminder");
  const own = all.filter((x) => !x.promise);
  const timed = sorted.filter((x) => x.kind !== "reminder");
  const [title, note] = NOTES[place] ?? ["", ""];
  return (
    <Shell area="memory" title={title}>
      <MemoryPage
        active={place}
        nav={[
          { icon: CalendarDays, id: "calendar", label: "Календарь" },
          { count: own.length, icon: Bell, id: "reminders", label: "Напоминания" },
          { icon: UserRound, id: "me", label: "Обо мне" },
          { count: timed.length, icon: ListChecks, id: "rules", label: "Правила" },
        ]}
        note={note}
        onPick={(id) => id !== "me" && setPlace(id)}
        title={title}
      >
        {list.length === 0 && <Empty text={EMPTY_TEXT} />}
        {list.length > 0 && place === "calendar" && <Calendar reminders={all} />}
        {list.length > 0 && place === "reminders" && (
          <ul className="flex flex-col">
            {own.map((x, i) => (
              <ItemRow actions={actions} i={i} item={x} key={x.id} showKind={false} when={whenOf(x)} />
            ))}
          </ul>
        )}
        {list.length > 0 && place === "rules" && <Rules actions={actions} items={timed} />}
      </MemoryPage>
    </Shell>
  );
};

export default Places;
