"use client";

import { Button } from "@metobe/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@metobe/ui/components/dropdown-menu";
import { cn } from "@metobe/ui/lib/utils";
import { BellRing, CalendarClock, CalendarHeart, Check, Clock, EyeOff, Handshake, MoreHorizontal, Repeat, UsersRound } from "lucide-react";
import { useState } from "react";

import { dayAt, nextOf, repeatLabel, shortDay } from "../memory-reminders/shared";
import type { RepeatKind } from "../memory-reminders/shared";
import { ENTER, PRESS, rise, useProto } from "../memory/frame";

// Общее для P30 (D45, этап экранов): всё, что приходит само по времени, после разделения обещаний и расписаний.
// Три вида расписания и то, что модель про них действительно знает:
//   напоминание — время, повтор, пришло ли и не отмечено; своё («Позвонить в банк») или об обещании (говорится
//     текстом обещания, у него вторая сторона);
//   дата — день и повтор (год, месяц, неделя) — следующий раз считается из них;
//   ритм — «раз в N дней» с карточкой и день последнего контакта (событие) — «пора» считается из них.
// Ничего сверх этого: ни приоритетов, ни категорий.

export interface ReminderItem {
  kind: "reminder";
  id: string;
  text: string;
  day: number;
  time: string;
  repeat?: RepeatKind;
  /** Пришло и не отмечено. */
  sent?: boolean;
  /** Напоминание об обещании: вторая сторона обещания. */
  promise?: string;
}

export interface DateItem {
  kind: "date";
  id: string;
  text: string;
  card?: string;
  /** Ближайший раз — смещение дня от сегодня. */
  day: number;
  repeat: "year" | "month" | "week";
}

export interface RhythmItem {
  kind: "rhythm";
  id: string;
  text: string;
  card: string;
  every: number;
  /** Дней с последнего контакта; null — ещё не было, считается от того, когда сказано. */
  last: number | null;
  said: number;
}

export type Item = ReminderItem | DateItem | RhythmItem;

const SEED: Item[] = [
  { day: 0, id: "bank", kind: "reminder", sent: true, text: "Позвонить в банк про лимит", time: "10:00" },
  { day: 0, id: "olga", kind: "reminder", promise: "Ольга Ли", text: "Отправить Ольге договор поставки", time: "15:00" },
  { day: 0, id: "timesheet", kind: "reminder", repeat: "weekdays", text: "Заполнить таймшит", time: "18:00" },
  { day: 1, id: "irina", kind: "reminder", promise: "Ирина Белова", text: "Согласовать с Ириной смету", time: "09:30" },
  { day: 3, id: "weekly", kind: "reminder", repeat: "week", text: "Отчёт по закупкам", time: "10:00" },
  { day: 11, id: "rent", kind: "reminder", repeat: "month", text: "Оплатить аренду", time: "12:00" },
  { card: "Ольга Ли", day: 2, id: "bd-olga", kind: "date", repeat: "year", text: "День рождения Ольги Ли" },
  { day: 4, id: "friday", kind: "date", repeat: "week", text: "Отчёт каждую пятницу" },
  { card: "Павел Орлов", day: 41, id: "bd-pavel", kind: "date", repeat: "year", text: "День рождения Павла Орлова" },
  { card: "Андрей Седов", every: 14, id: "andrey", kind: "rhythm", last: 18, said: 40, text: "Один на один с Андреем раз в две недели" },
  { card: "Ирина Белова", every: 7, id: "irina-r", kind: "rhythm", last: 3, said: 20, text: "С Ириной раз в неделю" },
  { card: "Нина Орлова", every: 30, id: "nina", kind: "rhythm", last: null, said: 12, text: "С Ниной раз в месяц" },
];

/** День, когда придёт следующий раз (смещение от сегодня); у ритма — когда «пора», может быть в прошлом. */
export const nextDay = (item: Item) => {
  if (item.kind === "rhythm") {
    return item.every - (item.last ?? item.said);
  }
  return item.day;
};

/** Ритм, которому пора: с последнего контакта прошло не меньше периода. */
export const isDue = (item: Item) => item.kind === "rhythm" && nextDay(item) <= 0;

const DATE_REPEAT: Record<DateItem["repeat"], RepeatKind> = { month: "month", week: "week", year: "year" };

const period = (days: number) => {
  if (days % 30 === 0) return days === 30 ? "раз в месяц" : `раз в ${days / 30} мес.`;
  if (days % 7 === 0) return days === 7 ? "раз в неделю" : `раз в ${days / 7} нед.`;
  return `раз в ${days} дн.`;
};

/** Подпись под текстом: что это и когда. */
export const subline = (item: Item) => {
  if (item.kind === "reminder") {
    // Разовое: когда — уже в колонке слева, подписи не нужно.
    return item.repeat ? `${repeatLabel(item.repeat, item.day)}, ${item.time}` : "";
  }
  if (item.kind === "date") {
    return repeatLabel(DATE_REPEAT[item.repeat], item.day);
  }
  const since = item.last === null ? "ещё не было" : item.last === 0 ? "было сегодня" : `было ${item.last} дн. назад`;
  return `${period(item.every)} · ${since}`;
};

/** Когда — коротко, для колонки слева или подписи справа. */
export const whenOf = (item: Item) => {
  const d = nextDay(item);
  if (item.kind === "rhythm") {
    return d <= 0 ? (d === 0 ? "сегодня" : `на ${-d} дн.`) : shortDay(d);
  }
  return item.kind === "reminder" ? `${shortDay(d)}, ${item.time}` : shortDay(d);
};

export const KIND_ICON = { date: CalendarHeart, reminder: BellRing, rhythm: UsersRound } as const;
export const KIND_NAME = { date: "Дата", reminder: "Напоминание", rhythm: "Ритм" } as const;

