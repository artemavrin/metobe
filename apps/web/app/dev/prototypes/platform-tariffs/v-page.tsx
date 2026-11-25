"use client";

import { Button } from "@metobe/ui/components/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@metobe/ui/components/sheet";
import { Tabs, TabsList, TabsTrigger } from "@metobe/ui/components/tabs";
import { cn } from "@metobe/ui/lib/utils";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { Section } from "@/components/settings/rows";
import { SettingsHeader, SettingsPageFrame } from "@/components/settings/settings-shell";

import type { TariffId } from "../_orgs/data";
import { NoteBar, PlatformWindow, Tile } from "../_orgs/frame";
import { usePhone } from "../privacy/frame";
import { ArchiveRow, FeatureRows, LimitRows, ModelList, PriceRows, SaveBar, draftError, useDraft } from "./editor";
import { KnobFields, MonthBreakdown, OrgForecast, TariffEconomyTable, TweakBar, useForecast } from "./forecast";
import { money, pct } from "../_orgs/data";
import { useTariffs } from "./state";

// Вариант «Страница»: тариф — страница настроек с разделами, тарифы переключаются вкладками сверху, «Сохранить» —
// полосой внизу. Прогноз — отчёт сверху вниз; «Покрутить» открывает панель с ручками справа (на телефоне снизу),
// а числа в отчёте показывают разницу с сохранённым.

const Editor = () => {
  const s = useTariffs();
  const t = s.tariff;
  const { draft: d, set, dirty, reset } = useDraft(t);
  return (
    <SettingsPageFrame>
      <SettingsHeader description="Цена места, лимиты, модели и возможности. Людям видны только проценты лимитов и «×N»." title="Тарифы" />
      <Tabs onValueChange={(v) => s.go("tariff", v as TariffId)} value={t.id}>
        <TabsList>
          {s.tariffs.map((x) => (
            <TabsTrigger key={x.id} value={x.id}>
              {x.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Section title="Цена и налог">
        <PriceRows d={d} set={set} />
      </Section>
      <Section meta="в валюте тарифа" title="Лимиты">
        <LimitRows d={d} set={set} />
      </Section>
      <Section meta={`${d.models.filter((m) => m.on).length} из ${d.models.length}`} title="Модели">
        <ModelList d={d} set={set} />
      </Section>
      <Section title="Возможности">
        <FeatureRows d={d} set={set} />
      </Section>
      <ArchiveRow d={d} set={set} />
      <SaveBar dirty={dirty} error={draftError(d)} onReset={reset} onSave={() => s.save(d)} />
    </SettingsPageFrame>
  );
};

const Forecast = () => {
  const { now, next, s } = useForecast();
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  return (
    <SettingsPageFrame>
      <div className="flex items-start justify-between gap-4">
        <SettingsHeader description="Декабрь: места на следующий месяц у платящих организаций, расход — средний за последние 4 недели." title="Прогноз" />
        <Button onClick={() => setOpen(true)} variant={s.dirty ? "default" : "outline"}>
          <SlidersHorizontal />
          Покрутить
        </Button>
      </div>
      <TweakBar />
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        <Tile label="Мест на декабрь" value={next.byTariff.reduce((a, e) => a + e.seats, 0)} />
        <Tile label="Выручка" value={money(Math.round(next.revenue))} />
        <Tile label="Модели" value={money(Math.round(next.models))} hint={`${pct((next.models / next.revenue) * 100)} выручки`} />
        <Tile label="Остаётся" tone={next.left < now.left ? "warn" : undefined} value={money(Math.round(next.left))} />
      </div>
      <Section title="Следующий месяц">
        <MonthBreakdown base={now} dirty={s.dirty} f={next} />
      </Section>
      <Section title="По тарифам">
        <TariffEconomyTable base={now} dirty={s.dirty} f={next} />
      </Section>
      <Section title="По организациям">
        <OrgForecast f={next} />
      </Section>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className={cn("gap-0", phone ? "max-h-[88dvh] rounded-t-2xl" : "data-[side=right]:w-[400px] data-[side=right]:sm:max-w-[400px]")} side={phone ? "bottom" : "right"}>
          <SheetHeader>
            <SheetTitle>Покрутить</SheetTitle>
            <SheetDescription>Пересчёт на записанных ответах последних 4–8 недель. Ничего не сохраняется, пока не нажато «Применить к тарифу».</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
            <KnobFields />
            <TweakBar />
          </div>
        </SheetContent>
      </Sheet>
    </SettingsPageFrame>
  );
};

export const PageVariant = () => {
  const s = useTariffs();
  return (
    <PlatformWindow
      onNavigate={(p) => {
        if (p === "tariffs" || p === "forecast") {
          s.go(p === "tariffs" ? "tariff" : "forecast");
          return true;
        }
        return false;
      }}
      page={s.scr === "forecast" ? "forecast" : "tariffs"}
      title={s.scr === "forecast" ? "Прогноз" : "Тарифы"}
    >
      {s.scr === "forecast" ? <Forecast /> : <Editor key={`${s.tariff.id}-${JSON.stringify(s.tariff)}`} />}
      <NoteBar />
    </PlatformWindow>
  );
};
