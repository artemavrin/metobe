"use client";

import { Button } from "@metobe/ui/components/button";
import { Calendar } from "@metobe/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { TimePicker } from "@metobe/ui/components/reui/time-picker";
import { cn } from "@metobe/ui/lib/utils";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";

import { ENTER, Shell, usePhone, useProto } from "../memory/frame";

// Общее для вариантов окна «Новое обещание / Напоминание / Обещание» в календаре (диалог из P27): чем это окно может
// быть. Одна форма на всех — то же, что в рабочем окне: что, чьё и кому, срок, напоминание (день и время).

export type Mode = "promise" | "reminder" | "edit";

export interface Draft {
  kind: "promise" | "reminder";
  text: string;
  side: "mine" | "theirs";
  card: string | null;
  /** Смещение дня от сегодня: срок обещания или день напоминания. */
  day: number;
  remind: boolean;
  /** День напоминания обещания (у напоминания день — `day`). */
  remindDay: number;
  time: string;
}

export const CARDS = [
  { id: "olga", name: "Ольга Ли" },
  { id: "igor", name: "Игорь Белов" },
  { id: "vector", name: "ООО «Вектор»" },
];

const SEEDS: Record<Mode, Draft> = {
  edit: { card: "olga", day: 2, kind: "promise", remind: true, remindDay: 1, side: "theirs", text: "Прислать смету на склад", time: "09:30" },
  promise: { card: null, day: 2, kind: "promise", remind: false, remindDay: 2, side: "mine", text: "", time: "10:00" },
  reminder: { card: null, day: 0, kind: "reminder", remind: true, remindDay: 0, side: "mine", text: "", time: "17:00" },
};

export const useDraft = () => {
  const { knobs } = useProto();
  const mode = (knobs.mode ?? "promise") as Mode;
  const [draft, setDraft] = useState<Draft>(SEEDS[mode]);
  useEffect(() => setDraft(SEEDS[mode]), [mode]);
  return { draft, mode, set: (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })) };
};

export const dayAt = (offset: number) => addDays(startOfDay(new Date()), offset);

export const dayLabel = (offset: number) => {
  if (offset === 0) return "сегодня";
  if (offset === 1) return "завтра";
  return format(dayAt(offset), "EEE, d MMM", { locale: ru });
};

export const nameOf = (id: string | null) => CARDS.find((c) => c.id === id)?.name ?? null;

const TIME_LABELS = {
  clear: "Очистить",
  confirm: "Готово",
  hour: "Часы",
  minute: "Минуты",
  now: "Сейчас",
  openPicker: "Время",
  panelLabel: "Время",
  placeholder: "--:--",
};

/** День кнопкой, которая открывает месяц. */
export const DayButton = ({
  value,
  onChange,
  className,
  prefix,
  variant = "outline",
}: {
  value: number;
  onChange: (offset: number) => void;
  className?: string;
  prefix?: string;
  variant?: "outline" | "ghost" | "secondary";
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger render={<Button className={cn("justify-start font-normal", className)} variant={variant} />}>
        <CalendarDays />
        {prefix}
        {dayLabel(value)}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={dayAt(value)}
          locale={ru}
          mode="single"
          onSelect={(date) => {
            if (date) {
              onChange(differenceInCalendarDays(date, startOfDay(new Date())));
              setOpen(false);
            }
          }}
          selected={dayAt(value)}
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  );
};

export const TimeField = ({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (time: string) => void;
  className?: string;
}) => (
  <TimePicker
    aria-label="Время"
    className={cn("w-28", className)}
    hourCycle={24}
    i18n={{ labels: TIME_LABELS }}
    minuteStep={5}
    onValueChange={(time) => time && onChange(time)}
    value={value}
  />
);

