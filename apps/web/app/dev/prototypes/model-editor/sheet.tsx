"use client";

// «Панель»: the model opens in a side sheet — its own surface with room for what the list has no space for: the id,
// context, release date, where the price comes from. Capabilities and prices are one form with one «Сохранить»;
// nothing changes until it is pressed, and «Отмена» (or Esc) leaves the model as it was.
import { Button } from "@metobe/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@metobe/ui/components/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@metobe/ui/components/sheet";
import { ToggleGroup, ToggleGroupItem } from "@metobe/ui/components/toggle-group";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { CAPS, contextLabel, convert, MODELS, ModelsFrame, SYMBOL, UNITS } from "./shared";
import type { Caps, Model, Prices } from "./shared";

type V = "yes" | "no" | "unknown";
const toV = (v: boolean | null): V => (v === null ? "unknown" : v ? "yes" : "no");
const fromV = (v: V) => (v === "unknown" ? null : v === "yes");
const PRICE_ROWS = [
  { key: "input", label: "Вход" },
  { key: "output", label: "Выход" },
  { key: "cacheRead", label: "Чтение кеша" },
  { key: "cacheWrite", label: "Запись кеша" },
] as const;

const Form = ({ model, onClose }: { model: Model; onClose: () => void }) => {
  const [caps, setCaps] = useState<Caps>(model.caps);
  const [unit, setUnit] = useState(1_000_000);
  const p = model.prices;
  const [currency, setCurrency] = useState<Prices["currency"]>(p?.currency ?? "USD");
  const [v, setV] = useState(() =>
    Object.fromEntries(PRICE_ROWS.map(({ key }) => [key, p?.[key] ? convert(p[key] as string, p.unit, unit) : ""])) as Record<(typeof PRICE_ROWS)[number]["key"], string>
  );
  const changeUnit = (next: number) => {
    setV((cur) => Object.fromEntries(Object.entries(cur).map(([k, x]) => [k, x ? convert(x, unit, next) : ""])) as typeof v);
    setUnit(next);
  };
  const dirty = JSON.stringify(caps) !== JSON.stringify(model.caps) || PRICE_ROWS.some(({ key }) => (v[key] || null) !== (p?.[key] ? convert(p[key] as string, p.unit, unit) : null));
  const released = model.released ? new Date(model.released).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex items-center gap-3">
          <BrandLogo label={model.maker.title} logo={model.maker.logo} size={36} />
          <div className="min-w-0">
            <SheetTitle>{model.title}</SheetTitle>
            <SheetDescription className="truncate font-mono text-xs">{model.id}</SheetDescription>
          </div>
        </div>
        <dl className="text-muted-foreground mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt>Производитель</dt>
          <dd className="text-foreground">{model.maker.title}</dd>
          <dt>Контекст</dt>
          <dd className="text-foreground">{contextLabel(model.context) ?? "не сообщается"}</dd>
          <dt>Вышла</dt>
          <dd className="text-foreground">{released ?? "не сообщается"}</dd>
        </dl>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4">
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Возможности</h3>
            {model.manual && (
              <button className="text-muted-foreground hover:text-foreground text-xs" onClick={() => setCaps(model.caps)} type="button">
                Как у источника
              </button>
            )}
          </div>
          {CAPS.map(({ icon: Icon, key, label }) => (
            <div className="flex items-center justify-between gap-3" key={key}>
              <span className="flex items-center gap-2">
                <Icon className="text-muted-foreground size-3.5" />
                {label}
              </span>
              <ToggleGroup
                aria-label={label}
                onValueChange={(x) => x[0] && setCaps({ ...caps, [key]: fromV(x[0] as V) })}
                size="sm"
                spacing={0}
                value={[toV(caps[key])]}
                variant="outline"
              >
                <ToggleGroupItem value="yes">Да</ToggleGroupItem>
                <ToggleGroupItem value="no">Нет</ToggleGroupItem>
                <ToggleGroupItem value="unknown">Не знаю</ToggleGroupItem>
              </ToggleGroup>
            </div>
          ))}
          <p className="text-muted-foreground text-xs">«Не знаю» — попробуем, при ошибке отключим.</p>
        </section>
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Цены</h3>
            <span className="text-muted-foreground text-xs">за</span>
            <Select onValueChange={(x) => changeUnit(Number(x))} value={String(unit)}>
              <SelectTrigger className="w-20" size="sm">
                <SelectValue>{UNITS.find((u) => u.value === unit)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u.value} value={String(u.value)}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-xs">токенов</span>
            <Select onValueChange={(x) => setCurrency(x as Prices["currency"])} value={currency}>
              <SelectTrigger className="ml-auto w-20" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="RUB">RUB</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="divide-y rounded-lg border">
            {PRICE_ROWS.map(({ key, label }) => (
              <label className="flex items-center justify-between gap-3 px-3 py-2" key={key}>
                <span>{label}</span>
                <InputGroup className="w-40">
                  <InputGroupAddon>{SYMBOL[currency]}</InputGroupAddon>
                  <InputGroupInput className="text-right font-mono tabular-nums" inputMode="decimal" onChange={(e) => setV({ ...v, [key]: e.target.value })} placeholder="—" value={v[key]} />
                </InputGroup>
              </label>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            {model.priceFromSource ? "Цены сообщает источник; ваши сохранятся, пока их не сбросят." : "Как в прайсе провайдера. Сохраняем как ввели, без округления."}
          </p>
        </section>
      </div>
      <SheetFooter className="flex-row justify-end border-t">
        <Button onClick={onClose} variant="ghost">
          Отмена
        </Button>
        <Button disabled={!dirty} onClick={onClose}>
          Сохранить
        </Button>
      </SheetFooter>
    </>
  );
};

export const SheetVariant = () => {
  const [open, setOpen] = useState<Model | null>(null);
  return (
    <>
      <ModelsFrame models={MODELS} onOpen={setOpen} />
      <Sheet onOpenChange={(o) => !o && setOpen(null)} open={Boolean(open)}>
        <SheetContent className="w-full sm:max-w-md">{open && <Form key={open.id} model={open} onClose={() => setOpen(null)} />}</SheetContent>
      </Sheet>
    </>
  );
};
