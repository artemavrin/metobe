"use client";

// Card "Колода": the steps still ahead peek out behind the card; the deck thins as you go.
import { Button } from "@purr/ui/components/button";
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import { cn } from "@purr/ui/lib/utils";
import { ArrowLeft, Check } from "lucide-react";

import { copy, STEPS, StepBody, stepNumber, useOnboarding } from "./steps";

export const CardDeck = () => {
  const o = useOnboarding();
  const { title, description } = copy(o);
  const n = stepNumber(o.step);
  const ahead = Math.max(0, STEPS.length - n);
  const canBack = o.step === "key" || o.step === "models";

  return (
    <div className="bg-muted/40 flex min-h-dvh justify-center px-6 pt-[10vh] pb-24">
      <div className="relative isolate h-fit w-full max-w-xl">
        {/* The cards still ahead: offset down and slightly narrower, like a deck */}
        {Array.from({ length: ahead }, (_, i) => (
          <div
            aria-hidden
            className="bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))] absolute inset-x-0 top-0 h-full origin-bottom rounded-xl border shadow-xs transition-transform duration-300 ease-out"
            key={i}
            style={{ transform: `translateY(${(i + 1) * 12}px) scale(${1 - (i + 1) * 0.05})`, zIndex: -1 - i, opacity: 1 - (i + 1) * 0.25 }}
          />
        ))}
        <Frame
          className="bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))] animate-in fade-in slide-in-from-bottom-3 zoom-in-[0.98] fill-mode-both relative shadow-lg duration-300 ease-out motion-reduce:animate-none"
          key={o.step}
          spacing="lg"
          stacked
        >
          <FrameHeader className="gap-1">
            {o.step === "done" ? (
              <IconTile className="text-success mb-3" size="default" variant="soft">
                <Check />
              </IconTile>
            ) : (
              <span className="text-muted-foreground mb-2 text-xs font-medium">
                Шаг {n} · {STEPS[n - 1]?.title}
              </span>
            )}
            <FrameTitle className="text-xl">{title}</FrameTitle>
            <FrameDescription>{description}</FrameDescription>
          </FrameHeader>
          <FramePanel>
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
            <span className="flex items-center gap-1.5" aria-label={`Шаг ${Math.min(n, 3)} из 3`}>
              {STEPS.map((s, i) => (
                <span
                  className={cn(
                    "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out",
                    n === i + 1 ? "bg-primary w-5" : n > i + 1 ? "bg-primary/40 w-1.5" : "bg-border w-1.5"
                  )}
                  key={s.id}
                />
              ))}
            </span>
          </FrameFooter>
        </Frame>
      </div>
    </div>
  );
};
