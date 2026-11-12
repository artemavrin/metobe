"use client";

import type { MemoryCardItem, MemoryDue } from "@metobe/contracts/memory";
import { localInstant } from "@metobe/core/memory-extract";
import { Button } from "@metobe/ui/components/button";
import { Calendar } from "@metobe/ui/components/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { Field, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
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
import { Switch } from "@metobe/ui/components/switch";
import { format } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { dayKey } from "@/lib/memory-dates";

// «Новое обещание» and «Обещание» in the calendar (ReUI's Event Calendar 3: one dialog for both). A click on an empty
// day or hour opens it for a new promise; a click on a bar, for that one. The deadline is a day; a reminder, if asked
// for, is a day and a time of its own — in the person's zone. Who owes is chosen when the promise is made and read-only
// after it (the cards' own page moves it). Done and delete are here too, with «Вернуть» in the toast.

type Row = MemoryDue["rows"][number];

export interface PromiseDraft {
  /** The record being edited; null — a new promise. */
  id: string | null;
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
}

const DEFAULT_TIME = "10:00";

/** A new promise on a day, with the reminder at a time if the click was on an hour. */
export const newDraft = (day: string, time?: string): PromiseDraft => ({
  card: null,
  day,
  id: null,
  remind: Boolean(time),
  remindDay: day,
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
    remind: at !== null,
    remindDay: at ? dayKey(at, timeZone) : day,
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
const toKey = (date: Date) => format(date, "yyyy-MM-dd");

/** A day as a button that opens a month to pick it from. */
const DayField = ({
  label,
  value,
  onChange,
}: {
  label: string;
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
            variant="outline"
          />
        }
      >
        <CalendarDays />
        {format(toDate(value), "d MMM yyyy", {
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

const NOBODY = "none";

/** Who owes whom: a switch between «я обещал» and «мне обещали», and the card on the other side. */
const WhoField = ({
  draft,
  cards,
  onChange,
}: {
  draft: PromiseDraft;
  cards: MemoryCardItem[];
  onChange: (patch: Partial<PromiseDraft>) => void;
}) => {
  const t = useTranslations("memory");
  const named = cards.find((c) => c.id === draft.card)?.name;
  const mine = draft.side === "mine";
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {(["mine", "theirs"] as const).map((side) => (
          <Button
            key={side}
            onClick={() => onChange({ side })}
            variant={draft.side === side ? "secondary" : "outline"}
          >
            {t(side === "mine" ? "promiseMine" : "promiseTheirs")}
          </Button>
        ))}
      </div>
      <Select
        onValueChange={(v) =>
          onChange({ card: v === NOBODY ? null : (v as string) })
        }
        value={draft.card ?? NOBODY}
      >
        <SelectTrigger
          aria-label={t(mine ? "promiseWhoMine" : "promiseWhoTheirs")}
          className="w-full"
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
    </div>
  );
};

/** The reminder: a switch, and when it is on, the day and the time it goes off. */
const RemindField = ({
  draft,
  onChange,
}: {
  draft: PromiseDraft;
  onChange: (patch: Partial<PromiseDraft>) => void;
}) => {
  const t = useTranslations("memory");
  const s = useTranslations("settings.notifications");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor="promise-remind">{t("promiseRemind")}</FieldLabel>
        <Switch
          aria-label={t("promiseRemind")}
          checked={draft.remind}
          id="promise-remind"
          onCheckedChange={(remind) => onChange({ remind })}
        />
      </div>
      {draft.remind && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <DayField
            label={t("promiseRemindDay")}
            onChange={(remindDay) => onChange({ remindDay })}
            value={draft.remindDay}
          />
          <TimePicker
            aria-label={t("promiseRemindTime")}
            className="w-28"
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
        </div>
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
  onChange: (patch: Partial<PromiseDraft>) => void;
  onClose: () => void;
  onSave: () => void;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenCard: (card: string) => void;
}) => {
  const t = useTranslations("memory");
  const edit = draft?.id !== null && draft?.id !== undefined;
  const ready =
    draft !== null &&
    draft.text.trim().length > 0 &&
    (draft.side === "mine" || draft.card !== null);
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={draft !== null}>
      {draft && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(edit ? "promiseEdit" : "promiseNew")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) {
                onSave();
              }
            }}
          >
            <Field>
              <FieldLabel htmlFor="promise-text">{t("promiseText")}</FieldLabel>
              <Input
                autoFocus
                id="promise-text"
                onChange={(e) => onChange({ text: e.target.value })}
                placeholder={t("promiseTextHint")}
                value={draft.text}
              />
            </Field>
            {edit ? null : (
              <WhoField cards={cards} draft={draft} onChange={onChange} />
            )}
            <Field>
              <FieldLabel>{t("promiseDay")}</FieldLabel>
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
                value={draft.day}
              />
            </Field>
            <RemindField draft={draft} onChange={onChange} />
            {edit && draft.id && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button
                  disabled={busy}
                  onClick={() => onDone(draft.id as string)}
                  type="button"
                  variant="outline"
                >
                  {t("done")}
                </Button>
                {draft.card && (
                  <Button
                    onClick={() => onOpenCard(draft.card as string)}
                    type="button"
                    variant="ghost"
                  >
                    {t("promiseOpenCard")}
                  </Button>
                )}
                <Button
                  className="text-destructive hover:text-destructive ms-auto"
                  disabled={busy}
                  onClick={() => onDelete(draft.id as string)}
                  type="button"
                  variant="ghost"
                >
                  {t("delete")}
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button onClick={onClose} type="button" variant="ghost">
                {t("cancelNew")}
              </Button>
              <Button disabled={busy || !ready} type="submit">
                {t(edit ? "save" : "promiseCreate")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
};
