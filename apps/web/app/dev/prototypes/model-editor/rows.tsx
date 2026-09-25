"use client";

// «Строки»: the model opens into settings rows, like every other settings screen. Each capability is a row with a
// compact three-way switch that saves at once; the price is one row «$3 / $15 за 1M» with «Изменить», which opens
// the usual editor under it (field, «Отмена», main action). One way to save per row, as everywhere else.
import { Button } from "@metobe/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@metobe/ui/components/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { cn } from "@metobe/ui/lib/utils";
import { Check, X } from "lucide-react";
import { useState } from "react";

import { CAPS, convert, MODELS, ModelsFrame, priceLine, SYMBOL, UNITS } from "./shared";
import type { Cap, Model, Prices } from "./shared";

export type V = "yes" | "no" | "unknown";
export const toV = (v: boolean | null): V => (v === null ? "unknown" : v ? "yes" : "no");

/** Three options in one pill; the chosen one's background slides (it's a state change you watch). */
export const Tri = ({ value, onChange, label }: { value: V; onChange: (v: V) => void; label: string }) => {
  const opts: { v: V; node: React.ReactNode; name: string }[] = [
    { name: "да", node: <Check className="size-3.5" />, v: "yes" },
    { name: "нет", node: <X className="size-3.5" />, v: "no" },
    { name: "не знаю", node: "?", v: "unknown" },
  ];
  const i = opts.findIndex((o) => o.v === value);
  return (
    <div aria-label={label} className="bg-muted/60 relative flex h-7 rounded-md p-0.5" role="radiogroup">
      <span
        aria-hidden
        className="bg-background absolute top-0.5 bottom-0.5 left-0.5 w-8 rounded-[5px] shadow-xs transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${i * 32}px)` }}
      />
      {opts.map((o) => (
        <button
          aria-checked={o.v === value}
          aria-label={o.name}
          className={cn(
            "relative z-[1] flex w-8 items-center justify-center text-xs font-medium transition-colors duration-150",
            o.v === value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
          key={o.v}
          onClick={() => onChange(o.v)}
          role="radio"
          title={o.name}
          type="button"
        >
          {o.node}
        </button>
      ))}
    </div>
  );
};

const Row = ({ label, hint, children, action }: { label: React.ReactNode; hint?: string; children?: React.ReactNode; action?: React.ReactNode }) => (
  <div className="flex min-h-12 flex-col gap-2 px-4 py-2.5 md:flex-row md:items-center md:gap-6">
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="flex items-center gap-2 font-medium">{label}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
    <div className="flex items-center gap-3">
      {children}
      {action}
    </div>
  </div>
);

export const PriceEditor = ({ prices, onSave, onCancel }: { prices: Prices | null; onSave: (p: Prices) => void; onCancel: () => void }) => {
  const start = prices ?? { cacheRead: null, cacheWrite: null, currency: "USD" as const, input: null, output: null, unit: 1_000_000 };
  // Shown per 1M by default; switching the unit converts what is typed, so the price keeps its meaning.
  const [unit, setUnit] = useState(1_000_000);
  const [currency, setCurrency] = useState(start.currency);
  const [v, setV] = useState({
    cacheRead: start.cacheRead ? convert(start.cacheRead, start.unit, unit) : "",
    cacheWrite: start.cacheWrite ? convert(start.cacheWrite, start.unit, unit) : "",
    input: start.input ? convert(start.input, start.unit, unit) : "",
    output: start.output ? convert(start.output, start.unit, unit) : "",
  });
  const changeUnit = (next: number) => {
    setV((cur) => Object.fromEntries(Object.entries(cur).map(([k, x]) => [k, x ? convert(x, unit, next) : ""])) as typeof v);
    setUnit(next);
  };
  const field = (k: keyof typeof v, label: string) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <InputGroup>
        <InputGroupAddon>{SYMBOL[currency]}</InputGroupAddon>
        <InputGroupInput className="font-mono tabular-nums" inputMode="decimal" onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder="—" value={v[k]} />
      </InputGroup>
    </label>
  );
  const blank = (x: string) => (x.trim() ? x.trim() : null);
  return (
    <div className="animate-in fade-in fill-mode-both flex flex-col gap-3 px-4 pb-4 duration-150">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {field("input", "Вход")}
        {field("output", "Выход")}
        {field("cacheRead", "Чтение кеша")}
        {field("cacheWrite", "Запись кеша")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">за</span>
        <Select onValueChange={(x) => changeUnit(Number(x))} value={String(unit)}>
          <SelectTrigger className="w-24" size="sm">
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
        <span className="text-muted-foreground text-xs">токенов,</span>
        <Select onValueChange={(x) => setCurrency(x as Prices["currency"])} value={currency}>
          <SelectTrigger className="w-20" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="RUB">RUB</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel} size="sm" variant="ghost">
            Отмена
          </Button>
          <Button
            onClick={() =>
              onSave({ cacheRead: blank(v.cacheRead), cacheWrite: blank(v.cacheWrite), currency, input: blank(v.input), output: blank(v.output), unit })
            }
            size="sm"
          >
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
};

const Editor = ({ model }: { model: Model }) => {
  const [m, setM] = useState(model);
  const [editingPrice, setEditingPrice] = useState(false);
  const setCap = (k: Cap, v: V) => setM({ ...m, caps: { ...m.caps, [k]: v === "unknown" ? null : v === "yes" }, manual: true });
  const price = priceLine(m.prices);
  return (
    <div className="bg-muted/20 border-t">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-muted-foreground font-mono text-xs">{m.id}</span>
        {m.manual && (
          <Button className="h-7" onClick={() => setM({ ...model, prices: m.prices })} size="sm" variant="ghost">
            Как у источника
          </Button>
        )}
      </div>
      <div className="divide-y">
        {CAPS.map(({ icon: Icon, key, label }) => (
          <Row
            key={key}
            label={
              <>
                <Icon className="text-muted-foreground size-3.5" />
                {label}
              </>
            }
          >
            <Tri label={label} onChange={(v) => setCap(key, v)} value={toV(m.caps[key])} />
          </Row>
        ))}
        <div>
          <Row
            action={
              !editingPrice && (
                <Button onClick={() => setEditingPrice(true)} size="sm" variant="ghost">
                  Изменить
                </Button>
              )
            }
            hint={m.priceFromSource ? "За 1M токенов · сообщает источник, при обновлении списка обновится" : "За 1M токенов"}
            label="Цена"
          >
            <span className={cn("font-mono text-sm tabular-nums", !price && "text-muted-foreground font-sans")}>{price ?? "не задана"}</span>
          </Row>
          {editingPrice && (
            <PriceEditor
              onCancel={() => setEditingPrice(false)}
              onSave={(p) => {
                setM({ ...m, prices: p });
                setEditingPrice(false);
              }}
              prices={m.prices}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const RowsVariant = () => <ModelsFrame editor={(m) => <Editor key={m.id} model={m} />} models={MODELS} />;
