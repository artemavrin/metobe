"use client";

import { Button } from "@metobe/ui/components/button";
import { Checkbox } from "@metobe/ui/components/checkbox";
import { Input } from "@metobe/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@metobe/ui/components/input-group";
import { Badge } from "@metobe/ui/components/reui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { Switch } from "@metobe/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@metobe/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Archive, Calculator, Star } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { MODELS, SERVERS_PER_SEAT, answersPerWeek, breakEvenWeek, modelById, modelFit, money, multiplier, net, times } from "../_orgs/data";
import type { Model, Tariff } from "../_orgs/data";
import { usePhone } from "../privacy/frame";
import { seatsNext } from "./state";

// Поля редактора тарифа (ORGS-PLAN §5.2): цена и налог, лимиты с «Неделя в ноль», модели с «×N» и ответами в неделю,
// модель по умолчанию, возможности, архив. Варианты раскладывают их по-разному.

export const useDraft = (t: Tariff) => {
  const [draft, setDraft] = useState<Tariff>(t);
  const dirty = JSON.stringify(draft) !== JSON.stringify(t);
  return { dirty, draft, reset: () => setDraft(t), set: setDraft };
};

export const draftError = (d: Tariff): string | null => {
  if (d.name.trim() === "") return "Нужно название";
  if (!(d.price > 0)) return "Нужна цена места";
  if (!(d.week > 0)) return "Нужен недельный лимит";
  if (d.fiveHours !== null && !(d.fiveHours > 0)) return "Нужен лимит на 5 часов или «без окна»";
  if (d.fiveHours !== null && d.fiveHours > d.week) return "Лимит на 5 часов больше недельного";
  if (!d.models.find((m) => m.id === d.defaultModel)?.on) return "Модель по умолчанию должна входить в тариф";
  return null;
};

const numberFrom = (v: string) => (v.trim() === "" ? Number.NaN : Number(v.replace(/\s/g, "").replace(",", ".")));
const shown = (n: number) => (Number.isNaN(n) ? "" : String(n));

export const MoneyInput = ({ value, onChange, label, currency, className }: { value: number; onChange: (n: number) => void; label: string; currency: Tariff["currency"]; className?: string }) => (
  <InputGroup className={cn("w-36", className)}>
    <InputGroupInput aria-label={label} className="text-right tabular-nums" inputMode="decimal" onChange={(e) => onChange(numberFrom(e.target.value))} value={shown(value)} />
    <InputGroupAddon align="inline-end">
      <InputGroupText>{currency === "RUB" ? "₽" : "$"}</InputGroupText>
    </InputGroupAddon>
  </InputGroup>
);

const VATS = [0, 5, 7, 10, 22];

// ── Цена и налог ────────────────────────────────────────────────────────────────────────────────────────────────────

