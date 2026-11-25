"use client";

import { Button } from "@metobe/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@metobe/ui/components/input-group";
import { Badge } from "@metobe/ui/components/reui/badge";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@metobe/ui/components/sheet";
import { cn } from "@metobe/ui/lib/utils";
import { Pencil, Star } from "lucide-react";
import { useState } from "react";

import { Section } from "@/components/settings/rows";
import { SettingsHeader, SettingsPageFrame } from "@/components/settings/settings-shell";

import { MODELS, answersPerWeek, breakEvenWeek, modelById, money, pct, limitMark } from "../_orgs/data";
import type { Tariff } from "../_orgs/data";
import { NoteBar, PlatformWindow } from "../_orgs/frame";
import { usePhone } from "../privacy/frame";
import { ArchiveRow, FeatureRows, LimitRows, ModelList, PriceRows, draftError, useDraft } from "./editor";
import { AllOnModel, Delta, KnobFields, MonthBreakdown, OrgForecast, TweakBar, useForecast } from "./forecast";
import { seatsNext, useTariffs } from "./state";

// Вариант «Карточки»: каждый тариф — карточка с главным (цена, лимиты, модели с «×N», возможности), правка —
// в панели справа (на телефоне снизу). Прогноз разложен по тем же карточкам: у каждого тарифа своя экономика места
// и свой недельный лимит, который можно покрутить прямо в карточке; общие ручки — строкой сверху.

const EVERY = { "15min": "раз в 15 мин", day: "раз в день", hour: "раз в час" } as const;

