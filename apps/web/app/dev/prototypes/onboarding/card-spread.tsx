"use client";

// Card "Разворот": one wide card, two columns — the left page names the step, the right page does it.
import { Button } from "@purr/ui/components/button";
import { Frame, FramePanel } from "@purr/ui/components/reui/frame";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import { cn } from "@purr/ui/lib/utils";
import { ArrowLeft, Check } from "lucide-react";

import { copy, STEPS, StepBody, stepNumber, stepSummary, useOnboarding } from "./steps";

export const CardSpread = () => {
  const o = useOnboarding();
  const { title, description } = copy(o);
  const n = stepNumber(o.step);
  const canBack = o.step === "key" || o.step === "models";

  return (
    <div className="bg-muted/40 flex min-h-dvh justify-center px-6 pt-[10vh] pb-24">
      <Frame className="h-fit w-full max-w-4xl" spacing="lg">
        <FramePanel className="grid grid-cols-[280px_1fr] gap-0 p-0!">
          <aside className="bg-muted/50 flex flex-col gap-6 rounded-l-[inherit] border-r p-7">
            <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">Настройка Purr</span>
            <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both flex flex-col gap-2 duration-200 ease-out" key={o.step}>
              {o.step === "done" ? (
                <IconTile className="text-success animate-in zoom-in-90 fade-in fill-mode-both duration-300 ease-out" size="lg" variant="soft">
                  <Check />
                </IconTile>
              ) : (
                <span className="text-primary text-5xl font-semibold tracking-tight tabular-nums">{String(n).padStart(2, "0")}</span>
              )}
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              <p className="text-muted-foreground text-sm">{description}</p>
            </div>
            <ol className="mt-auto flex flex-col gap-2.5 text-sm">
              {STEPS.map((s, i) => {
                const done = n > i + 1;
                const active = n === i + 1;
                return (
                  <li className="flex items-center gap-2.5" key={s.id}>
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors duration-200",
                        done && "border-success bg-success text-white",
                        active && "border-primary text-primary"
                      )}
                    >
                      {done ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span className={cn(active ? "font-medium" : "text-muted-foreground")}>{s.title}</span>
                    {done && <span className="text-muted-foreground ml-auto truncate text-xs">{stepSummary(o, s.id)}</span>}
                  </li>
                );
              })}
            </ol>
            {canBack && (
              <Button className="-ml-2 w-fit" onClick={o.back} size="xs" variant="ghost">
                <ArrowLeft /> Назад
              </Button>
            )}
          </aside>
          <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both min-h-[480px] p-7 duration-200 ease-out" key={o.step}>
            <StepBody large o={o} />
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
};
