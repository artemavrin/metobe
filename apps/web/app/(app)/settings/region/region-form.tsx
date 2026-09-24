"use client";

import { localeNames, locales } from "@metobe/i18n/config";
import type { Locale } from "@metobe/i18n/config";
import { formatNumericDate } from "@metobe/i18n/dates";
import { dateFormats, defaultWeekStart, weekStarts } from "@metobe/i18n/prefs";
import type { DateFormat, Prefs, WeekStart } from "@metobe/i18n/prefs";
import { Button } from "@metobe/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@metobe/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState, useSyncExternalStore } from "react";

import { saveRegion } from "@/lib/prefs-actions";
import type { RegionState } from "@/lib/prefs-actions";

// 1 Jan 2024 was a Monday: ISO weekday n falls on 2024-01-n.
const capitalize = (text: string, locale: string) =>
  text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
const weekdayName = (locale: string, day: WeekStart) =>
  capitalize(
    new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      weekday: "long",
    }).format(new Date(Date.UTC(2024, 0, day))),
    locale
  );

// The zone and the minute need no live updates here, so the subscription is a no-op.
const unsubscribe = (): void => undefined;
const noSubscribe = () => unsubscribe;
const SAMPLE = new Date(Date.UTC(2026, 8, 24, 15, 30));

/** The automatic option names only its value; a quiet tag says it follows the language or the browser. */
const Auto = ({ label, tag }: { label: string; tag: string }) => (
  <span className="flex w-full items-center justify-between gap-3">
    {label}
    <span className="text-muted-foreground text-xs">{tag}</span>
  </span>
);

export const RegionForm = ({
  locale,
  chosen,
  timeZones,
}: {
  locale: Locale;
  chosen: Prefs["chosen"];
  timeZones: string[];
}) => {
  const t = useTranslations("region");
  const [state, action, pending] = useActionState<RegionState, FormData>(
    saveRegion,
    {}
  );
  const [lang, setLang] = useState<Locale>(locale);
  const [zone, setZone] = useState(chosen.timeZone ?? "auto");
  const [week, setWeek] = useState<string>(
    chosen.weekStart ? String(chosen.weekStart) : "auto"
  );
  const [date, setDate] = useState<DateFormat>(chosen.dateFormat ?? "auto");
  // The browser's zone and the clock exist only on the client; the server snapshot renders placeholders.
  const browserZone = useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => ""
  );
  const minute = useSyncExternalStore(
    noSubscribe,
    () => Math.floor(Date.now() / 60_000),
    () => null
  );
  const now = minute === null ? null : new Date(minute * 60_000);

  const effectiveZone = zone === "auto" ? browserZone || "UTC" : zone;
  const sample = (f: DateFormat) =>
    formatNumericDate(SAMPLE, { dateFormat: f, locale: lang, timeZone: "UTC" });
  const labels: Record<DateFormat, string> = {
    auto: sample("auto"),
    dmy: sample("dmy"),
    mdy: sample("mdy"),
    ymd: sample("ymd"),
  };
  const weekLabel = (v: string) =>
    weekdayName(
      lang,
      v === "auto" ? defaultWeekStart(lang) : (Number(v) as WeekStart)
    );
  const zoneLabel = (v: string) =>
    (v === "auto" ? browserZone || "…" : v).replaceAll("_", " ");

  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel>{t("language")}</FieldLabel>
          <Select
            name="locale"
            onValueChange={(v) => setLang(v as Locale)}
            value={lang}
          >
            <SelectTrigger>
              <SelectValue>{localeNames[lang]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {locales.map((l) => (
                <SelectItem key={l} lang={l} value={l}>
                  {localeNames[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t("timeZone")}</FieldLabel>
          <Select
            name="timeZone"
            onValueChange={(v) => setZone(String(v))}
            value={zone}
          >
            <SelectTrigger>
              <SelectValue>{zoneLabel(zone)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="auto">
                <Auto label={zoneLabel("auto")} tag={t("auto")} />
              </SelectItem>
              {timeZones
                .filter((z) => z !== browserZone || z === zone)
                .map((z) => (
                  <SelectItem key={z} value={z}>
                    {zoneLabel(z)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t("weekStart")}</FieldLabel>
          <Select
            name="weekStart"
            onValueChange={(v) => setWeek(String(v))}
            value={week}
          >
            <SelectTrigger>
              <SelectValue>{weekLabel(week)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {["auto", ...weekStarts.map(String)]
                .filter(
                  (v) =>
                    v === "auto" ||
                    v === week ||
                    v !== String(defaultWeekStart(lang))
                )
                .map((v) => (
                  <SelectItem key={v} value={v}>
                    {v === "auto" ? (
                      <Auto label={weekLabel(v)} tag={t("auto")} />
                    ) : (
                      weekLabel(v)
                    )}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t("dateFormat")}</FieldLabel>
          <Select
            name="dateFormat"
            onValueChange={(v) => setDate(v as DateFormat)}
            value={date}
          >
            <SelectTrigger>
              <SelectValue>{labels[date]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {dateFormats
                .filter(
                  (f) => f === "auto" || f === date || labels[f] !== labels.auto
                )
                .map((f) => (
                  <SelectItem key={f} value={f}>
                    {f === "auto" ? (
                      <Auto label={labels[f]} tag={t("auto")} />
                    ) : (
                      labels[f]
                    )}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-muted-foreground text-sm tabular-nums">
          {now
            ? t("preview", {
                date: formatNumericDate(now, {
                  dateFormat: date,
                  locale: lang,
                  timeZone: effectiveZone,
                }),
                time: new Intl.DateTimeFormat(lang, {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: effectiveZone,
                }).format(now),
              })
            : " "}
        </p>
        <div className="flex items-center gap-3">
          <Button disabled={pending} type="submit">
            {t("save")}
          </Button>
          {state.saved && !pending && (
            <span className="text-muted-foreground flex items-center gap-1 text-sm">
              <Check className="size-4" /> {t("saved")}
            </span>
          )}
        </div>
      </FieldGroup>
    </form>
  );
};
