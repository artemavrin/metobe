"use client";

// Round 2 — the sheet was chosen; what goes inside it. Same frame (list → side sheet → the model's header),
// three fillings: «Разделы» (everything on one screen, one «Сохранить»), «Вкладки» (one thing per tab, one
// «Сохранить»), «Строки» (settings rows, each saves itself, no footer — like every other settings screen).
import { Button } from "@metobe/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@metobe/ui/components/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@metobe/ui/components/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@metobe/ui/components/tabs";
import { cn } from "@metobe/ui/lib/utils";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { PriceEditor, toV, Tri } from "./rows";
import type { V } from "./rows";
import { CAPS, CapIcons, contextLabel, convert, MODELS, ModelsFrame, priceLine, SYMBOL, UNITS } from "./shared";
import type { Caps, Model, Prices } from "./shared";

const fromV = (v: V) => (v === "unknown" ? null : v === "yes");
const released = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "не сообщается";

const Header = ({ m, facts = true }: { m: Model; facts?: boolean }) => (
  <SheetHeader className="border-b px-5 py-4">
    <div className="flex items-center gap-3">
      <BrandLogo label={m.maker.title} logo={m.maker.logo} size={36} />
      <div className="min-w-0">
        <SheetTitle>{m.title}</SheetTitle>
        <SheetDescription className="truncate font-mono text-xs">{m.id}</SheetDescription>
      </div>
    </div>
    {facts && (
      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>{m.maker.title}</span>
        <span>контекст {contextLabel(m.context) ?? "не сообщается"}</span>
        <span>вышла {released(m.released)}</span>
      </div>
    )}
  </SheetHeader>
);

/** The price as a table: one unit for all four, switching the unit converts what is typed exactly. */
const PriceTable = ({ prices, onChange }: { prices: Prices | null; onChange: (p: Prices) => void }) => {
  const p = prices ?? { cacheRead: null, cacheWrite: null, currency: "USD" as const, input: null, output: null, unit: 1_000_000 };
  const [unit, setUnit] = useState(1_000_000);
  const shown = (k: "input" | "output" | "cacheRead" | "cacheWrite") => (p[k] ? convert(p[k] as string, p.unit, unit) : "");
  const set = (k: "input" | "output" | "cacheRead" | "cacheWrite", value: string) => {
    const next = { cacheRead: shown("cacheRead") || null, cacheWrite: shown("cacheWrite") || null, input: shown("input") || null, output: shown("output") || null };
    next[k] = value.trim() || null;
    onChange({ ...p, ...next, unit });
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">за</span>
        <Select onValueChange={(x) => setUnit(Number(x))} value={String(unit)}>
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
        <span className="text-muted-foreground">токенов</span>
        <Select onValueChange={(x) => onChange({ ...p, currency: x as Prices["currency"] })} value={p.currency}>
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
        {(
          [
            ["input", "Вход"],
            ["output", "Выход"],
            ["cacheRead", "Чтение кеша"],
            ["cacheWrite", "Запись кеша"],
          ] as const
        ).map(([k, label]) => (
          <label className="flex items-center justify-between gap-3 px-3 py-2" key={k}>
            <span>{label}</span>
            <InputGroup className="w-40">
              <InputGroupAddon>{SYMBOL[p.currency]}</InputGroupAddon>
              <InputGroupInput className="text-right font-mono tabular-nums" inputMode="decimal" onChange={(e) => set(k, e.target.value)} placeholder="—" value={shown(k)} />
            </InputGroup>
          </label>
        ))}
      </div>
    </div>
  );
};

const CAP_HINT = {
  reasoning: "Думает перед ответом",
  structured: "Отвечает строго по JSON-схеме",
  tools: "Вызывает инструменты и MCP",
  vision: "Понимает картинки во вложениях",
};

/** Rows like a settings list: name and a line of what it means on the left, the switch on the right. */
const CapsList = ({ caps, onChange }: { caps: Caps; onChange: (c: Caps) => void }) => (
  <div className="divide-y">
    {CAPS.map(({ key, label }) => (
      <div className="flex items-center justify-between gap-4 py-3 first:pt-0" key={key}>
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground text-xs">{CAP_HINT[key]}</span>
        </span>
        <Tri label={label} onChange={(v) => onChange({ ...caps, [key]: fromV(v) })} value={toV(caps[key])} />
      </div>
    ))}
  </div>
);

