"use client";

// Layout: a left rail tells the story (vertical stepper with what was chosen), the right side holds one step.
import { Button } from "@purr/ui/components/button";
import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@purr/ui/components/reui/stepper";
import { ArrowLeft, Check } from "lucide-react";

import { copy, PurrMark, STEPS, StepBody, stepNumber, stepSummary, useOnboarding } from "./steps";

const HINTS = {
  key: "Проверим ключ и доступность",
  models: "Выберите, что увидят в чате",
  pick: "Откуда брать модели",
} as const;

export const LayoutSplit = () => {
  const o = useOnboarding();
  const { title, description } = copy(o);
  const n = stepNumber(o.step);

  return (
    <div className="bg-background grid min-h-dvh grid-cols-[360px_1fr]">
      <aside className="bg-muted/40 flex flex-col border-r px-8 py-8">
        <PurrMark />
        <div className="mt-16">
          <h2 className="text-lg font-semibold tracking-tight">Настроим Purr</h2>
          <p className="text-muted-foreground mt-1 text-sm">Три шага — и можно в чат.</p>
        </div>
        <Stepper className="mt-10" indicators={{ completed: <Check className="size-3.5" /> }} orientation="vertical" value={n}>
          <StepperNav>
            {STEPS.map((s, i) => (
              <StepperItem className="relative items-start not-last:flex-1" key={s.id} step={i + 1}>
                <StepperTrigger className="pointer-events-none items-start gap-3 pb-10 last:pb-0">
                  <StepperIndicator className="data-[state=completed]:bg-success data-[state=completed]:text-white">{i + 1}</StepperIndicator>
                  <div className="mt-0.5 text-left">
                    <StepperTitle>{s.title}</StepperTitle>
                    <StepperDescription>{n > i + 1 ? stepSummary(o, s.id) : HINTS[s.id]}</StepperDescription>
                  </div>
                </StepperTrigger>
                {i < STEPS.length - 1 && (
                  <StepperSeparator className="group-data-[state=completed]/step:bg-success absolute inset-y-0 top-7 left-3 -order-1 m-0 -translate-x-1/2 group-data-[orientation=vertical]/stepper-nav:h-[calc(100%-2rem)]" />
                )}
              </StepperItem>
            ))}
          </StepperNav>
        </Stepper>
        <p className="text-muted-foreground mt-auto text-xs">Всё это можно поменять позже в настройках.</p>
      </aside>

      <main className="flex justify-center overflow-y-auto px-10 pt-[10vh] pb-24">
        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both flex w-full max-w-lg flex-col duration-200 ease-out" key={o.step}>
          {(o.step === "key" || o.step === "models") && (
            <Button className="-ml-2 mb-4 w-fit" onClick={o.back} size="sm" variant="ghost">
              <ArrowLeft /> Назад
            </Button>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2 mb-8 text-sm">{description}</p>
          <StepBody large o={o} />
        </div>
      </main>
    </div>
  );
};
