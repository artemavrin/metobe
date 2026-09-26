"use client";

// «Меню»: one entry point for mode and model. The pill says «Обычно · Claude Sonnet 4.6»; it opens three mode
// cards — what each is for, who answers, how soon it starts, what it can — and under them «Своя модель», which
// unfolds the full list in place. Nothing else in the bar competes with it.
import { InputGroupButton } from "@metobe/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { MODELS, MODES, modelById } from "./data";
import { ModeIcon, ModesField, useModesComposer } from "./modes-kit";
import { Caps, type ComposerProps, EASE, ModelList, SendButton } from "./shared";

export const ComposerModesMenu = (p: ComposerProps) => {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(false);
  const c = useModesComposer({
    ...p,
    onHotkey: () => {
      setOwn(false);
      setOpen(true);
    },
  });

  const bar = (
    <>
      <Popover
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setOwn(false);
          }
        }}
        open={open}
      >
        <PopoverTrigger render={<InputGroupButton className="h-7 gap-1.5 pr-1.5" size="xs" variant="outline" />}>
          {c.manual ? (
            <BrandLogo label={c.model.makerTitle} logo={c.model.maker} size={14} tile={false} />
          ) : (
            <ModeIcon className="size-3.5" id={c.current.id} />
          )}
          <span>{c.manual ? "Своя" : c.current.title}</span>
          <span className="text-muted-foreground">· {c.model.title}</span>
          <ChevronDown className="opacity-50" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[26rem] gap-1 p-1.5" side="top">
          {own ? (
            <div className={cn("animate-in fade-in slide-in-from-right-2 duration-200 motion-reduce:slide-in-from-right-0", EASE)}>
              <button className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 text-xs transition-colors" onClick={() => setOwn(false)} type="button">
                ← Режимы
              </button>
              <ModelList
                current={c.model.id}
                onPick={(m) => {
                  c.setManual(m.id);
                  setOpen(false);
                }}
              />
            </div>
          ) : (
            <div className="animate-in fade-in flex flex-col gap-1 duration-150" role="radiogroup">
              {MODES.map((m) => {
                const model = modelById(m.model);
                const active = !c.manual && c.mode === m.id;
                return (
                  <button
                    aria-checked={active}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-2.5 text-left transition-[background-color,border-color] duration-150 active:scale-[0.99]",
                      active ? "border-primary/40 bg-primary/5" : "hover:bg-muted/60 border-transparent"
                    )}
                    key={m.id}
                    onClick={() => {
                      c.setManual(null);
                      c.setMode(m.id);
                      setOpen(false);
                    }}
                    role="radio"
                    type="button"
                  >
                    <span className={cn("bg-muted flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4", active && "bg-primary text-primary-foreground")}>
                      <ModeIcon id={m.id} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{m.title}</span>
                        <span className="text-muted-foreground text-[11px] tabular-nums">начинает за {m.firstToken}</span>
                      </span>
                      <span className="text-muted-foreground text-xs">{m.hint}</span>
                      <span className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5">
                          <BrandLogo label={model.makerTitle} logo={model.maker} size={14} tile={false} />
                          {model.title}
                        </span>
                        <Caps m={model} />
                      </span>
                    </span>
                  </button>
                );
              })}
              <button
                className="hover:bg-muted/60 flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors"
                onClick={() => setOwn(true)}
                type="button"
              >
                <span className="flex flex-col text-left">
                  <span>Своя модель</span>
                  <span className="text-muted-foreground text-xs">Любая из {MODELS.length} в чате — для этого разговора</span>
                </span>
                <ChevronRight className="text-muted-foreground size-4" />
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <span className="ml-auto">
        <SendButton disabled={!c.text.trim()} onStop={p.onStop} streaming={p.streaming} />
      </span>
    </>
  );

  return <ModesField {...p} bar={bar} c={c} />;
};