/** Two equal buttons on a quiet band: «Сбросить» brings back what was there, «Сохранить» applies. */
const Footer = ({ dirty, onClose, reset }: { dirty: boolean; onClose: () => void; reset: () => void }) => (
  <SheetFooter className="bg-muted/50 mt-0 grid grid-cols-2 gap-3 border-t p-4">
    <Button className="h-9" disabled={!dirty} onClick={reset} variant="outline">
      Сбросить
    </Button>
    <Button className="h-9" disabled={!dirty} onClick={onClose}>
      Сохранить
    </Button>
  </SheetFooter>
);

// 1. «Разделы» ----------------------------------------------------------------------------------------------------

const Sections = ({ m, close }: { m: Model; close: () => void }) => {
  const [caps, setCaps] = useState(m.caps);
  const [prices, setPrices] = useState(m.prices);
  const dirty = JSON.stringify([caps, prices]) !== JSON.stringify([m.caps, m.prices]);
  return (
    <>
      <Header m={m} />
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pt-5 pb-5">
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Возможности</h3>
          <CapsList caps={caps} onChange={setCaps} />
          <p className="text-muted-foreground text-xs">«?» — не знаем: попробуем, при ошибке отключим.</p>
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Цены</h3>
          <PriceTable onChange={setPrices} prices={prices} />
          <p className="text-muted-foreground text-xs">
            {m.priceFromSource ? "Сообщает источник; ваша правка сохранится до сброса." : "Как в прайсе провайдера, без округления."}
          </p>
        </section>
      </div>
      <Footer
        dirty={dirty}
        onClose={close}
        reset={() => {
          setCaps(m.caps);
          setPrices(m.prices);
        }}
      />
    </>
  );
};

// 2. «Вкладки» ----------------------------------------------------------------------------------------------------

const TabbedPanel = ({ m, close }: { m: Model; close: () => void }) => {
  const [caps, setCaps] = useState(m.caps);
  const [prices, setPrices] = useState(m.prices);
  const dirty = JSON.stringify([caps, prices]) !== JSON.stringify([m.caps, m.prices]);
  return (
    <>
      <Header facts={false} m={m} />
      <Tabs className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4 pb-5" defaultValue="caps">
        <TabsList className="w-full">
          <TabsTrigger value="caps">Возможности</TabsTrigger>
          <TabsTrigger value="price">Цены</TabsTrigger>
          <TabsTrigger value="about">О модели</TabsTrigger>
        </TabsList>
        <TabsContent className="flex flex-col gap-3" value="caps">
          <CapsList caps={caps} onChange={setCaps} />
          <p className="text-muted-foreground text-xs">«?» — не знаем: попробуем, при ошибке отключим.</p>
        </TabsContent>
        <TabsContent className="flex flex-col gap-3" value="price">
          <PriceTable onChange={setPrices} prices={prices} />
          <p className="text-muted-foreground text-xs">
            {m.priceFromSource ? "Сообщает источник; ваша правка сохранится до сброса." : "Как в прайсе провайдера, без округления."}
          </p>
        </TabsContent>
        <TabsContent value="about">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-muted-foreground">Производитель</dt>
            <dd>{m.maker.title}</dd>
            <dt className="text-muted-foreground">Контекст</dt>
            <dd>{contextLabel(m.context) ?? "не сообщается"}</dd>
            <dt className="text-muted-foreground">Вышла</dt>
            <dd>{released(m.released)}</dd>
            <dt className="text-muted-foreground">Идентификатор</dt>
            <dd className="font-mono text-xs break-all">{m.id}</dd>
          </dl>
        </TabsContent>
      </Tabs>
      <Footer
        dirty={dirty}
        onClose={close}
        reset={() => {
          setCaps(m.caps);
          setPrices(m.prices);
        }}
      />
    </>
  );
};

// 3. «Строки» -----------------------------------------------------------------------------------------------------