export const useWorld = () => {
  const { knobs } = useProto();
  return { empty: knobs.list === "none" };
};

/** Список прототипа: действия у каждого вида свои, память не трогается. */
export const useSchedule = () => {
  const { say } = useProto();
  const { empty } = useWorld();
  const [list, setList] = useState<Item[]>(SEED);
  const put = (id: string, patch: Partial<Item>) => setList((l) => l.map((x) => (x.id === id ? ({ ...x, ...patch } as Item) : x)));
  const before = () => {
    const was = list;
    return () => setList(was);
  };
  const actions = {
    /** Напоминание: «Готово»; дата: «Уже сделано» — до следующего раза; ритм: «Уже было» — контакт сегодня. */
    done: (item: Item) => {
      const undo = before();
      if (item.kind === "rhythm") {
        put(item.id, { last: 0 });
        say(`Записал встречу. Следующая — ${shortDay(item.every)}`, undo);
      } else if (item.kind === "date") {
        const next = nextOf(DATE_REPEAT[item.repeat], item.day);
        put(item.id, { day: next });
        say(`Следующий раз — ${shortDay(next)}`, undo);
      } else if (item.repeat) {
        const next = nextOf(item.repeat, item.day);
        put(item.id, { day: next, sent: false });
        say(`Следующее — ${shortDay(next)} в ${item.time}`, undo);
      } else {
        setList((l) => l.filter((x) => x.id !== item.id));
        say(item.promise ? `Обещание выполнено` : "Готово", undo);
      }
    },
    later: (item: ReminderItem, hours: number) => {
      const undo = before();
      put(item.id, { day: hours >= 24 ? Math.max(item.day, 0) + 1 : item.day, sent: false });
      say(hours >= 24 ? `Напомню завтра в ${item.time}` : "Напомню через час", undo);
    },
    /** «Убрать» — на этот раз: дата до следующего раза, ритм до следующего контакта. */
    hide: (item: Item) => {
      const undo = before();
      setList((l) => l.filter((x) => x.id !== item.id));
      say(item.kind === "rhythm" ? "Убрано до следующей встречи" : "Убрано на этот раз", undo);
    },
  };
  return { actions, list: empty ? [] : list };
};

export type Actions = ReturnType<typeof useSchedule>["actions"];

const DONE_LABEL = { date: "Уже сделано", reminder: "Готово", rhythm: "Уже было" } as const;

/** «Готово» (или «Уже сделано», «Уже было») на виду, остальное — в меню. */
export const ItemActions = ({ item, actions }: { item: Item; actions: Actions }) => {
  const label = item.kind === "reminder" && item.promise ? "Выполнено" : DONE_LABEL[item.kind];
  return (
    <div className="flex shrink-0 items-center gap-0.5 @lg:opacity-0 @lg:transition-opacity @lg:duration-150 @lg:group-hover:opacity-100 @lg:group-focus-within:opacity-100">
      <Button aria-label={label} className={PRESS} onClick={() => actions.done(item)} size="icon-sm" title={label} variant="ghost">
        <Check />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button aria-label="Ещё" className={PRESS} size="icon-sm" variant="ghost" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {item.kind === "reminder" ? (
            <>
              <DropdownMenuItem onClick={() => actions.later(item, 1)}>
                <Clock /> Через час
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.later(item, 24)}>
                <CalendarClock /> Завтра
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onClick={() => actions.hide(item)}>
              <EyeOff /> Убрать на этот раз
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

/** Метка обещания у напоминания о нём: с кем. */
export const PromiseTag = ({ item }: { item: Item }) =>
  item.kind === "reminder" && item.promise ? (
    <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs">
      <Handshake className="size-3 shrink-0" />
      <span className="truncate">обещание · {item.promise}</span>
    </span>
  ) : null;

/** Строка любого вида: значок вида, текст, подпись, действия. `showKind` — значок слева (в общем списке). */
export const ItemRow = ({ item, actions, i, showKind = true, when }: { item: Item; actions: Actions; i: number; showKind?: boolean; when?: string }) => {
  const Icon = KIND_ICON[item.kind];
  const due = isDue(item);
  return (
    <li className={cn("group hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2", ENTER)} style={rise(i)}>
      {showKind && (
        <span className="text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md border" title={KIND_NAME[item.kind]}>
          <Icon className="size-3.5" />
        </span>
      )}
      {when !== undefined && <span className={cn("hidden w-28 shrink-0 text-xs tabular-nums @lg:block", due ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{when}</span>}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="line-clamp-2 text-sm">{item.text}</span>
        <span className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-0.5">
          {when !== undefined && <span className={cn("text-xs tabular-nums @lg:hidden", due ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{when}</span>}
          {subline(item) && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <Repeat className="size-3" />
              {subline(item)}
            </span>
          )}
          <PromiseTag item={item} />
        </span>
      </div>
      <ItemActions actions={actions} item={item} />
    </li>
  );
};

/** Пусто: что сюда попадает. */
export const Empty = ({ text }: { text: string }) => (
  <div className={cn("text-muted-foreground mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center text-sm", ENTER)}>
    <CalendarClock className="size-5" />
    <p>{text}</p>
  </div>
);

export const EMPTY_TEXT =
  "Напишите в чате «напомни завтра в 10 позвонить в банк», «у Ольги день рождения 14 ноября» или «с Андреем раз в две недели» — это появится здесь.";

export const byNext = (a: Item, b: Item) =>
  nextDay(a) - nextDay(b) || (a.kind === "reminder" && b.kind === "reminder" ? a.time.localeCompare(b.time) : 0);

export { dayAt, shortDay };
