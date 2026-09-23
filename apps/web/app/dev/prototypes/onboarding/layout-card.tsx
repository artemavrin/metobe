"use client";

// Layout: a single calm card on a muted page; progress is a segmented bar inside the card header.
import { Button } from "@purr/ui/components/button";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperTrigger } from "@purr/ui/components/reui/stepper";
import { ArrowLeft, Check } from "lucide-react";

import { copy, PurrMark, STEPS, StepBody, stepNumber, useOnboarding } from "./steps";

export const LayoutCard = () => {
  const o = useOnboarding();
  const { title, description } = copy(o);
  const n = stepNumber(o.step);

  return (
    <div className="bg-muted/40 flex min-h-dvh flex-col items-center px-6 pt-[8vh] pb-24">
      <PurrMark className="mb-6" />
      <Frame className="w-full max-w-xl" key={o.step} spacing="lg" stacked>
        <FrameHeader className="gap-4">
          {o.step !== "done" ? (
            <div className="flex items-center gap-3">
              <Stepper className="flex-1" value={n}>
                <StepperNav className="gap-1.5">
                  {STEPS.map((s, i) => (
                    <StepperItem className="flex-1 overflow-hidden first:rounded-s-full last:rounded-e-full" key={s.id} step={i + 1}>
                      <StepperTrigger className="pointer-events-none w-full">
                        <StepperIndicator className="bg-border h-1 w-full rounded-none!">
                          <span className="sr-only">{s.title}</span>
                        </StepperIndicator>
                      </StepperTrigger>
                    </StepperItem>
                  ))}
                </StepperNav>
              </Stepper>
              <span className="text-muted-foreground text-xs tabular-nums">
                {n} / {STEPS.length}
              </span>
            </div>
          ) : (
            <IconTile className="text-success animate-in zoom-in-90 fade-in fill-mode-both duration-300 ease-out" size="lg" variant="soft">
              <Check />
            </IconTile>
          )}
          <div className="flex flex-col gap-1">
            <FrameTitle className="text-xl">{title}</FrameTitle>
            <FrameDescription>{description}</FrameDescription>
          </div>
        </FrameHeader>
        <FramePanel className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 ease-out">
          <StepBody large o={o} />
        </FramePanel>
      </Frame>
      {(o.step === "key" || o.step === "models") && (
        <Button className="text-muted-foreground mt-4" onClick={o.back} size="sm" variant="ghost">
          <ArrowLeft /> Назад
        </Button>
      )}
    </div>
  );
};
