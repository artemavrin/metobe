"use client";

// Card "Шапка": brand and progress live inside the card's own header; nothing floats outside it.
import { Button } from "@metobe/ui/components/button";
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@metobe/ui/components/reui/frame";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperTrigger } from "@metobe/ui/components/reui/stepper";
import { ArrowLeft, Check } from "lucide-react";

import { copy, STEPS, StepBody, stepNumber, useOnboarding } from "./steps";

export const CardHeader = () => {
  const o = useOnboarding();
  const { title, description } = copy(o);
  const n = stepNumber(o.step);
  const canBack = o.step === "key" || o.step === "models";

  return (
    <div className="bg-muted/40 flex min-h-dvh justify-center px-6 pt-[10vh] pb-24">
      <Frame className="h-fit w-full max-w-xl" spacing="lg" stacked>
        <FrameHeader className="gap-5">
          <div className="flex items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs font-semibold">P</span>
            <span className="text-sm font-medium">Настройка Metobe</span>
            {o.step !== "done" && (
              <div className="ml-auto flex items-center gap-2.5">
                <Stepper className="w-24" value={n}>
                  <StepperNav className="gap-1">
                    {STEPS.map((s, i) => (
                      <StepperItem className="flex-1" key={s.id} step={i + 1}>
                        <StepperTrigger className="pointer-events-none w-full">
                          <StepperIndicator className="bg-border h-1 w-full rounded-full!">
                            <span className="sr-only">{s.title}</span>
                          </StepperIndicator>
                        </StepperTrigger>
                      </StepperItem>
                    ))}
                  </StepperNav>
                </Stepper>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {n} из {STEPS.length}
                </span>
              </div>
            )}
          </div>
          <div className="animate-in fade-in fill-mode-both flex items-start gap-3 duration-200 ease-out" key={o.step}>
            {o.step === "done" && (
              <IconTile className="text-success animate-in zoom-in-90 fade-in fill-mode-both duration-300 ease-out" size="default" variant="soft">
                <Check />
              </IconTile>
            )}
            <div className="flex flex-col gap-1">
              <FrameTitle className="text-xl">{title}</FrameTitle>
              <FrameDescription>{description}</FrameDescription>
            </div>
          </div>
        </FrameHeader>
        <FramePanel className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 ease-out" key={o.step}>
          <StepBody large o={o} />
        </FramePanel>
        <FrameFooter className="flex-row items-center justify-between">
          {canBack ? (
            <Button className="-ml-2" onClick={o.back} size="xs" variant="ghost">
              <ArrowLeft /> Назад
            </Button>
          ) : (
            <span />
          )}
          <FrameDescription className="text-xs">Всё можно поменять позже в настройках</FrameDescription>
        </FrameFooter>
      </Frame>
    </div>
  );
};
