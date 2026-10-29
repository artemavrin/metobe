"use client";

import { Button } from "@metobe/ui/components/button";
import { Calendar } from "@metobe/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { ru } from "react-day-picker/locale";

import { TODAY } from "./data";
import { periodOf, shiftDay, stepAnchor } from "./period";
import type { Span } from "./period";
import { useProto } from "./state";
import { Segmented, useNarrow } from "./ui";

// The period: «День · Неделя · Месяц», each stepped with ‹ ›, and «Период» — ReUI's range calendar with presets
// (reui.io, c-calendar-29): the common ranges on the left, any range on the calendar — two months on a computer, one
// on a phone with the presets as a row of chips above it. A preset that is a day, a week or a month becomes that span,
// so its ‹ › keep working; any other range is «Период» and has no arrows.

const SPANS: [Span, string][] = [
  ["day", "День"],
  ["week", "Неделя"],
  ["month", "Месяц"],
];

/** The first day there is data for: the calendar offers nothing before it. */
const FIRST = "2026-08-01";

const toDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, day);
};
const toKey = (d: Date) => format(d, "yyyy-MM-dd");

interface Preset {
  label: string;
  span: Span;
  anchor: string;
  custom?: { from: string; to: string };
}

const PRESETS: Preset[] = [
  { anchor: TODAY, label: "Сегодня", span: "day" },
  { anchor: shiftDay(TODAY, -1), label: "Вчера", span: "day" },
  { anchor: TODAY, label: "Эта неделя", span: "week" },
  { anchor: shiftDay(TODAY, -7), label: "Прошлая неделя", span: "week" },
  { anchor: TODAY, custom: { from: shiftDay(TODAY, -6), to: TODAY }, label: "Последние 7 дней", span: "custom" },
  { anchor: TODAY, custom: { from: shiftDay(TODAY, -29), to: TODAY }, label: "Последние 30 дней", span: "custom" },
  { anchor: TODAY, label: "Этот месяц", span: "month" },
  { anchor: `${shiftDay(`${TODAY.slice(0, 7)}-01`, -1).slice(0, 7)}-01`, label: "Прошлый месяц", span: "month" },
  { anchor: TODAY, custom: { from: shiftDay(TODAY, -89), to: TODAY }, label: "Последние 90 дней", span: "custom" },
];

const RangePicker = () => {
  const { span, period, setPeriod } = useProto();
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => toDate(period.to));
  // While a range is being picked: its first day, before the second one is clicked.
  const [draft, setDraft] = useState<DateRange | undefined>();
  const selected: DateRange = draft ?? { from: toDate(period.from), to: toDate(period.to) };
  const isCurrent = (p: Preset) => {
    const q = periodOf(p.span, p.anchor, p.custom);
    return q.from === period.from && q.to === period.to;
  };
  const pick = (p: Preset) => {
    setPeriod(p.span, p.anchor, p.custom);
    setDraft(undefined);
    setOpen(false);
  };
  return (
    <Popover
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft(undefined);
          setMonth(toDate(narrow ? period.to : shiftDay(`${period.to.slice(0, 7)}-01`, -1)));
        }
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <Button aria-label="Выбрать период" className={cn(span === "custom" && "bg-muted")} size={narrow ? "icon" : "default"} variant="outline">
            <CalendarDays />
            {!narrow && "Период"}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-auto max-w-[calc(100vw-1rem)] gap-0 p-0">
        <div className="flex max-sm:flex-col">
          {narrow ? (
            <div className="flex gap-1.5 overflow-x-auto border-b p-2 [scrollbar-width:none]">
              {PRESETS.map((p) => (
                <button
                  className={cn("shrink-0 rounded-full border px-3 py-1 text-xs transition-colors", isCurrent(p) ? "bg-foreground text-background border-transparent" : "hover:bg-muted")}
                  key={p.label}
                  onClick={() => pick(p)}
                  type="button"
                >
                  {p.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex w-40 shrink-0 flex-col gap-0.5 border-e p-2">
              {PRESETS.map((p) => (
                <Button className={cn("w-full justify-start font-normal", isCurrent(p) && "bg-muted font-medium")} key={p.label} onClick={() => pick(p)} size="sm" variant="ghost">
                  {p.label}
                </Button>
              ))}
            </div>
          )}
          <div className="flex flex-col items-center">
            <Calendar
              className={narrow ? "[--cell-size:--spacing(10)]" : undefined}
              disabled={[{ after: toDate(TODAY) }, { before: toDate(FIRST) }]}
              locale={ru}
              mode="range"
              month={month}
              numberOfMonths={narrow ? 1 : 2}
              onMonthChange={setMonth}
              onSelect={(range, day) => {
                // The first click starts a range; the second closes it and shows it.
                if (!draft) {
                  setDraft({ from: day, to: undefined });
                  return;
                }
                const from = range?.from ?? day;
                const to = range?.to ?? from;
                setDraft(undefined);
                const a = toKey(from);
                const b = toKey(to);
                setPeriod("custom", b, { from: a < b ? a : b, to: a < b ? b : a });
                setOpen(false);
              }}
              selected={selected}
            />
            <p className="text-muted-foreground self-start px-3 pb-3 text-xs">{draft ? "Теперь последний день" : "Первый день, затем последний"}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** ‹ the period › — a range from the calendar has no arrows: it is neither a day, a week nor a month. */
const Stepper = () => {
  const { span, anchor, period, setPeriod } = useProto();
  const stepped = span !== "custom";
  return (
    <div className="flex min-w-0 items-center gap-1">
      {stepped && (
        <Button aria-label="Назад" disabled={period.from <= FIRST} onClick={() => setPeriod(span, stepAnchor(span, anchor, -1))} size="icon-sm" variant="ghost">
          <ChevronLeft />
        </Button>
      )}
      <span className={cn("truncate text-sm font-medium first-letter:uppercase", stepped ? "min-w-28 text-center" : "px-1")}>
        {period.label}
        {period.partial && span === "month" && <span className="text-muted-foreground font-normal"> · по {Number(period.to.slice(8))}-е</span>}
      </span>
      {stepped && (
        <Button
          aria-label="Вперёд"
          disabled={!period.canNext}
          // Stepping into the period with today lands on today: «Месяц» → this month so far, «День» → today.
          onClick={() => {
            const next = stepAnchor(span, anchor, 1);
            setPeriod(span, next > TODAY ? TODAY : next);
          }}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronRight />
        </Button>
      )}
    </div>
  );
};

/** The span's switch, the calendar beside it, the period with its arrows. A phone: the switch on its own row first. */
export const PeriodBar = () => {
  const { span, period, setPeriod } = useProto();
  const narrow = useNarrow();
  // Another span keeps the place: the day, week or month of the period's last day.
  const switchTo = (s: Span) => setPeriod(s, period.to);
  const spans = <Segmented items={SPANS} onChange={switchTo} value={span === "custom" ? ("" as Span) : span} />;
  if (narrow) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 [&_[data-slot=tabs-list]]:w-full [&_[data-slot=tabs]]:w-full">{spans}</div>
          <RangePicker />
        </div>
        <Stepper />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Stepper />
      <div className="flex items-center gap-2">
        {spans}
        <RangePicker />
      </div>
    </div>
  );
};
