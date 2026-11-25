"use client";

import { Button } from "@metobe/ui/components/button";
import { Checkbox } from "@metobe/ui/components/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@metobe/ui/components/collapsible";
import { Input } from "@metobe/ui/components/input";
import { Switch } from "@metobe/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@metobe/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Calculator, ChevronDown, Star } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Section } from "@/components/settings/rows";
import { SettingsHeader } from "@/components/settings/settings-shell";

import { MODELS, answersPerWeek, breakEvenWeek, modelById, modelFit, money, pct, limitMark } from "../_orgs/data";
import type { Tariff, TariffId } from "../_orgs/data";
import { NoteBar, PlatformWindow, WideFrame } from "../_orgs/frame";
import { usePhone } from "../privacy/frame";
import { MoneyInput, SaveBar, draftError } from "./editor";
import { KnobFields, MonthBreakdown, OrgForecast, TariffEconomyTable, TweakBar, useForecast } from "./forecast";
import { useTariffs } from "./state";

// Вариант «Сравнение»: три тарифа рядом столбцами, как таблица цен — правятся прямо в ячейках, видно, чем Про
// отличается от Обычного. Одно «Сохранить» на все три. На телефоне — один столбец, тариф выбирается сверху.
// Прогноз — «рядом»: ручки всегда открыты слева, числа справа меняются сразу; на телефоне ручки — свёрнутым блоком.

const Cell = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn("flex min-w-0 items-center justify-end px-3 py-2.5", className)}>{children}</div>;

