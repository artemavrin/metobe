"use client";

import { Button } from "@metobe/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@metobe/ui/components/dropdown-menu";
import { cn } from "@metobe/ui/lib/utils";
import { addDays, format, getDay, startOfDay } from "date-fns";
import { ru } from "date-fns/locale";
import { Bell, CalendarClock, Check, ChevronDown, Clock, MoreHorizontal, Plus, Repeat, Trash2, UserRound, X } from "lucide-react";
import { useState } from "react";

import { DayButton, TimeField } from "../memory-promise-dialog/shared";
import { ENTER, PRESS, useProto } from "../memory/frame";

// Общее для P29 (шаг 6 плана памяти): все напоминания человека в одном месте, повторяющиеся («каждый понедельник в
// 10») и что делается с отправленным. Напоминание — своё обещание без второй стороны, срок — день, когда придёт;
// обещание с напоминанием («Позвонить Ольге», карточка есть) — тоже в списке, но после отправки остаётся открытым.
// Ручка «после отправки»: простое напоминание закрывается само / ждёт «Готово». Повтор: «Готово» не закрывает его,
// а переносит на следующий раз.

export type RepeatKind = "day" | "weekdays" | "week" | "month" | "year";

export interface Reminder {
  id: string;
  text: string;
  /** Смещение дня от сегодня. */
  day: number;
  time: string;
  /** Вторая сторона: это обещание с напоминанием, а не простое напоминание. */
  card?: string;
  repeat?: RepeatKind;
  /** Уже пришло (почтой или в Telegram), но не отмечено. */
  sent?: boolean;
  done?: boolean;
}

const SEED: Reminder[] = [
  { day: -1, id: "smeta", sent: true, text: "Согласовать смету по складу", time: "16:00", card: "Ольга Ли" },
  { day: 0, id: "bank", sent: true, text: "Позвонить в банк про лимит", time: "10:00" },
  { day: 0, id: "olga", text: "Позвонить Ольге про договор", time: "15:00", card: "Ольга Ли" },
  { day: 0, id: "timesheet", repeat: "weekdays", text: "Заполнить таймшит", time: "18:00" },
  { day: 1, id: "report", text: "Отправить Ирине отчёт по внедрению", time: "09:30", card: "Ирина Белова" },
  { day: 3, id: "weekly", repeat: "week", text: "Отчёт по закупкам", time: "10:00" },
  { day: 4, id: "scanners", text: "Проверить, привезли ли сканеры", time: "12:00" },
  { day: 11, id: "rent", repeat: "month", text: "Оплатить аренду", time: "12:00" },
  { day: 18, id: "domain", repeat: "year", text: "Продлить домен компании", time: "11:00" },
];

export const dayAt = (offset: number) => addDays(startOfDay(new Date()), offset);

export const dayName = (offset: number) => {
  if (offset === 0) return "Сегодня";
  if (offset === 1) return "Завтра";
  if (offset === -1) return "Вчера";
  return format(dayAt(offset), "EEEEEE, d MMMM", { locale: ru }).replace(/^./u, (c) => c.toUpperCase());
};

export const shortDay = (offset: number) => (offset === 0 ? "сегодня" : offset === 1 ? "завтра" : format(dayAt(offset), "EEEEEE, d MMM", { locale: ru }));

/** «каждую неделю, пн» — как повтор читается в строке. */
export const repeatLabel = (repeat: RepeatKind, day: number) => {
  const at = dayAt(day);
  switch (repeat) {
    case "day":
      return "каждый день";
    case "weekdays":
      return "по будням";
    case "week":
      return `каждую неделю, ${format(at, "EEEEEE", { locale: ru })}`;
    case "month":
      return `каждый месяц, ${format(at, "d")}-го`;
    default:
      return `каждый год, ${format(at, "d MMMM", { locale: ru })}`;
  }
};

/** Следующий раз после дня `day`. */
export const nextOf = (repeat: RepeatKind, day: number) => {
  if (repeat === "day") return day + 1;
  if (repeat === "weekdays") {
    let next = day + 1;
    while ([0, 6].includes(getDay(dayAt(next)))) next += 1;
    return next;
  }
  if (repeat === "week") return day + 7;
  if (repeat === "month") {
    const at = dayAt(day);
    const next = new Date(at.getFullYear(), at.getMonth() + 1, at.getDate());
    return Math.round((next.getTime() - dayAt(0).getTime()) / 86_400_000);
  }
  const at = dayAt(day);
  return Math.round((new Date(at.getFullYear() + 1, at.getMonth(), at.getDate()).getTime() - dayAt(0).getTime()) / 86_400_000);
};

/** Ближайшие разы повтора начиная с `day` в пределах `until` дней. */
export const occurrences = (r: Reminder, until: number) => {
  if (!r.repeat) return [r.day];
  const out: number[] = [];
  for (let d = r.day; d <= until && out.length < 30; d = nextOf(r.repeat, d)) out.push(d);
  return out;
};