export const PriceRows = ({ d, set }: { d: Tariff; set: (t: Tariff) => void }) => (
  <Rows>
    <Row label="Название">
      <Input aria-label="Название" className="w-48 max-md:w-full" onChange={(e) => set({ ...d, name: e.target.value })} value={d.name} />
    </Row>
    <Row hint={d.vatMode === "above" ? `Клиент платит ${money(d.price * (1 + d.vat / 100), d.currency)} с НДС` : `Без НДС — ${money(net(d), d.currency)}`} label="Цена места в месяц">
      <MoneyInput currency={d.currency} label="Цена места" onChange={(n) => set({ ...d, price: n })} value={d.price} />
    </Row>
    <Row label="Валюта">
      <Select onValueChange={(v) => set({ ...d, currency: v as Tariff["currency"] })} value={d.currency}>
        <SelectTrigger aria-label="Валюта" className="w-36">
          <SelectValue>{d.currency === "RUB" ? "Рубли" : "Доллары"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="RUB">Рубли</SelectItem>
          <SelectItem value="USD">Доллары</SelectItem>
        </SelectContent>
      </Select>
    </Row>
    <Row label="НДС">
      <span className="flex flex-wrap items-center gap-2">
        <Select onValueChange={(v) => set({ ...d, vat: Number(v) })} value={String(d.vat)}>
          <SelectTrigger aria-label="Ставка НДС" className="w-24">
            <SelectValue>{d.vat === 0 ? "Без НДС" : `${d.vat} %`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {VATS.map((v) => (
              <SelectItem key={v} value={String(v)}>
                {v === 0 ? "Без НДС" : `${v} %`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup disabled={d.vat === 0} onValueChange={(v) => v[0] && set({ ...d, vatMode: v[0] as Tariff["vatMode"] })} size="sm" spacing={0} value={[d.vatMode]} variant="outline">
          <ToggleGroupItem value="above">сверху</ToggleGroupItem>
          <ToggleGroupItem value="inside">в цене</ToggleGroupItem>
        </ToggleGroup>
      </span>
    </Row>
  </Rows>
);

// ── Лимиты ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export const BreakEven = ({ d, set }: { d: Tariff; set: (t: Tariff) => void }) => {
  const even = breakEvenWeek(d);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            onClick={() => set({ ...d, fiveHours: d.fiveHours === null ? null : Math.round(even / 3), week: even })}
            size="sm"
            variant="outline"
          />
        }
      >
        <Calculator />
        Неделя в ноль
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        (цена без НДС {money(net(d), d.currency)} − серверы {money(SERVERS_PER_SEAT)}) × 7 / 30,4 = {money(even, d.currency)}. Место не уходит в минус, даже если человек каждую неделю выбирает весь лимит
      </TooltipContent>
    </Tooltip>
  );
};

export const LimitRows = ({ d, set, compact }: { d: Tariff; set: (t: Tariff) => void; compact?: boolean }) => {
  const even = breakEvenWeek(d);
  return (
    <Rows>
      <Row
        hint={d.week > even ? `Выше «в ноль» (${money(even, d.currency)}): кто выбирает всю неделю, уходит в минус` : `В месяц не больше ${money(d.week * 4.34, d.currency)} на место`}
        label="Неделя"
      >
        <span className="flex flex-wrap items-center gap-2">
          <MoneyInput currency={d.currency} label="Лимит на неделю" onChange={(n) => set({ ...d, week: n })} value={d.week} />
          {!compact && <BreakEven d={d} set={set} />}
        </span>
      </Row>
      <Row hint={d.fiveHours === null ? "Только неделя: за день можно выбрать всю неделю" : `Треть недели — ${money(Math.round(d.week / 3), d.currency)}`} label="5 часов">
        <span className="flex items-center gap-3">
          {d.fiveHours !== null && <MoneyInput currency={d.currency} label="Лимит на 5 часов" onChange={(n) => set({ ...d, fiveHours: n })} value={d.fiveHours} />}
          <label className="text-muted-foreground flex items-center gap-2 text-sm whitespace-nowrap">
            <Switch checked={d.fiveHours !== null} onCheckedChange={(v) => set({ ...d, fiveHours: v ? Math.round(d.week / 3) : null })} />
            окно
          </label>
        </span>
      </Row>
    </Rows>
  );
};

// ── Модели ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const FitBadge = ({ m, answers }: { m: Model; answers: number }) => {
  if (!m.priced) return <Badge variant="outline">нет цены</Badge>;
  const fit = modelFit(answers);
  if (fit === "main") return null;
  if (fit === "costly") return <Badge variant="warning-light">дороже</Badge>;
  return <Badge variant="destructive-light">меньше 25 в неделю</Badge>;
};

const DefaultStar = ({ on, disabled, onClick }: { on: boolean; disabled: boolean; onClick: () => void }) => (
  <Tooltip>
    <TooltipTrigger
      render={<Button aria-label="Модель по умолчанию" aria-pressed={on} className={cn(on ? "text-warning" : "text-muted-foreground/50")} disabled={disabled} onClick={onClick} size="icon-xs" variant="ghost" />}
    >
      <Star className={cn(on && "fill-current")} />
    </TooltipTrigger>
    <TooltipContent>{on ? "Модель по умолчанию: от неё считается «×N»" : "Сделать моделью по умолчанию"}</TooltipContent>
  </Tooltip>
);

export const ModelList = ({ d, set }: { d: Tariff; set: (t: Tariff) => void }) => {
  const phone = usePhone();
  const base = modelById(d.defaultModel);
  const toggle = (id: string, on: boolean) => set({ ...d, models: d.models.map((m) => (m.id === id ? { ...m, on } : m)) });
  return (
    <div className="flex flex-col gap-2">
      <div className="divide-y rounded-lg border">
        {!phone && (
          <div className="text-muted-foreground bg-muted/40 grid grid-cols-[1.5rem_1fr_4.5rem_7rem_2rem] items-center gap-3 px-4 py-2 text-xs">
            <span />
            <span>Модель</span>
            <span className="text-right">К лимиту</span>
            <span className="text-right">Ответов в неделю</span>
            <span />
          </div>
        )}
        {MODELS.map((m) => {
          const row = d.models.find((x) => x.id === m.id);
          const answers = answersPerWeek(d.week, m);
          const isDefault = d.defaultModel === m.id;
          return (
            <div
              className={cn("grid items-center gap-3 px-4 py-2.5", phone ? "grid-cols-[1.5rem_1fr_2rem]" : "grid-cols-[1.5rem_1fr_4.5rem_7rem_2rem]", !row?.on && "text-muted-foreground")}
              key={m.id}
            >
              <Checkbox aria-label={m.name} checked={row?.on ?? false} disabled={!m.priced || isDefault} onCheckedChange={(v) => toggle(m.id, v === true)} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn("truncate", row?.on && "font-medium")}>{m.name}</span>
                  <FitBadge answers={answers} m={m} />
                </span>
                <span className="text-muted-foreground text-xs">
                  {m.provider}
                  {phone && m.priced && ` · ${times(multiplier(m, base))} · ~${answers} в неделю`}
                </span>
              </span>
              {!phone && <span className="text-right tabular-nums">{m.priced ? times(multiplier(m, base)) : "—"}</span>}
              {!phone && <span className="text-right tabular-nums">{m.priced ? `~${answers}` : "—"}</span>}
              <DefaultStar disabled={!row?.on} on={isDefault} onClick={() => set({ ...d, defaultModel: m.id })} />
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        «×N» и ответы в неделю — по прайсу и среднему ответу этой установки. Основная модель — от 100 ответов, «дороже» — 25–99, меньше 25 в тариф обычно не берут. Без цены модель не включить: её расход не посчитать.
      </p>
    </div>
  );
};

// ── Возможности ─────────────────────────────────────────────────────────────────────────────────────────────────────

const EVERY: Record<Tariff["tasks"]["every"], string> = { "15min": "раз в 15 минут", day: "раз в день", hour: "раз в час" };

export const FeatureRows = ({ d, set }: { d: Tariff; set: (t: Tariff) => void }) => (
  <Rows>
    <Row hint="Задачи идут без человека и тратят лимит в фоне" label="Задачи">
      <span className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Сколько задач"
          className="w-20 text-right tabular-nums"
          inputMode="numeric"
          onChange={(e) => set({ ...d, tasks: { ...d.tasks, count: e.target.value.trim() === "" ? null : Number(e.target.value.replace(/\D/g, "")) } })}
          placeholder="∞"
          value={d.tasks.count ?? ""}
        />
        <Select onValueChange={(v) => set({ ...d, tasks: { ...d.tasks, every: v as Tariff["tasks"]["every"] } })} value={d.tasks.every}>
          <SelectTrigger aria-label="Как часто" className="w-40">
            <SelectValue>не чаще {EVERY[d.tasks.every]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(EVERY) as Tariff["tasks"]["every"][]).map((k) => (
              <SelectItem key={k} value={k}>
                не чаще {EVERY[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>
    </Row>
    <Row hint="Читает каждое письмо и по утрам присылает сводку" label="Память из почты">
      <Switch aria-label="Память из почты" checked={d.mailMemory} onCheckedChange={(v) => set({ ...d, mailMemory: v })} />
    </Row>
    <Row hint="Вдвое дороже обычных; первым в очереди при нагрузке" label="Быстрые версии моделей">
      <Switch aria-label="Быстрые версии моделей" checked={d.fast} onCheckedChange={(v) => set({ ...d, fast: v })} />
    </Row>
    <Row hint="Новое — первым: песочница для анализа данных, встречи" label="Ранний доступ">
      <Switch aria-label="Ранний доступ" checked={d.early} onCheckedChange={(v) => set({ ...d, early: v })} />
    </Row>
  </Rows>
);

export const ArchiveRow = ({ d, set }: { d: Tariff; set: (t: Tariff) => void }) => (
  <Section title="Архив">
    <div className="flex flex-col gap-3 rounded-lg border px-4 py-3 @lg:flex-row @lg:items-center @lg:justify-between">
      <span className="text-muted-foreground text-sm">
        {d.archived
          ? "В архиве: новых мест на этом тарифе не купить, занятые работают до конца оплаченного месяца."
          : `На тарифе ${seatsNext(d.id)} мест на декабрь — удалить нельзя, только в архив: новых мест на нём не купить.`}
      </span>
      <Button className="shrink-0 self-start" onClick={() => set({ ...d, archived: !d.archived })} size="sm" variant="outline">
        <Archive />
        {d.archived ? "Вернуть из архива" : "В архив"}
      </Button>
    </div>
  </Section>
);

/** Полоса «Сохранить» внизу: появляется, когда черновик отличается. */
export const SaveBar = ({ dirty, error, onSave, onReset, children }: { dirty: boolean; error: string | null; onSave: () => void; onReset: () => void; children?: ReactNode }) =>
  dirty ? (
    <div className="bg-background/95 sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t px-4 py-3 backdrop-blur max-sm:flex-col max-sm:items-stretch md:-mx-10 md:px-10 @max-md:flex-col @max-md:items-stretch">
      <span className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}>{error ?? children ?? "Есть несохранённые изменения. Новые лимиты действуют с ближайшего запроса."}</span>
      <span className="flex shrink-0 justify-end gap-2">
        <Button onClick={onReset} variant="ghost">
          Отменить
        </Button>
        <Button disabled={error !== null} onClick={onSave}>
          Сохранить
        </Button>
      </span>
    </div>
  ) : null;
