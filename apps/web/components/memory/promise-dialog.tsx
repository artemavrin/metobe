"use client";

import { reminderRepeats } from "@metobe/contracts/memory";
import type {
  MemoryCardItem,
  MemoryDue,
  ReminderRepeat,
} from "@metobe/contracts/memory";
import { localInstant } from "@metobe/core/memory-extract";
import { Button } from "@metobe/ui/components/button";
import { Calendar } from "@metobe/ui/components/calendar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metobe/ui/components/popover";
import { TimePicker } from "@metobe/ui/components/reui/time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { cn } from "@metobe/ui/lib/utils";
import { format } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import {
  Bell,
  CalendarDays,
  Check,
  Repeat,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { dayKey } from "@/lib/memory-dates";

// «Новое обещание», «Новое напоминание» and «Обещание» in the calendar (ReUI's Event Calendar 3: one dialog for all).
// A click on an empty day or hour opens it for a new one; a click on a bar, for that one. The look is «Строки» (the
// prototype memory-promise-dialog): the title is typed straight into the top field, each line is an icon and a value,
// the kind is two words, not a switch. The deadline is a day; a reminder is a day and a time of its own — in the
// person's zone. Who owes is chosen when the promise is made and read-only after it (the cards' own page moves it).
// Done and delete are two icons in the footer, with «Вернуть» in the toast. A reminder can come again («Повторять»,
// P29): every day, on working days, every week, month or year — counted from its day.

type Row = MemoryDue["rows"][number];

export interface PromiseDraft {
  /** The record being edited; null — a new promise. */
  id: string | null;
  /** A new one is a promise or only a reminder: a time, and nobody's deadline. */
  kind: "promise" | "reminder";
  text: string;
  side: "mine" | "theirs";
  /** The other side's card. */
  card: string | null;
  /** The deadline's day, `2026-11-12`. */
  day: string;
  remind: boolean;
  remindDay: string;
  /** `HH:mm`. */
  time: string;
  /** How often the reminder comes again; null — once. */
  repeat: ReminderRepeat | null;
}

const DEFAULT_TIME = "10:00";

/** A new promise on a day, with the reminder at a time if the click was on an hour. */
export const newDraft = (day: string, time?: string): PromiseDraft => ({
  card: null,
  day,
  id: null,
  // An hour clicked is a time to be told at: a reminder; a day clicked, a promise.
  kind: time ? "reminder" : "promise",
  remind: Boolean(time),
  remindDay: day,
  repeat: null,
  side: "mine",
  text: "",
  time: time ?? DEFAULT_TIME,
});

/** An existing promise as the dialog holds it. */
export const draftOf = (row: Row, timeZone: string): PromiseDraft => {
  const day = dayKey(new Date(row.dueAt), timeZone);
  const at = row.remindAt ? new Date(row.remindAt) : null;
  return {
    card: row.who?.id ?? null,
    day,
    id: row.id,
    // The person's own, owed to nobody, with a time: a reminder — only its time and repeat are shown.
    kind:
      row.side === "mine" && !row.who && row.remindAt ? "reminder" : "promise",
    remind: at !== null,
    remindDay: at ? dayKey(at, timeZone) : day,
    repeat: row.repeat,
    side: row.side === "theirs" ? "theirs" : "mine",
    text: row.text,
    time: at
      ? new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          hourCycle: "h23",
          minute: "2-digit",
          timeZone,
        }).format(at)
      : DEFAULT_TIME,
  };
};

/** The moment the reminder goes off, ISO; null when it is off or the time is not one. */
export const remindOf = (draft: PromiseDraft, timeZone: string) =>
  draft.remind
    ? (localInstant(draft.remindDay, draft.time, timeZone)?.toISOString() ??
      null)
    : null;

const toDate = (key: string) => new Date(`${key}T12:00:00`);

