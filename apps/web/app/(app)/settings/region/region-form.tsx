"use client";

import { localeNames, locales } from "@metobe/i18n/config";
import type { Locale } from "@metobe/i18n/config";
import { formatNumericDate } from "@metobe/i18n/dates";
import { dateFormats, defaultWeekStart, weekStarts } from "@metobe/i18n/prefs";
import type { DateFormat, Prefs, WeekStart } from "@metobe/i18n/prefs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";
import { saveRegion } from "@/lib/prefs-actions";

const capitalize = (text: string, locale: string) =>
  text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
// 1 Jan 2024 was a Monday: ISO weekday n falls on 2024-01-n.
const weekdayName = (locale: string, day: WeekStart) =>
  capitalize(
    new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      weekday: "long",
    }).format(new Date(Date.UTC(2024, 0, day))),
    locale
  );

const zoneLabel = (z: string) => z.replaceAll("_", " ");
const unsubscribe = (): void => undefined;
const noSubscribe = () => unsubscribe;
const SAMPLE = new Date(Date.UTC(2026, 8, 24, 15, 30));

interface Option {
  value: string;
  label: string;
  auto?: boolean;
}

/** A select whose automatic option shows only its value, tagged «auto» in the list. */
const Pick = ({
  value,
  options,
  onChange,
  autoTag,
  label,
}: {
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  autoTag: string;
  label: string;
}) => (
  <Select onValueChange={(v) => onChange(String(v))} value={value}>
    <SelectTrigger aria-label={label} className="w-full md:w-72">
      <SelectValue>{options.find((o) => o.value === value)?.label}</SelectValue>
    </SelectTrigger>
    <SelectContent className="max-h-80">
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.auto ? (
            <span className="flex w-full items-center justify-between gap-3">
              {o.label}
              <span className="text-muted-foreground text-xs">{autoTag}</span>
            </span>
          ) : (
            o.label
          )}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/** Each choice is saved as it is made; a language change re-renders the page in that language on the server. */
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
  const [, start] = useTransition();
  const [lang, setLang] = useState<Locale>(locale);
  const [zone, setZone] = useState(chosen.timeZone ?? "auto");
  const [week, setWeek] = useState(
    chosen.weekStart ? String(chosen.weekStart) : "auto"
  );
  const [date, setDate] = useState<DateFormat>(chosen.dateFormat ?? "auto");
  // The browser's zone and the clock exist only on the client.
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

  const save = (next: {
    lang?: Locale;
    zone?: string;
    week?: string;
    date?: DateFormat;
  }) => {
    const form = new FormData();
    form.set("locale", next.lang ?? lang);
    form.set("timeZone", next.zone ?? zone);
    form.set("weekStart", next.week ?? week);
    form.set("dateFormat", next.date ?? date);
    start(async () => {
      await saveRegion({}, form);
    });
  };

  const effectiveZone = zone === "auto" ? browserZone || "UTC" : zone;
  const sample = (f: DateFormat) =>
    formatNumericDate(SAMPLE, { dateFormat: f, locale: lang, timeZone: "UTC" });
  const autoWeek = String(defaultWeekStart(lang));
  // An explicit option equal to what «auto» gives now is a duplicate — hidden unless it is the current choice.
  const zones: Option[] = [
    { auto: true, label: zoneLabel(browserZone || "UTC"), value: "auto" },
    ...timeZones
      .filter((z) => z !== browserZone || z === zone)
      .map((z) => ({ label: zoneLabel(z), value: z })),
  ];
  const weeks: Option[] = [
    {
      auto: true,
      label: weekdayName(lang, Number(autoWeek) as WeekStart),
      value: "auto",
    },
    ...weekStarts
      .map(String)
      .filter((v) => v !== autoWeek || v === week)
      .map((v) => ({
        label: weekdayName(lang, Number(v) as WeekStart),
        value: v,
      })),
  ];
  const dates: Option[] = dateFormats
    .filter((f) => f === "auto" || f === date || sample(f) !== sample("auto"))
    .map((f) => ({ auto: f === "auto", label: sample(f), value: f }));
  const now = minute === null ? null : new Date(minute * 60_000);

  return (
    <>
      <Section title={t("languageSection")}>
        <Rows>
          <Row hint={t("languageHint")} label={t("language")}>
            <Pick
              autoTag={t("auto")}
              label={t("language")}
              onChange={(v) => {
                setLang(v as Locale);
                save({ lang: v as Locale });
              }}
              options={locales.map((l) => ({
                label: localeNames[l],
                value: l,
              }))}
              value={lang}
            />
          </Row>
        </Rows>
      </Section>
      <Section
        meta={
          now
            ? t("now", {
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
            : undefined
        }
        title={t("dateTimeSection")}
      >
        <Rows>
          <Row hint={t("timeZoneHint")} label={t("timeZone")}>
            <Pick
              autoTag={t("auto")}
              label={t("timeZone")}
              onChange={(v) => {
                setZone(v);
                save({ zone: v });
              }}
              options={zones}
              value={zone}
            />
          </Row>
          <Row hint={t("weekStartHint")} label={t("weekStart")}>
            <Pick
              autoTag={t("auto")}
              label={t("weekStart")}
              onChange={(v) => {
                setWeek(v);
                save({ week: v });
              }}
              options={weeks}
              value={week}
            />
          </Row>
          <Row hint={t("dateFormatHint")} label={t("dateFormat")}>
            <Pick
              autoTag={t("auto")}
              label={t("dateFormat")}
              onChange={(v) => {
                setDate(v as DateFormat);
                save({ date: v as DateFormat });
              }}
              options={dates}
              value={date}
            />
          </Row>
        </Rows>
      </Section>
    </>
  );
};