const TariffCard = ({ t, onEdit }: { t: Tariff; onEdit: () => void }) => {
  const base = modelById(t.defaultModel);
  const on = MODELS.filter((m) => t.models.find((x) => x.id === m.id)?.on);
  return (
    <div className={cn("bg-card flex flex-col gap-4 rounded-xl border p-4", t.archived && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 font-semibold">
            {t.name}
            {t.archived && <Badge variant="outline">в архиве</Badge>}
          </span>
          <span className="text-2xl font-semibold tabular-nums">{money(t.price, t.currency)}</span>
          <span className="text-muted-foreground text-xs">
            в месяц, НДС {t.vat} % {t.vatMode === "above" ? "сверху" : "в цене"} · {seatsNext(t.id)} мест на декабрь
          </span>
        </div>
        <Button aria-label={`Изменить «${t.name}»`} onClick={onEdit} size="icon-sm" variant="outline">
          <Pencil />
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <dt className="text-muted-foreground text-xs">Неделя</dt>
          <dd className={cn("tabular-nums", t.week > breakEvenWeek(t) && "text-warning-foreground")}>{money(t.week, t.currency)}</dd>
        </div>
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <dt className="text-muted-foreground text-xs">5 часов</dt>
          <dd className="tabular-nums">{t.fiveHours === null ? "нет окна" : money(t.fiveHours, t.currency)}</dd>
        </div>
      </dl>
      <ul className="flex flex-col gap-1.5 text-sm">
        {on.map((m) => (
          <li className="flex items-center justify-between gap-2" key={m.id}>
            <span className="flex min-w-0 items-center gap-1.5">
              {m.id === t.defaultModel && <Star aria-label="По умолчанию" className="text-warning size-3.5 shrink-0 fill-current" />}
              <span className="truncate">{m.name}</span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {limitMark(m, base)} · ~{answersPerWeek(t.week, m)} в нед.
            </span>
          </li>
        ))}
      </ul>
      <ul className="text-muted-foreground flex flex-col gap-1 border-t pt-3 text-xs">
        <li>
          Задачи: {t.tasks.count === null ? "без счёта" : `до ${t.tasks.count}`}, не чаще {EVERY[t.tasks.every]}
        </li>
        <li>Память: {t.mailMemory ? "из чатов и почты, сводка по утрам" : "из чатов"}</li>
        {t.fast && <li>Быстрые версии моделей</li>}
        {t.early && <li>Ранний доступ</li>}
      </ul>
    </div>
  );
};

const EditSheet = ({ t, onClose }: { t: Tariff | null; onClose: () => void }) => {
  const phone = usePhone();
  return (
    <Sheet onOpenChange={(o) => !o && onClose()} open={t !== null}>
      <SheetContent className={cn("gap-0", phone ? "max-h-[92dvh] rounded-t-2xl" : "data-[side=right]:w-[560px] data-[side=right]:sm:max-w-[560px]")} side={phone ? "bottom" : "right"}>
        {t && <EditBody onClose={onClose} t={t} />}
      </SheetContent>
    </Sheet>
  );
};

const EditBody = ({ t, onClose }: { t: Tariff; onClose: () => void }) => {
  const s = useTariffs();
  const { draft: d, set, dirty } = useDraft(t);
  const error = draftError(d);
  return (
    <>
      <SheetHeader>
        <SheetTitle>Тариф «{t.name}»</SheetTitle>
        <SheetDescription>Людям видны только проценты лимитов и «×N к лимиту».</SheetDescription>
      </SheetHeader>
      <div className="@container flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
        <Section title="Цена и налог">
          <PriceRows d={d} set={set} />
        </Section>
        <Section title="Лимиты">
          <LimitRows d={d} set={set} />
        </Section>
        <Section title="Модели">
          <ModelList d={d} set={set} />
        </Section>
        <Section title="Возможности">
          <FeatureRows d={d} set={set} />
        </Section>
        <ArchiveRow d={d} set={set} />
      </div>
      <SheetFooter className="flex-row items-center justify-between border-t">
        <span className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error ?? (dirty ? "Есть изменения" : "")}</span>
        <Button
          disabled={!dirty || error !== null}
          onClick={() => {
            s.save(d);
            onClose();
          }}
        >
          Сохранить
        </Button>
      </SheetFooter>
    </>
  );
};

const Editor = () => {
  const s = useTariffs();
  const [edit, setEdit] = useState<Tariff | null>(null);
  return (
    <SettingsPageFrame>
      <SettingsHeader description="Три тарифа места. Людям видны только проценты лимитов и «×N к лимиту»." title="Тарифы" />
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-3">
        {s.tariffs.map((t) => (
          <TariffCard key={t.id} onEdit={() => setEdit(t)} t={t} />
        ))}
      </div>
      <EditSheet onClose={() => setEdit(null)} t={edit} />
    </SettingsPageFrame>
  );
};

const Forecast = () => {
  const { now, next, s } = useForecast();
  return (
    <SettingsPageFrame>
      <SettingsHeader description="Декабрь по тарифам: экономика одного места и недельный лимит прямо в карточке." title="Прогноз" />
      <MonthBreakdown base={now} dirty={s.dirty} f={next} />
      <Section title="Покрутить">
        <div className="grid grid-cols-1 gap-3 rounded-lg border p-4 @2xl:grid-cols-2">
          <KnobFields only={["platform"]} />
          <AllOnModel />
        </div>
      </Section>
      <TweakBar />
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-3">
        {next.byTariff.map((e) => {
          const t = s.tariffs.find((x) => x.id === e.id) ?? s.tariffs[0];
          const b = now.byTariff.find((x) => x.id === e.id) ?? now.byTariff[0];
          const changed = s.tweak.week[t.id] !== s.base.week[t.id];
          const left = e.revenue - e.models - e.servers;
          return (
            <div className="bg-card flex flex-col gap-3 rounded-xl border p-4" key={e.id}>
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">{t.name}</span>
                <span className="text-muted-foreground text-xs">{e.seats} мест</span>
              </div>
              <label className="flex items-center justify-between gap-2">
                <span className="text-sm">Неделя</span>
                <InputGroup className={cn("w-32", changed && "border-primary")}>
                  <InputGroupInput
                    aria-label={`Недельный лимит, ${t.name}`}
                    className="text-right tabular-nums"
                    inputMode="numeric"
                    onChange={(ev) => {
                      const n = Number(ev.target.value.replace(/\D/g, ""));
                      s.setTweak({ ...s.tweak, week: { ...s.tweak.week, [t.id]: n } });
                    }}
                    value={String(s.tweak.week[t.id])}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>₽</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </label>
              <dl className="flex flex-col gap-1.5 text-sm">
                {(
                  [
                    ["Выручка с места", money(Math.round(e.revenue)), e.revenue - b.revenue, "up"],
                    ["Модели в среднем", money(Math.round(e.models)), e.models - b.models, "down"],
                    ["Остаётся с места", money(Math.round(left)), left - (b.revenue - b.models - b.servers), "up"],
                    ["Худший случай", money(Math.round(e.worst)), e.worst - b.worst, "down"],
                  ] as const
                ).map(([label, v, d, good]) => (
                  <div className="flex items-baseline justify-between gap-2" key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="flex items-baseline gap-2 tabular-nums">
                      {s.dirty && <Delta good={good} value={d} />}
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-col gap-1 border-t pt-3 text-xs">
                <span className="flex justify-between">
                  <span className="text-muted-foreground">Человеко-недель с упором</span>
                  <span className="flex gap-2 tabular-nums">
                    {s.dirty && <Delta good="down" pctPoints value={e.hit - b.hit} />}
                    {pct(e.hit)}
                  </span>
                </span>
                <span className="flex justify-between">
                  <span className="text-muted-foreground">Отклонённых запросов</span>
                  <span className="tabular-nums">{e.rejected.toFixed(1).replace(".", ",")} %</span>
                </span>
                <span className="flex justify-between">
                  <span className="text-muted-foreground">Близко к лимиту</span>
                  <span className="tabular-nums">{e.near} чел.</span>
                </span>
              </div>
              {changed && (
                <Button onClick={s.apply} size="sm">
                  Применить к тарифу
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <Section title="По организациям">
        <OrgForecast f={next} />
      </Section>
    </SettingsPageFrame>
  );
};

export const CardsVariant = () => {
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
      {s.scr === "forecast" ? <Forecast /> : <Editor />}
      <NoteBar />
    </PlatformWindow>
  );
};
