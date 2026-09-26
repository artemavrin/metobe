"use client";

// «Шкала»: one scale from faster to deeper instead of three buttons — the modes read as a trade-off, not a menu.
// The thumb slides between three stops (arrows move it, it is a radio group underneath); next to it — who
// answers and how soon it usually starts. «Точнее…» picks a model by hand and parks the scale.
import { InputGroupButton } from "@metobe/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { EFFORTS, type Mode, MODES } from "./data";
import { type ModeId, ModesField, useModesComposer } from "./modes-kit";
import { type ComposerProps, EASE, ModelList, SendButton } from "./shared";

const STOP = 64; // px between stops

const Scale = ({ value, onChange, parked }: { value: ModeId; onChange: (m: ModeId) => void; parked: boolean }) => {
  const i = MODES.findIndex((m) => m.id === value);
  return (
    <div aria-label="Насколько думать" className={cn("ml-2 flex flex-col gap-1 transition-opacity duration-150", parked && "opacity-40")} role="radiogroup">
      <div className="relative h-4" style={{ width: STOP * (MODES.length - 1) + 16 }}>
        <span className="bg-muted absolute top-1/2 right-2 left-2 h-1 -translate-y-1/2 rounded-full" />
        <span
          className={cn("bg-primary/70 absolute top-1/2 left-2 h-1 origin-left -translate-y-1/2 rounded-full transition-transform duration-200 motion-reduce:transition-none", EASE)}
          style={{ transform: `translateY(-50%) scaleX(${i / (MODES.length - 1)})`, width: STOP * (MODES.length - 1) }}
        />
        {MODES.map((m, k) => (
          <label
            className="absolute top-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full has-focus-visible:ring-2 has-focus-visible:ring-ring/50"
            key={m.id}
            style={{ left: 8 + k * STOP }}
          >
            <input checked={value === m.id} className="sr-only" name="scale" onChange={() => onChange(m.id)} type="radio" />
            <span className={cn("size-1.5 rounded-full", k <= i ? "bg-primary/70" : "bg-foreground/20")} />
            <span className="sr-only">{m.title}</span>
          </label>
        ))}
        <span
          aria-hidden
          className={cn("bg-background border-primary pointer-events-none absolute top-1/2 left-0 size-4 rounded-full border-2 shadow-sm transition-transform duration-200 motion-reduce:transition-none", EASE)}
          style={{ transform: `translate(${i * STOP}px, -50%)` }}
        />
      </div>
      {/* Each label centred under its stop */}
      <div className="text-muted-foreground relative h-3.5 text-[10px]" style={{ width: STOP * (MODES.length - 1) + 16 }}>
        {MODES.map((m, k) => (
          <span className={cn("absolute -translate-x-1/2 whitespace-nowrap transition-colors duration-150", m.id === value && "text-foreground font-medium")} key={m.id} style={{ left: 8 + k * STOP }}>
            {m.title}
          </span>
        ))}
      </div>
    </div>
  );
};

export const ComposerModesScale = (p: ComposerProps) => {
  const [open, setOpen] = useState(false);
  const c = useModesComposer({ ...p, onHotkey: () => setOpen(true) });
  const m = c.current as Mode;

  const bar = (
    <>
      <span className="flex items-center gap-4">
        <Scale onChange={(v) => {
            c.setManual(null);
            c.setMode(v);
          }} parked={Boolean(c.manual)} value={c.mode} />
        <span className={cn("animate-in fade-in flex min-w-0 flex-col text-xs duration-150", EASE)} key={c.model.id}>
          <span className="flex items-center gap-1.5">
            <BrandLogo label={c.model.makerTitle} logo={c.model.maker} size={14} tile={false} />
            <span className="truncate">{c.model.title}</span>
          </span>
          <span className="text-muted-foreground">
            {c.manual ? (
              <button className="hover:text-foreground underline-offset-2 transition-colors hover:underline" onClick={() => c.setManual(null)} type="button">
                вернуть шкалу
              </button>
            ) : (
              `${EFFORTS.find((e) => e.id === m.effort)?.label.toLowerCase()} · начинает за ${m.firstToken}`
            )}
          </span>
        </span>
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Popover onOpenChange={setOpen} open={open}>
          <PopoverTrigger render={<InputGroupButton className="text-muted-foreground" size="xs" variant="ghost" />}>Точнее…</PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-1" side="top">
            <ModelList
              current={c.model.id}
              onPick={(x) => {
                c.setManual(x.id);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <SendButton disabled={!c.text.trim()} onStop={p.onStop} streaming={p.streaming} />
      </span>
    </>
  );

  return <ModesField {...p} bar={bar} c={c} />;
};