// ── Календарь вокруг ─────────────────────────────────────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);
const ROW = 3;
const TODAY_COL = 3;
const EVENTS = [
  { col: 1, label: "Прислать договор", time: "11:00" },
  { col: 3, label: "Позвонить в банк", time: "08:30" },
  { col: 3, label: "Выслать акт сверки", time: "14:00" },
  { col: 4, label: "Встреча с Ольгой", time: "12:00" },
  { col: 5, label: "Подготовить отчёт", time: "16:00" },
];

export const topOf = (time: string) => {
  const [h = "8", m = "0"] = time.split(":");
  return `${(Number(h) + Number(m) / 60 - 8) * ROW}rem`;
};

const Chip = ({ time, children, ghost }: { time: string; children: React.ReactNode; ghost?: boolean }) => (
  <div
    className={cn(
      "absolute inset-x-1 flex h-[1.6rem] items-center gap-1 truncate rounded-md px-1.5 text-xs",
      ghost
        ? "bg-primary/15 text-primary ring-primary/60 z-10 ring-1"
        : "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    )}
    style={{ top: topOf(time) }}
  >
    <span className="truncate font-medium">{children}</span>
    <span className="text-muted-foreground ms-auto shrink-0">{time}</span>
  </div>
);

/** Неделя из заготовок — то, что видно за окном. `ghost` — черновик, что стоит в сетке сейчас. */
export const FauxWeek = ({
  ghost,
  anchor,
  children,
  className,
}: {
  ghost?: { day: number; time: string; label: string } | null;
  /** Колонка и время, у которых открыто окно (для поповера): ячейка подсвечена, окно — её ребёнок. */
  anchor?: { day: number; time: string } | null;
  children?: React.ReactNode;
  className?: string;
}) => {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i - TODAY_COL));
  const ghostCol = ghost ? TODAY_COL + ghost.day : -1;
  const anchorCol = anchor ? TODAY_COL + anchor.day : -1;
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3 p-6", className)}>
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-medium">Календарь</h1>
        <span className="text-muted-foreground text-sm">9–15 ноября 2026</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[3rem_repeat(7,minmax(0,1fr))] content-start overflow-y-auto rounded-xl border text-sm">
        <div className="border-b" />
        {days.map((d, i) => (
          <div className={cn("border-s border-b px-2 py-1.5 text-xs", i === TODAY_COL && "text-primary font-medium")} key={d.toISOString()}>
            {format(d, "EEE d", { locale: ru })}
          </div>
        ))}
        <div className="text-muted-foreground flex flex-col text-xs">
          {HOURS.map((h) => (
            <span className="px-2 pt-1" key={h} style={{ height: `${ROW}rem` }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {days.map((d, col) => (
          <div className="relative border-s" key={d.toISOString()}>
            {HOURS.map((h) => (
              <div className="border-b" key={h} style={{ height: `${ROW}rem` }} />
            ))}
            {EVENTS.filter((e) => e.col === col).map((e) => (
              <Chip key={e.label} time={e.time}>
                {e.label}
              </Chip>
            ))}
            {col === ghostCol && ghost && (
              <Chip ghost time={ghost.time}>
                {ghost.label || "Новое"}
              </Chip>
            )}
            {col === anchorCol && anchor && (
              <>
                <div className="bg-primary/10 ring-primary/40 absolute inset-x-0 h-12 ring-1 ring-inset" style={{ top: topOf(anchor.time) }} />
                {children}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Приложение вокруг; окно поверх — `overlay` затемняет (модальное) или нет (поповер, панель). */
export const Stage = ({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) => {
  const phone = usePhone();
  return (
    <Shell area="memory" title="Календарь">
      <FauxWeek />
      <div className={cn(phone ? "absolute" : "fixed", "inset-0 z-40 grid place-items-start justify-items-center pt-[14vh]", dim && "bg-black/40")}>
        {children}
      </div>
    </Shell>
  );
};

export const Window = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("bg-popover text-popover-foreground w-[26rem] max-w-[calc(100%-2rem)] rounded-2xl border shadow-2xl", ENTER, className)} role="dialog">
    {children}
  </div>
);
