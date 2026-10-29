"use client";

import { Button } from "@metobe/ui/components/button";
import { Calendar } from "@metobe/ui/components/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { enUS, ru } from "react-day-picker/locale";

import { periodOf, shiftDay, stepAnchor } from "@/lib/usage-period";
import type { PeriodParams, Span } from "@/lib/usage-period";

import { useNarrow, useUsage, useUsageFormat } from "./usage-context";
import { Segmented } from "./usage-parts";

// The period: «День · Неделя · Месяц», each stepped with ‹ ›, and «Период» — ReUI's range calendar with presets
// (reui.io, c-calendar-29): the common ranges on the left, any range on the calendar — two months on a computer, one
// on a phone with the presets as a row of chips above it. A preset that is a day, a week or a month becomes that span,
// so its ‹ › keep working; any other range has no arrows.

type PresetKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "last90";

const presetsOf = (today: string): [PresetKey, PeriodParams][] => {
  const last = (days: number): PeriodParams => ({
    anchor: today,
    range: { from: shiftDay(today, -(days - 1)), to: today },
    span: "range",
  });
  return [
    ["today", { anchor: today, span: "day" }],
    ["yesterday", { anchor: shiftDay(today, -1), span: "day" }],
    ["thisWeek", { anchor: today, span: "week" }],
    ["lastWeek", { anchor: shiftDay(today, -7), span: "week" }],
    ["last7", last(7)],
    ["last30", last(30)],
    ["thisMonth", { anchor: today, span: "month" }],
    [
      "lastMonth",
      { anchor: shiftDay(`${today.slice(0, 7)}-01`, -1), span: "month" },
    ],
    ["last90", last(90)],
  ];
};

const toDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, day);
};
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const RangePicker = () => {
  const { period, today, first, weekStart, go } = useUsage();
  const t = useTranslations("usage");
  const locale = useLocale();
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => toDate(period.to));
  // While a range is being picked: its first day, before the second one is clicked.
  const [draft, setDraft] = useState<DateRange | undefined>();
  const selected: DateRange = draft ?? {
    from: toDate(period.from),
    to: toDate(period.to),
  };
  const presets = presetsOf(today);
  const isCurrent = (p: PeriodParams) => {
    const q = periodOf(p, today, weekStart);
    return q.from === period.from && q.to === period.to;
  };
  const pick = (p: PeriodParams) => {
    go(p);
    setDraft(undefined);
    setOpen(false);
  };
  return (
    <Popover
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft(undefined);
          setMonth(
            toDate(
              narrow ? period.to : shiftDay(`${period.to.slice(0, 7)}-01`, -1)
            )
          );
        }
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <Button
            aria-label={t("pickRange")}
            className={cn(period.span === "range" && "bg-muted")}
            size={narrow ? "icon" : "default"}
            variant="outline"
          >
            <CalendarDays />
            {!narrow && t("range")}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-auto max-w-[calc(100vw-1rem)] gap-0 p-0"
      >
        <div className="flex max-sm:flex-col">
          {narrow ? (
            <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto border-b p-2">
              {presets.map(([k, p]) => (
                <button
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                    isCurrent(p)
                      ? "bg-foreground text-background border-transparent"
                      : "hover:bg-muted"
                  )}
                  key={k}
                  onClick={() => pick(p)}
                  type="button"
                >
                  {t(`presets.${k}`)}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex w-40 shrink-0 flex-col gap-0.5 border-e p-2">
              {presets.map(([k, p]) => (
                <Button
                  className={cn(
                    "w-full justify-start font-normal",
                    isCurrent(p) && "bg-muted font-medium"
                  )}
                  key={k}
                  onClick={() => pick(p)}
                  size="sm"
                  variant="ghost"
                >
                  {t(`presets.${k}`)}
                </Button>
              ))}
            </div>
          )}
          <div className="flex flex-col items-center">
            <Calendar
              className={narrow ? "[--cell-size:--spacing(10)]" : undefined}
              disabled={[
                { after: toDate(today) },
                ...(first ? [{ before: toDate(first) }] : []),
              ]}
              locale={locale === "ru" ? ru : enUS}
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
                const a = toKey(range?.from ?? day);
                const b = toKey(range?.to ?? range?.from ?? day);
                const [from, to] = a < b ? [a, b] : [b, a];
                pick({ anchor: to, range: { from, to }, span: "range" });
              }}
              selected={selected}
              weekStartsOn={(weekStart % 7) as 0 | 1 | 6}
            />
            <p className="text-muted-foreground self-start px-3 pb-3 text-xs">
              {draft ? t("pickLast") : t("pickFirst")}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** The period in words: «Сегодня», «26 окт – 1 нояб», «Октябрь 2026». */
const usePeriodLabel = () => {
  const { period, today } = useUsage();
  const t = useTranslations("usage");
  const f = useUsageFormat();
  if (period.span === "day") {
    if (period.from === today) {
      return t("today");
    }
    return period.from === shiftDay(today, -1)
      ? t("yesterday")
      : f.day(period.from, true);
  }
  if (period.span === "month") {
    return f.month(period.from);
  }
  return f.range(period.from, period.span === "week" ? period.end : period.to);
};

/** ‹ the period › — a range from the calendar has no arrows: it is neither a day, a week nor a month. */
const Stepper = () => {
  const { period, today, first, go } = useUsage();
  const t = useTranslations("usage");
  const f = useUsageFormat();
  const label = usePeriodLabel();
  const stepped = period.span !== "range";
  return (
    <div className="flex min-w-0 items-center gap-1">
      {stepped && (
        <Button
          aria-label={t("previous")}
          disabled={first !== null && period.from <= first}
          onClick={() =>
            go({ anchor: stepAnchor(period, -1, today), span: period.span })
          }
          size="icon-sm"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
      )}
      <span
        className={cn(
          "truncate text-sm font-medium first-letter:uppercase",
          stepped ? "min-w-28 text-center" : "px-1"
        )}
      >
        {label}
        {period.span === "month" && period.to < period.end && (
          <span className="text-muted-foreground font-normal">
            {" · "}
            {t("through", { date: f.day(period.to) })}
          </span>
        )}
      </span>
      {stepped && (
        <Button
          aria-label={t("next")}
          disabled={!period.canNext}
          onClick={() =>
            go({ anchor: stepAnchor(period, 1, today), span: period.span })
          }
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
  const { period, go } = useUsage();
  const t = useTranslations("usage.span");
  const narrow = useNarrow();
  // Another span keeps the place: the day, week or month of the period's last day.
  const spans = (
    <Segmented
      items={(["day", "week", "month"] as const).map(
        (s) => [s, t(s)] as [Span, string]
      )}
      onChange={(s) => go({ anchor: period.to, span: s })}
      value={period.span === "range" ? ("" as Span) : period.span}
    />
  );
  if (narrow) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 [&_[data-slot=tabs-list]]:w-full [&_[data-slot=tabs]]:w-full">
            {spans}
          </div>
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
