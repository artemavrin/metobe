"use client";

// Layout: one page — finished steps collapse into summary rows, the current step is open, the rest wait below.
import { Button } from "@purr/ui/components/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@purr/ui/components/item";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import { cn } from "@purr/ui/lib/utils";
import { Check } from "lucide-react";

import { copy, PurrMark, STEPS, StepBody, stepNumber, stepSummary, useOnboarding } from "./steps";

export const LayoutFeed = () => {
  const o = useOnboarding();
  const { title, description } = copy(o);
  const n = stepNumber(o.step);

  return (
    <div className="bg-background min-h-dvh px-6 pt-10 pb-24">
      <div className="mx-auto flex max-w-xl flex-col gap-3">
        <PurrMark className="mb-8" />
        <h1 className="mb-4 text-3xl font-semibold tracking-tight">{o.step === "done" ? title : "Настроим Purr"}</h1>

        {STEPS.map((s, i) => {
          const index = i + 1;
          if (index < n) {
            return (
              <Item className="animate-in fade-in fill-mode-both duration-200 ease-out" key={s.id} size="sm" variant="muted">
                <ItemMedia>
                  <IconTile className="text-success" size="xs" variant="soft">
                    <Check />
                  </IconTile>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{s.title}</ItemTitle>
                  <ItemDescription>{stepSummary(o, s.id)}</ItemDescription>
                </ItemContent>
                {o.step !== "done" && (
                  <ItemActions>
                    <Button onClick={() => o.setStep(s.id)} size="xs" variant="ghost">
                      Изменить
                    </Button>
                  </ItemActions>
                )}
              </Item>
            );
          }
          if (index === n) {
            return (
              <Frame className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-200 ease-out" key={s.id} spacing="lg" stacked>
                <FrameHeader className="flex-row items-start gap-3">
                  <span className="bg-primary text-primary-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs">
                    {index}
                  </span>
                  <div className="flex flex-col gap-1">
                    <FrameTitle className="text-base">{title}</FrameTitle>
                    <FrameDescription>{description}</FrameDescription>
                  </div>
                </FrameHeader>
                <FramePanel>
                  <StepBody o={o} />
                </FramePanel>
              </Frame>
            );
          }
          return (
            <Item className={cn("text-muted-foreground")} key={s.id} size="sm" variant="outline">
              <ItemMedia>
                <span className="flex size-6 items-center justify-center rounded-full border text-xs">{index}</span>
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="text-muted-foreground">{s.title}</ItemTitle>
              </ItemContent>
            </Item>
          );
        })}

        {o.step === "done" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both mt-4 duration-200 ease-out">
            <p className="text-muted-foreground mb-4 text-sm">{description}</p>
            <StepBody o={o} />
          </div>
        )}
      </div>
    </div>
  );
};