const Saved = ({ tick }: { tick: number }) => {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!tick) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), 1400);
    return () => clearTimeout(t);
  }, [tick]);
  return (
    <span aria-live="polite" className={cn("text-success flex items-center gap-1 text-xs transition-opacity duration-200", shown ? "opacity-100" : "opacity-0")}>
      <Check className="size-3" /> Сохранено
    </span>
  );
};

const PanelRow = ({ label, hint, children }: { label: ReactNode; hint?: string; children?: ReactNode }) => (
  <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5">
    <div className="flex min-w-0 flex-col">
      <span className="flex items-center gap-2">{label}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </div>
);

const RowsPanel = ({ m }: { m: Model }) => {
  const [caps, setCaps] = useState(m.caps);
  const [prices, setPrices] = useState(m.prices);
  const [editingPrice, setEditingPrice] = useState(false);
  const [tick, setTick] = useState(0);
  const manual = JSON.stringify(caps) !== JSON.stringify(m.caps);
  return (
    <>
      <Header m={m} />
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pt-5 pb-6">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Возможности</h3>
            <Saved tick={tick} />
          </div>
          <div className="divide-y rounded-lg border">
            {CAPS.map(({ icon: Icon, key, label }) => (
              <PanelRow
                key={key}
                label={
                  <>
                    <Icon className="text-muted-foreground size-3.5" />
                    {label}
                  </>
                }
              >
                <Tri
                  label={label}
                  onChange={(v) => {
                    setCaps({ ...caps, [key]: fromV(v) });
                    setTick(Date.now());
                  }}
                  value={toV(caps[key])}
                />
              </PanelRow>
            ))}
          </div>
          {manual && (
            <button className="text-muted-foreground hover:text-foreground self-start text-xs underline-offset-4 hover:underline" onClick={() => { setCaps(m.caps); setTick(Date.now()); }} type="button">
              Вернуть как у источника
            </button>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Цена</h3>
          <div className="rounded-lg border">
            <PanelRow hint={m.priceFromSource ? "за 1M токенов · сообщает источник" : "за 1M токенов"} label={<span className="font-mono tabular-nums">{priceLine(prices) ?? "не задана"}</span>}>
              {!editingPrice && (
                <Button onClick={() => setEditingPrice(true)} size="sm" variant="ghost">
                  Изменить
                </Button>
              )}
            </PanelRow>
            {editingPrice && (
              <PriceEditor
                onCancel={() => setEditingPrice(false)}
                onSave={(p) => {
                  setPrices(p);
                  setEditingPrice(false);
                  setTick(Date.now());
                }}
                prices={prices}
              />
            )}
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">В чате</h3>
          <div className="text-muted-foreground flex items-center gap-2 rounded-lg border px-4 py-3 text-xs">
            <CapIcons caps={caps} manual={manual} />
            так модель видят в выборе модели
          </div>
        </section>
      </div>
    </>
  );
};

// Host --------------------------------------------------------------------------------------------------------

const PanelHost = ({ content }: { content: (m: Model, close: () => void) => ReactNode }) => {
  const [open, setOpen] = useState<Model | null>(null);
  return (
    <>
      <ModelsFrame models={MODELS} onOpen={setOpen} />
      <Sheet onOpenChange={(o) => !o && setOpen(null)} open={Boolean(open)}>
        {/* A floating drawer: inset from the edges, rounded, like a card over the page */}
        <SheetContent className="gap-0 overflow-hidden rounded-2xl border shadow-xl data-[side=right]:inset-y-3 data-[side=right]:right-3 data-[side=right]:h-[calc(100%-1.5rem)] data-[side=right]:w-[calc(100%-1.5rem)] data-[side=right]:sm:max-w-md">
          {open && <div className="contents" key={open.id}>{content(open, () => setOpen(null))}</div>}
        </SheetContent>
      </Sheet>
    </>
  );
};

export const SectionsVariant = () => <PanelHost content={(m, close) => <Sections close={close} m={m} />} />;
export const TabsVariant = () => <PanelHost content={(m, close) => <TabbedPanel close={close} m={m} />} />;
export const RowsPanelVariant = () => <PanelHost content={(m) => <RowsPanel m={m} />} />;