/** Ручки: после отправки — само / ждёт; напоминаний много или нет. */
export const useWorld = () => {
  const { knobs } = useProto();
  return { autoClose: knobs.close !== "wait", empty: knobs.list === "none" };
};

export type Edit = { mode: "new" } | { mode: "edit"; reminder: Reminder } | null;

/** Список напоминаний прототипа: «Готово», «Через час», «Завтра», правка — память не трогается. */
export const useReminders = () => {
  const { say } = useProto();
  const { autoClose, empty } = useWorld();
  const [list, setList] = useState<Reminder[]>(SEED);
  const [edit, setEdit] = useState<Edit>(null);
  const put = (id: string, patch: Partial<Reminder>) => setList((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const before = () => {
    const was = list;
    return () => setList(was);
  };
  // Простое отправленное при «закрывается само» уже закрыто: в списке его нет.
  const shown = empty ? [] : list.filter((r) => !r.done && !(autoClose && r.sent && !r.card && !r.repeat));
  const closedBySend = empty ? [] : list.filter((r) => autoClose && r.sent && !r.card && !r.repeat && !r.done);
  return {
    closedBySend,
    edit,
    list: shown,
    actions: {
      done: (r: Reminder) => {
        const undo = before();
        if (r.repeat) {
          const next = nextOf(r.repeat, r.day);
          put(r.id, { day: next, sent: false });
          say(`Следующее — ${shortDay(next)} в ${r.time}`, undo);
        } else {
          put(r.id, { done: true });
          say("Готово", undo);
        }
      },
      later: (r: Reminder, hours: number) => {
        const undo = before();
        put(r.id, { day: hours >= 24 ? Math.max(r.day, 0) + 1 : r.day, sent: false });
        say(hours >= 24 ? `Напомню завтра в ${r.time}` : "Напомню через час", undo);
      },
      open: (r: Reminder | null) => setEdit(r ? { mode: "edit", reminder: r } : { mode: "new" }),
      close: () => setEdit(null),
      remove: (r: Reminder) => {
        const undo = before();
        setList((l) => l.filter((x) => x.id !== r.id));
        setEdit(null);
        say("Удалено", undo);
      },
      reopen: (r: Reminder) => {
        put(r.id, { day: 0, sent: false, time: "17:00" });
        say("Напомню сегодня в 17:00");
      },
      save: (r: Reminder) => {
        setList((l) => (l.some((x) => x.id === r.id) ? l.map((x) => (x.id === r.id ? r : x)) : [...l, r]));
        setEdit(null);
        say(r.repeat ? `Будет напоминать ${repeatLabel(r.repeat, r.day)} в ${r.time}` : `Напомню ${shortDay(r.day)} в ${r.time}`);
      },
    },
  };
};

export type Actions = ReturnType<typeof useReminders>["actions"];

// ── Части строки ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const RepeatTag = ({ r, className }: { r: Reminder; className?: string }) =>
  r.repeat ? (
    <span className={cn("text-muted-foreground inline-flex items-center gap-1 text-xs", className)}>
      <Repeat className="size-3" />
      {repeatLabel(r.repeat, r.day)}
    </span>
  ) : null;

export const CardTag = ({ r }: { r: Reminder }) =>
  r.card ? (
    <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs">
      <UserRound className="size-3 shrink-0" />
      <span className="truncate">{r.card}</span>
    </span>
  ) : null;

/** Что можно сделать с напоминанием: «Готово» на виду, остальное — в меню. */
export const RowActions = ({ r, actions, always }: { r: Reminder; actions: Actions; always?: boolean }) => (
  <div className={cn("flex shrink-0 items-center gap-0.5", !always && "@lg:opacity-0 @lg:transition-opacity @lg:duration-150 @lg:group-hover:opacity-100 @lg:group-focus-within:opacity-100")}>
    <Button aria-label={r.repeat ? "Готово, до следующего раза" : "Готово"} className={PRESS} onClick={() => actions.done(r)} size="icon-sm" title={r.repeat ? "Готово, до следующего раза" : "Готово"} variant="ghost">
      <Check />
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label="Ещё" className={PRESS} size="icon-sm" variant="ghost" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => actions.later(r, 1)}>
          <Clock /> Через час
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.later(r, 24)}>
          <CalendarClock /> Завтра
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.open(r)}>
          <Bell /> Изменить…
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => actions.remove(r)}>
          <Trash2 /> Удалить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

export const AddButton = ({ actions, className }: { actions: Actions; className?: string }) => (
  <Button className={cn(PRESS, className)} onClick={() => actions.open(null)} size="sm" variant="outline">
    <Plus /> Напоминание
  </Button>
);