const Editor = () => {
  const s = useTariffs();
  const phone = usePhone();
  const [drafts, setDrafts] = useState<Tariff[]>(s.tariffs);
  const [only, setOnly] = useState<TariffId>(s.tariff.id);
  const dirty = JSON.stringify(drafts) !== JSON.stringify(s.tariffs);
  const error = drafts.map((d) => draftError(d) && `${d.name}: ${draftError(d)}`).find(Boolean) ?? null;
  const shown = phone ? drafts.filter((d) => d.id === only) : drafts;
  const set = (d: Tariff) => setDrafts((all) => all.map((x) => (x.id === d.id ? d : x)));
  const cols = { gridTemplateColumns: `minmax(9rem, 1fr) repeat(${shown.length}, minmax(8.5rem, 1fr))` };

  const line = (label: ReactNode, cell: (d: Tariff) => ReactNode, hint?: string) => (
    <div className="grid border-b last:border-b-0" style={cols}>
      <div className="flex min-w-0 flex-col justify-center px-4 py-2.5">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      {shown.map((d) => (
        <Cell className="border-l" key={d.id}>
          {cell(d)}
        </Cell>
      ))}
    </div>
  );
  const group = (title: string) => (
    <div className="bg-muted/40 text-muted-foreground border-b px-4 py-1.5 text-xs font-medium" key={title}>
      {title}
    </div>
  );

  return (
    <WideFrame>
      <SettingsHeader description="Три тарифа рядом: правка прямо в ячейках, одно «Сохранить» на все." title="Тарифы" />
      {phone && (
        <ToggleGroup className="w-full" onValueChange={(v) => v[0] && setOnly(v[0] as TariffId)} spacing={0} value={[only]} variant="outline">
          {drafts.map((d) => (
            <ToggleGroupItem className="flex-1" key={d.id} value={d.id}>
              {d.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <div className="min-w-fit">
          <div className="grid border-b" style={cols}>
            <div />
            {shown.map((d) => (
              <div className="flex flex-col items-end gap-0.5 border-l px-3 py-3" key={d.id}>
                <Input aria-label="Название" className="h-7 w-28 text-right font-semibold" onChange={(e) => set({ ...d, name: e.target.value })} value={d.name} />
                <span className="text-muted-foreground text-xs">{d.archived ? "в архиве" : `НДС ${d.vat} % ${d.vatMode === "above" ? "сверху" : "в цене"}`}</span>
              </div>
            ))}
          </div>
          {group("Цена и лимиты")}
          {line("Цена места", (d) => <MoneyInput className="w-32" currency={d.currency} label={`Цена, ${d.name}`} onChange={(n) => set({ ...d, price: n })} value={d.price} />, "в месяц")}
          {line(
            "Неделя",
            (d) => (
              <span className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger render={<Button aria-label="Неделя в ноль" onClick={() => set({ ...d, week: breakEvenWeek(d) })} size="icon-xs" variant="ghost" />}>
                    <Calculator />
                  </TooltipTrigger>
                  <TooltipContent>Неделя в ноль: {money(breakEvenWeek(d))}</TooltipContent>
                </Tooltip>
                <MoneyInput className={cn("w-28", d.week > breakEvenWeek(d) && "border-warning")} currency={d.currency} label={`Неделя, ${d.name}`} onChange={(n) => set({ ...d, week: n })} value={d.week} />
              </span>
            ),
            "оранжевым — выше «в ноль»"
          )}
          {line(
            "5 часов",
            (d) => (
              <span className="flex items-center gap-2">
                {d.fiveHours === null ? (
                  <span className="text-muted-foreground text-xs">нет окна</span>
                ) : (
                  <MoneyInput className="w-28" currency={d.currency} label={`5 часов, ${d.name}`} onChange={(n) => set({ ...d, fiveHours: n })} value={d.fiveHours} />
                )}
                <Switch aria-label={`Окно 5 часов, ${d.name}`} checked={d.fiveHours !== null} onCheckedChange={(v) => set({ ...d, fiveHours: v ? Math.round(d.week / 3) : null })} size="sm" />
              </span>
            ),
            "окно выключено — только неделя"
          )}
          {group("Модели: «×N к лимиту» и ответов в неделю; звезда — по умолчанию")}
          {MODELS.map((m) => (
            <div className="grid border-b" key={m.id} style={cols}>
              <div className="flex min-w-0 flex-col justify-center px-4 py-2">
                <span className="truncate">{m.name}</span>
                <span className="text-muted-foreground text-xs">{m.priced ? m.provider : "нет цены — не включить"}</span>
              </div>
              {shown.map((d) => {
                const row = d.models.find((x) => x.id === m.id);
                const answers = answersPerWeek(d.week, m);
                const fit = modelFit(answers);
                const isDefault = d.defaultModel === m.id;
                return (
                  <Cell className={cn("gap-2 border-l", !row?.on && "text-muted-foreground")} key={d.id}>
                    {m.priced && (
                      <span className="flex flex-col items-end text-xs tabular-nums">
                        <span>{limitMark(m, modelById(d.defaultModel))}</span>
                        <span className={cn(fit === "out" && "text-destructive", fit === "costly" && "text-warning-foreground")}>~{answers}</span>
                      </span>
                    )}
                    <Button
                      aria-label={`По умолчанию, ${d.name}`}
                      className={cn(isDefault ? "text-warning" : "text-muted-foreground/40")}
                      disabled={!row?.on}
                      onClick={() => set({ ...d, defaultModel: m.id })}
                      size="icon-xs"
                      variant="ghost"
                    >
                      <Star className={cn(isDefault && "fill-current")} />
                    </Button>
                    <Checkbox
                      aria-label={`${m.name}, ${d.name}`}
                      checked={row?.on ?? false}
                      disabled={!m.priced || isDefault}
                      onCheckedChange={(v) => set({ ...d, models: d.models.map((x) => (x.id === m.id ? { ...x, on: v === true } : x)) })}
                    />
                  </Cell>
                );
              })}
            </div>
          ))}
          {group("Возможности")}
          {line(
            "Задачи",
            (d) => (
              <span className="text-right text-xs">
                {d.tasks.count === null ? "без счёта" : `до ${d.tasks.count}`}, не чаще {d.tasks.every === "day" ? "раза в день" : d.tasks.every === "hour" ? "раза в час" : "раза в 15 мин"}
              </span>
            )
          )}
          {line("Память из почты", (d) => <Switch aria-label={`Память из почты, ${d.name}`} checked={d.mailMemory} onCheckedChange={(v) => set({ ...d, mailMemory: v })} />)}
          {line("Быстрые версии", (d) => <Switch aria-label={`Быстрые версии, ${d.name}`} checked={d.fast} onCheckedChange={(v) => set({ ...d, fast: v })} />, "вдвое дороже")}
          {line("Ранний доступ", (d) => <Switch aria-label={`Ранний доступ, ${d.name}`} checked={d.early} onCheckedChange={(v) => set({ ...d, early: v })} />)}
          {line(
            "Архив",
            (d) => (
              <Button onClick={() => set({ ...d, archived: !d.archived })} size="sm" variant="ghost">
                {d.archived ? "Вернуть" : "В архив"}
              </Button>
            ),
            "новых мест не купить"
          )}
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        error={error}
        onReset={() => setDrafts(s.tariffs)}
        onSave={() => {
          for (const d of drafts) if (JSON.stringify(d) !== JSON.stringify(s.tariffs.find((t) => t.id === d.id))) s.save(d);
        }}
      />
    </WideFrame>
  );
};

const Forecast = () => {
  const { now, next, s } = useForecast();
  const phone = usePhone();
  const knobs = (
    <div className="flex flex-col gap-4">
      <KnobFields />
      <TweakBar />
    </div>
  );
  return (
    <WideFrame>
      <SettingsHeader description="Ручки слева, числа справа меняются сразу. Сохраняется только «Применить к тарифу»." title="Прогноз на декабрь" />
      {phone ? (
        <Collapsible className="rounded-lg border">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left font-medium">
            Покрутить{s.dirty ? " · изменено" : ""}
            <ChevronDown className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t px-4 py-3">{knobs}</CollapsibleContent>
        </Collapsible>
      ) : null}
      <div className="flex gap-6">
        {!phone && (
          <aside className="sticky top-4 flex h-fit w-80 shrink-0 flex-col gap-3 rounded-lg border p-4">
            <span className="font-semibold">Покрутить</span>
            <span className="text-muted-foreground -mt-2 text-xs">Пересчёт на записанных ответах последних 4–8 недель</span>
            {knobs}
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <Section meta={`остаётся ${pct((next.left / next.revenue) * 100)}`} title="Следующий месяц">
            <MonthBreakdown base={now} dirty={s.dirty} f={next} />
          </Section>
          <Section title="По тарифам">
            <TariffEconomyTable base={now} dirty={s.dirty} f={next} />
          </Section>
          <Section title="По организациям">
            <OrgForecast f={next} />
          </Section>
        </div>
      </div>
    </WideFrame>
  );
};

export const CompareVariant = () => {
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
      {s.scr === "forecast" ? <Forecast /> : <Editor key={JSON.stringify(s.tariffs)} />}
      <NoteBar />
    </PlatformWindow>
  );
};