/** «каждую неделю, пн», «каждый месяц, 17-го»: how a repeat reads, counted from its day. */
export const useRepeatWords = () => {
  const t = useTranslations("memory");
  const locale = useLocale();
  const dates = locale === "ru" ? ru : enUS;
  return (
    repeat: ReminderRepeat | null,
    day: string,
    /** A week's chosen weekdays, 0 is Sunday: «по пн, ср, пт». */
    days?: readonly number[] | null
  ) => {
    const at = toDate(day);
    if (repeat === "week" && days && days.length > 1) {
      // Monday first; a Monday to name each weekday by (16 November 2026).
      const names = [...days]
        // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy; toSorted is past the ES2022 target
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) =>
          format(new Date(2026, 10, 16 + ((d + 6) % 7)), "EEEEEE", {
            locale: dates,
          })
        );
      return t("repeatOnDays", { days: names.join(", ") });
    }
    switch (repeat) {
      case null: {
        return t("repeatNone");
      }
      case "day": {
        return t("repeatDay");
      }
      case "weekdays": {
        return t("repeatWeekdays");
      }
      case "week": {
        return t("repeatWeek", {
          weekday: format(at, "EEEEEE", { locale: dates }),
        });
      }
      case "month": {
        return t("repeatMonth", { day: at.getDate() });
      }
      default: {
        return t("repeatYear", {
          date: format(at, "d MMMM", { locale: dates }),
        });
      }
    }
  };
};
const toKey = (date: Date) => format(date, "yyyy-MM-dd");

type Change = (patch: Partial<PromiseDraft>) => void;

/** A day as a button that opens a month to pick it from. */
const DayField = ({
  label,
  prefix,
  value,
  onChange,
}: {
  label: string;
  prefix?: string;
  value: string;
  onChange: (day: string) => void;
}) => {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={label}
            className="justify-start font-normal"
            variant="ghost"
          />
        }
      >
        {prefix ? `${prefix} ` : ""}
        {format(toDate(value), "EEE, d MMM yyyy", {
          locale: locale === "ru" ? ru : enUS,
        })}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={toDate(value)}
          locale={locale === "ru" ? ru : enUS}
          mode="single"
          onSelect={(date) => {
            if (date) {
              onChange(toKey(date));
              setOpen(false);
            }
          }}
          selected={toDate(value)}
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  );
};

/** A line: an icon, and what it is about. */
const Line = ({
  icon: Icon,
  children,
}: {
  icon: typeof Bell;
  children: React.ReactNode;
}) => (
  <div className="flex min-h-9 items-center gap-3 text-sm">
    <Icon className="text-muted-foreground size-4 shrink-0" />
    <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
  </div>
);

/** What is being made: a promise (whose, by when) or a reminder (only when) — two words, the chosen one underlined. */
const KindTabs = ({
  draft,
  onChange,
}: {
  draft: PromiseDraft;
  onChange: Change;
}) => {
  const t = useTranslations("memory");
  return (
    <div className="flex gap-4 text-sm">
      {(["promise", "reminder"] as const).map((kind) => (
        <button
          className={cn(
            "-mb-px border-b-2 pb-1.5 transition-colors duration-150",
            draft.kind === kind
              ? "border-foreground font-medium"
              : "text-muted-foreground hover:text-foreground border-transparent"
          )}
          key={kind}
          onClick={() =>
            onChange(
              kind === "reminder"
                ? { kind, remind: true, remindDay: draft.day, side: "mine" }
                : { kind }
            )
          }
          type="button"
        >
          {t(kind === "promise" ? "kindPromise" : "kindReminder")}
        </button>
      ))}
    </div>
  );
};

const NOBODY = "none";