/** Пусто: что сюда попадает и как добавить. */
export const Empty = ({ actions }: { actions: Actions }) => (
  <div className={cn("text-muted-foreground mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center text-sm", ENTER)}>
    <Bell className="size-5" />
    <p>
      Напишите в чате «напомни завтра в 10 позвонить в банк» или «каждый понедельник в 10 — отчёт по закупкам» — напоминание
      появится здесь и придёт в Telegram или на почту.
    </p>
    <AddButton actions={actions} />
  </div>
);

/** Закрылись сами после отправки — одна строка внизу, «Вернуть» на случай, если не сделано. */
export const ClosedBySend = ({ list, actions }: { list: Reminder[]; actions: Actions }) =>
  list.length > 0 ? (
    <div className="text-muted-foreground flex flex-col gap-1 border-t pt-3 text-xs">
      <span>Пришли и закрылись сами</span>
      {list.map((r) => (
        <div className="flex items-center gap-2" key={r.id}>
          <Check className="size-3" />
          <span className="min-w-0 flex-1 truncate line-through decoration-1">{r.text}</span>
          <span className="tabular-nums">
            {shortDay(r.day)}, {r.time}
          </span>
          <button className="hover:text-foreground underline-offset-2 hover:underline" onClick={() => actions.reopen(r)} type="button">
            Не сделано
          </button>
        </div>
      ))}
    </div>
  ) : null;

// ── Окно «Строки» с повтором ─────────────────────────────────────────────────────────────────────────────────────────

const REPEATS: (RepeatKind | null)[] = [null, "day", "weekdays", "week", "month", "year"];

const Line = ({ icon: Icon, children }: { icon: typeof Bell; children: React.ReactNode }) => (
  <div className="flex min-h-9 items-center gap-3 text-sm">
    <Icon className="text-muted-foreground size-4 shrink-0" />
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{children}</div>
  </div>
);

const fresh = (): Reminder => ({ day: 0, id: `new-${Date.now()}`, text: "", time: "17:00" });

/** Окно напоминания — как «Строки» в календаре, и строка «Повторять» под временем. */
export const ReminderWindow = ({ edit, actions }: { edit: Edit; actions: Actions }) => {
  const [draft, setDraft] = useState<Reminder>(() => (edit?.mode === "edit" ? edit.reminder : fresh()));
  if (!edit) return null;
  const set = (patch: Partial<Reminder>) => setDraft((d) => ({ ...d, ...patch }));
  const editing = edit.mode === "edit";
  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/30 px-4 pt-[12vh]" onClick={actions.close}>
      <div className={cn("bg-background flex w-full max-w-md flex-col gap-4 rounded-xl border p-5 pb-4 shadow-lg", ENTER)} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <span className="text-muted-foreground text-xs">{editing ? (draft.card ? "Обещание" : "Напоминание") : "Новое напоминание"}</span>
          <button aria-label="Закрыть" className="text-muted-foreground hover:text-foreground -me-1 -mt-1 p-1" onClick={actions.close} type="button">
            <X className="size-4" />
          </button>
        </div>
        <input
          autoFocus
          className="placeholder:text-muted-foreground/50 w-full bg-transparent text-lg font-medium outline-none"
          onChange={(e) => set({ text: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && draft.text.trim() && actions.save(draft)}
          placeholder="О чём напомнить"
          value={draft.text}
        />
        <div className="flex flex-col">
          {draft.card && (
            <Line icon={UserRound}>
              <span className="px-2.5">{draft.card}</span>
            </Line>
          )}
          <Line icon={Bell}>
            <DayButton onChange={(day) => set({ day })} value={draft.day} variant="ghost" />
            <TimeField className="w-24 border-0 shadow-none" onChange={(time) => set({ time })} value={draft.time} />
          </Line>
          <Line icon={Repeat}>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button className={cn("font-normal", !draft.repeat && "text-muted-foreground")} variant="ghost" />}>
                {draft.repeat ? repeatLabel(draft.repeat, draft.day) : "Не повторять"}
                <ChevronDown className="opacity-50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {REPEATS.map((k) => (
                  <DropdownMenuItem key={k ?? "none"} onClick={() => set({ repeat: k ?? undefined })}>
                    {k ? repeatLabel(k, draft.day) : "Не повторять"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Line>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          {editing ? (
            <div className="flex gap-1">
              <Button aria-label="Готово" className={PRESS} onClick={() => actions.done(draft)} size="icon-sm" title="Готово" variant="ghost">
                <Check />
              </Button>
              <Button aria-label="Удалить" className={cn("text-destructive", PRESS)} onClick={() => actions.remove(draft)} size="icon-sm" title="Удалить" variant="ghost">
                <Trash2 />
              </Button>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">Enter — добавить</span>
          )}
          <Button className={PRESS} disabled={!draft.text.trim()} onClick={() => actions.save(draft)}>
            {editing ? "Сохранить" : "Добавить"}
          </Button>
        </div>
      </div>
    </div>
  );
};
