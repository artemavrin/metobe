"use client";

// «Язык и регион» (D31) as a user section of the settings: the same rows as the admin screens, a live «now» line.
import { type Locale, localeNames, locales } from "@metobe/i18n/config";
import { formatNumericDate } from "@metobe/i18n/dates";
import { type DateFormat, dateFormats, defaultWeekStart, type WeekStart, weekStarts } from "@metobe/i18n/prefs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { useState, useSyncExternalStore } from "react";

import { Row, Section } from "./parts";

const unsubscribe = (): void => undefined;
const noSubscribe = () => unsubscribe;
const weekday = (locale: string, day: WeekStart) => {
  const name = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "long" }).format(new Date(Date.UTC(2024, 0, day)));
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
};
const SAMPLE = new Date(Date.UTC(2026, 8, 24, 15, 30));
const ZONES = ["Europe/Moscow", "Europe/Berlin", "Europe/London", "Asia/Tokyo", "America/New_York", "UTC"];

const Pick = ({ value, onChange, items, label }: { value: string; onChange: (v: string) => void; items: [string, string][]; label: (v: string) => string }) => (
  <Select onValueChange={(v) => onChange(String(v))} value={value}>
    <SelectTrigger className="w-full md:w-72">
      <SelectValue>{label(value)}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      {/* An explicit option equal to what «авто» gives now is a duplicate — hidden unless it is the current choice. */}
      {items
        .filter(([v, l]) => v === "auto" || v === value || l !== items.find(([a]) => a === "auto")?.[1])
        .map(([v, l]) => (
        <SelectItem key={v} value={v}>
          {v === "auto" ? (
            <span className="flex w-full items-center justify-between gap-3">
              {l}
              <span className="text-muted-foreground text-xs">авто</span>
            </span>
          ) : (
            l
          )}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const RegionPage = () => {
  const [lang, setLang] = useState<Locale>("ru");
  const [zone, setZone] = useState("auto");
  const [week, setWeek] = useState("auto");
  const [date, setDate] = useState<DateFormat>("auto");
  const browserZone = useSyncExternalStore(noSubscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "");
  const minute = useSyncExternalStore(noSubscribe, () => Math.floor(Date.now() / 60_000), () => null);
  const tz = zone === "auto" ? browserZone || "UTC" : zone;
  const sample = (f: DateFormat) => formatNumericDate(SAMPLE, { dateFormat: f, locale: lang, timeZone: "UTC" });
  // The automatic option shows only its value; the list tags it «авто».
  const dateLabel = (f: string) => sample(f as DateFormat);
  const weekLabel = (v: string) => weekday("ru", v === "auto" ? defaultWeekStart(lang) : (Number(v) as WeekStart));
  const zoneLabel = (v: string) => (v === "auto" ? browserZone || "…" : v).replaceAll("_", " ");
  const now = minute === null ? null : new Date(minute * 60_000);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Язык и регион</h1>
        <p className="text-muted-foreground">На каком языке говорит Metobe и как показывает даты и время. Меняется только у вас.</p>
      </header>
      <Section title="Язык">
        <div className="divide-y rounded-lg border">
          <Row hint="Интерфейс, письма и ответы системы" label="Язык интерфейса">
            <Pick items={locales.map((l) => [l, localeNames[l]])} label={(v) => localeNames[v as Locale]} onChange={(v) => setLang(v as Locale)} value={lang} />
          </Row>
        </div>
      </Section>
      <Section meta={now ? `сейчас ${formatNumericDate(now, { dateFormat: date, locale: lang, timeZone: tz })}, ${new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(now)}` : undefined} title="Дата и время">
        <div className="divide-y rounded-lg border">
          <Row hint="Автоматически — как в браузере; расписания агентов тоже в нём" label="Часовой пояс">
            <Pick items={[["auto", zoneLabel("auto")], ...ZONES.map((z): [string, string] => [z, zoneLabel(z)])]} label={zoneLabel} onChange={setZone} value={zone} />
          </Row>
          <Row hint="Календари и недельные отчёты" label="Первый день недели">
            <Pick items={["auto", ...weekStarts.map(String)].map((v): [string, string] => [v, weekLabel(v)])} label={weekLabel} onChange={setWeek} value={week} />
          </Row>
          <Row hint="Числовые даты; даты словами — по языку" label="Формат даты">
            <Pick items={dateFormats.map((f): [string, string] => [f, dateLabel(f)])} label={dateLabel} onChange={(v) => setDate(v as DateFormat)} value={date} />
          </Row>
        </div>
      </Section>
    </>
  );
};
