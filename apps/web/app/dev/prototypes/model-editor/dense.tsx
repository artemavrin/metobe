"use client";

// «Плотный»: the model opens into two lines, no form at all. Capabilities are four chips — a click steps
// yes → no → unsure; the price reads as a sentence with the numbers as fields: «$[3] вход · $[15] выход за [1M]».
// Everything saves by itself (a chip at once, a field when you leave it), with a short «Сохранено».
import { cn } from "@metobe/ui/lib/utils";
import { Check, HelpCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { CAPS, convert, MODELS, ModelsFrame, SYMBOL, UNITS } from "./shared";
import type { Cap, Model } from "./shared";

const NEXT = { false: null, null: true, true: false } as const;
const KEYS = ["input", "output", "cacheRead", "cacheWrite"] as const;

const Saved = ({ tick }: { tick: number }) => {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!tick) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), 1400);
    return () => clearTimeout(t);
  }, [tick]);
  return (
    <span
      aria-live="polite"
      className={cn(
        "text-success flex items-center gap-1 text-xs transition-opacity duration-200",
        shown ? "opacity-100" : "opacity-0"
      )}
    >
      <Check className="size-3" /> Сохранено
    </span>
  );
};

/** A number field sized to its content, part of a sentence. */
const Num = ({ value, onCommit, label, symbol }: { value: string; onCommit: (v: string) => void; label: string; symbol: string }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <span className="bg-background focus-within:border-ring focus-within:ring-ring/50 inline-flex h-7 items-center rounded-md border px-1.5 font-mono tabular-nums focus-within:ring-2">
      <span className="text-muted-foreground">{symbol}</span>
      <input
        aria-label={label}
        className="w-[var(--w)] bg-transparent text-right outline-none"
        inputMode="decimal"
        onBlur={() => v !== value && onCommit(v)}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="—"
        style={{ "--w": `${Math.max(2, v.length + 0.5)}ch` } as React.CSSProperties}
        value={v}
      />
    </span>
  );
};

const Editor = ({ model }: { model: Model }) => {
  const [m, setM] = useState(model);
  const [tick, setTick] = useState(0);
  const saved = () => setTick(Date.now());
  const [unit, setUnit] = useState(1_000_000);
  const p = m.prices ?? { cacheRead: null, cacheWrite: null, currency: "USD" as const, input: null, output: null, unit };
  const shown = (k: (typeof KEYS)[number]) => (p[k] ? convert(p[k] as string, p.unit, unit) : "");
  const s = SYMBOL[p.currency];
  const setPrice = (k: (typeof KEYS)[number], v: string) => {
    // Stored in the unit on screen; the other fields move to it exactly.
    const next = Object.fromEntries(KEYS.map((key) => [key, p[key] ? convert(p[key] as string, p.unit, unit) : null]));
    next[k] = v.trim() || null;
    setM({ ...m, prices: { ...p, ...next, unit } });
    saved();
  };
  const step = (k: Cap) => {
    setM({ ...m, caps: { ...m.caps, [k]: NEXT[String(m.caps[k]) as keyof typeof NEXT] }, manual: true });
    saved();
  };
  return (
    <div className="animate-in fade-in fill-mode-both bg-muted/20 flex flex-col gap-2.5 border-t px-4 py-3 duration-150 md:pl-12">
      <div className="flex flex-wrap items-center gap-1.5">
        {CAPS.map(({ icon: Icon, key, label }) => {
          const v = m.caps[key];
          return (
            <button
              aria-label={`${label}: ${v === true ? "да" : v === false ? "нет" : "не знаю"}`}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]",
                v === true && "border-success/40 bg-success/10 text-foreground",
                v === false && "text-muted-foreground/70 line-through decoration-1",
                v === null && "text-muted-foreground border-dashed"
              )}
              key={key}
              onClick={() => step(key)}
              title="Нажмите, чтобы переключить: да → нет → не знаю"
              type="button"
            >
              <Icon className="size-3.5" />
              {label}
              {v === true && <Check className="text-success size-3" />}
              {v === false && <X className="size-3" />}
              {v === null && <HelpCircle className="size-3" />}
            </button>
          );
        })}
        {m.manual && (
          <button className="text-muted-foreground hover:text-foreground ml-1 text-xs underline-offset-4 hover:underline" onClick={() => { setM({ ...model, prices: m.prices }); saved(); }} type="button">
            как у источника
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
        <Num label="Вход" onCommit={(v) => setPrice("input", v)} symbol={s} value={shown("input")} />
        <span className="text-muted-foreground">вход ·</span>
        <Num label="Выход" onCommit={(v) => setPrice("output", v)} symbol={s} value={shown("output")} />
        <span className="text-muted-foreground">выход · кеш</span>
        <Num label="Чтение кеша" onCommit={(v) => setPrice("cacheRead", v)} symbol={s} value={shown("cacheRead")} />
        <span className="text-muted-foreground">/</span>
        <Num label="Запись кеша" onCommit={(v) => setPrice("cacheWrite", v)} symbol={s} value={shown("cacheWrite")} />
        <span className="text-muted-foreground">за</span>
        <span className="bg-muted/60 inline-flex h-7 rounded-md p-0.5">
          {UNITS.map((u) => (
            <button
              className={cn("rounded-[5px] px-2 text-xs transition-colors duration-150", unit === u.value ? "bg-background shadow-xs" : "text-muted-foreground")}
              key={u.value}
              onClick={() => setUnit(u.value)}
              type="button"
            >
              {u.label}
            </button>
          ))}
        </span>
        <span className="text-muted-foreground">токенов</span>
        <span className="ml-auto">
          <Saved tick={tick} />
        </span>
      </div>
      {m.priceFromSource && <p className="text-muted-foreground text-xs">Цену сообщает источник; ваша правка сохранится до сброса.</p>}
    </div>
  );
};

export const DenseVariant = () => <ModelsFrame editor={(m) => <Editor key={m.id} model={m} />} models={MODELS} />;