/** Who owes whom: a word that turns between «я обещал» and «мне обещали», and the card on the other side. */
const WhoLine = ({
  draft,
  cards,
  edit,
  onChange,
}: {
  draft: PromiseDraft;
  cards: MemoryCardItem[];
  edit: boolean;
  onChange: Change;
}) => {
  const t = useTranslations("memory");
  const named = cards.find((c) => c.id === draft.card)?.name;
  const mine = draft.side === "mine";
  const side = t(mine ? "promiseMine" : "promiseTheirs");
  if (edit) {
    return (
      <Line icon={UserRound}>
        <span className="px-2.5">{named ? `${side} · ${named}` : side}</span>
      </Line>
    );
  }
  return (
    <Line icon={UserRound}>
      <Button
        className="font-normal"
        onClick={() => onChange({ side: mine ? "theirs" : "mine" })}
        type="button"
        variant="ghost"
      >
        {side}
      </Button>
      <Select
        onValueChange={(v) =>
          onChange({ card: v === NOBODY ? null : (v as string) })
        }
        value={draft.card ?? NOBODY}
      >
        <SelectTrigger
          aria-label={t(mine ? "promiseWhoMine" : "promiseWhoTheirs")}
          className="w-auto border-0 shadow-none"
        >
          <SelectValue>
            {named ?? t(mine ? "promiseNobody" : "promiseWhoTheirs")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {mine && <SelectItem value={NOBODY}>{t("promiseNobody")}</SelectItem>}
          {cards.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Line>
  );
};

/** The reminder: «Напомнить…» turns it on; on, it is the day and the time it goes off, and a cross to take it off. */
const RemindLine = ({
  draft,
  onChange,
  fixed,
}: {
  draft: PromiseDraft;
  onChange: Change;
  /** A reminder is nothing without its time: always on, no cross. */
  fixed: boolean;
}) => {
  const t = useTranslations("memory");
  const s = useTranslations("settings.notifications");
  if (!draft.remind) {
    return (
      <Line icon={Bell}>
        <Button
          className="text-muted-foreground font-normal"
          onClick={() => onChange({ remind: true })}
          type="button"
          variant="ghost"
        >
          {t("promiseRemindAdd")}
        </Button>
      </Line>
    );
  }
  return (
    <Line icon={Bell}>
      <DayField
        label={t("promiseRemindDay")}
        onChange={(remindDay) => onChange({ remindDay })}
        value={draft.remindDay}
      />
      <TimePicker
        aria-label={t("promiseRemindTime")}
        className="w-24 border-0 shadow-none"
        hourCycle={24}
        i18n={{
          labels: {
            clear: s("timeClear"),
            confirm: s("timeOk"),
            hour: s("timeHour"),
            minute: s("timeMinute"),
            now: s("timeNow"),
            openPicker: t("promiseRemindTime"),
            panelLabel: t("promiseRemindTime"),
            placeholder: s("timePlaceholder"),
          },
        }}
        minuteStep={5}
        onValueChange={(time) => {
          if (time) {
            onChange({ time });
          }
        }}
        value={draft.time}
      />
      {fixed ? null : (
        <button
          aria-label={t("promiseRemindOff")}
          className="text-muted-foreground hover:text-foreground ms-auto p-1"
          onClick={() => onChange({ remind: false, repeat: null })}
          title={t("promiseRemindOff")}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      )}
    </Line>
  );
};

const ONCE = "once";

/** «Повторять»: under a reminder that is on — once, or how often it comes again. */
const RepeatLine = ({
  draft,
  onChange,
}: {
  draft: PromiseDraft;
  onChange: Change;
}) => {
  const t = useTranslations("memory");
  const words = useRepeatWords();
  return (
    <Line icon={Repeat}>
      <Select
        onValueChange={(v) =>
          onChange({ repeat: v === ONCE ? null : (v as ReminderRepeat) })
        }
        value={draft.repeat ?? ONCE}
      >
        <SelectTrigger
          aria-label={t("promiseRepeat")}
          className={cn(
            "w-auto border-0 shadow-none",
            !draft.repeat && "text-muted-foreground"
          )}
        >
          <SelectValue>{words(draft.repeat, draft.remindDay)}</SelectValue>
        </SelectTrigger>
        <SelectContent className="w-auto min-w-52">
          <SelectItem value={ONCE}>{words(null, draft.remindDay)}</SelectItem>
          {reminderRepeats.map((r) => (
            <SelectItem key={r} value={r}>
              {words(r, draft.remindDay)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Line>
  );
};

/** The lines a kind needs: whose it is and the deadline for a promise, the reminder for both. */
const PromiseLines = ({
  draft,
  edit,
  reminder,
  cards,
  onChange,
}: {
  draft: PromiseDraft;
  edit: boolean;
  reminder: boolean;
  cards: MemoryCardItem[];
  onChange: Change;
}) => {
  const t = useTranslations("memory");
  return (
    <div className="flex flex-col">
      {reminder ? null : (
        <WhoLine cards={cards} draft={draft} edit={edit} onChange={onChange} />
      )}
      {reminder ? null : (
        <Line icon={CalendarDays}>
          <DayField
            label={t("promiseDay")}
            onChange={(day) =>
              onChange({
                day,
                // A reminder that stood on the deadline's day goes with it.
                remindDay:
                  draft.remindDay === draft.day ? day : draft.remindDay,
              })
            }
            prefix={t("promiseDueBy")}
            value={draft.day}
          />
        </Line>
      )}
      <RemindLine draft={draft} fixed={reminder} onChange={onChange} />
      {draft.remind ? <RepeatLine draft={draft} onChange={onChange} /> : null}
    </div>
  );
};

/** What can be done with a promise that is there: finish it, delete it, go to its card. */
const EditActions = ({
  id,
  card,
  busy,
  onDone,
  onDelete,
  onOpenCard,
}: {
  id: string;
  card: string | null;
  busy: boolean;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenCard: (card: string) => void;
}) => {
  const t = useTranslations("memory");
  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label={t("done")}
        disabled={busy}
        onClick={() => onDone(id)}
        size="icon-sm"
        title={t("done")}
        type="button"
        variant="ghost"
      >
        <Check />
      </Button>
      <Button
        aria-label={t("delete")}
        className="text-destructive hover:text-destructive"
        disabled={busy}
        onClick={() => onDelete(id)}
        size="icon-sm"
        title={t("delete")}
        type="button"
        variant="ghost"
      >
        <Trash2 />
      </Button>
      {card && (
        <Button
          className="text-muted-foreground font-normal"
          onClick={() => onOpenCard(card)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("promiseOpenCard")}
        </Button>
      )}
    </div>
  );
};

export const PromiseDialog = ({
  draft,
  cards,
  busy,
  onChange,
  onClose,
  onSave,
  onDone,
  onDelete,
  onOpenCard,
}: {
  draft: PromiseDraft | null;
  cards: MemoryCardItem[];
  busy: boolean;
  onChange: Change;
  onClose: () => void;
  onSave: () => void;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenCard: (card: string) => void;
}) => {
  const t = useTranslations("memory");
  const edit = draft?.id !== null && draft?.id !== undefined;
  const reminder = draft?.kind === "reminder";
  const ready =
    draft !== null &&
    draft.text.trim().length > 0 &&
    (reminder || draft.side === "mine" || draft.card !== null);
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={draft !== null}>
      {draft && (
        <DialogContent className="gap-4 p-5 pb-4 sm:max-w-[26rem]">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) {
                onSave();
              }
            }}
          >
            {edit ? (
              <DialogTitle className="text-muted-foreground text-xs font-normal">
                {t(reminder ? "kindReminder" : "promiseEdit")}
              </DialogTitle>
            ) : (
              <>
                <DialogTitle className="sr-only">
                  {t(reminder ? "reminderNew" : "promiseNew")}
                </DialogTitle>
                <KindTabs draft={draft} onChange={onChange} />
              </>
            )}
            <input
              aria-label={t(reminder ? "reminderText" : "promiseText")}
              autoFocus
              className="placeholder:text-muted-foreground/50 w-full bg-transparent text-lg font-medium outline-none"
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder={t(reminder ? "reminderText" : "promiseText")}
              value={draft.text}
            />
            <PromiseLines
              cards={cards}
              draft={draft}
              edit={edit}
              onChange={onChange}
              reminder={reminder}
            />
            <div className="flex items-center justify-between border-t pt-3">
              {edit && draft.id ? (
                <EditActions
                  busy={busy}
                  card={draft.card}
                  id={draft.id}
                  onDelete={onDelete}
                  onDone={onDone}
                  onOpenCard={onOpenCard}
                />
              ) : (
                <span className="text-muted-foreground text-xs">
                  {t("promiseEnterHint")}
                </span>
              )}
              <Button disabled={busy || !ready} type="submit">
                {t(edit ? "save" : "promiseCreate")}
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
};
