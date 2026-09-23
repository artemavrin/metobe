"use client";

// Card "Колода": the steps still ahead peek out behind the card; the deck thins as you go.
// Riffs: "Тихая" (baseline), "Подписи" (back cards name the next steps), "Тасовка" (cards travel between steps).
import { Button } from "@purr/ui/components/button";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import { Separator } from "@purr/ui/components/separator";
import { cn } from "@purr/ui/lib/utils";
import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type DoneKind, DoneScreen } from "./done";
import { copy, DONE_MANY_STATE, DONE_STATE, MODELS_STATE, type OnboardingState, STEPS, StepBody, stepNumber, useOnboarding } from "./steps";

// Leaving card: stays opaque while it travels, fades only at the very end — no muddy cross-fade of two texts.
const LEAVE_KEYFRAMES = `
@keyframes deck-leave-forward { 0% { transform: none; opacity: 1 } 65% { opacity: 1 } 100% { transform: translateY(-48px) rotate(-3deg); opacity: 0 } }
@keyframes deck-leave-back { 0% { transform: none; opacity: 1 } 65% { opacity: 1 } 100% { transform: translateY(24px) scale(0.94); opacity: 0 } }
`;

// The card surface without Frame's translucency, so back cards never show through.
const SURFACE = "bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))]";

/** `done` swaps the finish screen; with it the deck opens right on that screen. */
type Options = { labels?: boolean; shuffle?: boolean; done?: DoneKind; start?: OnboardingState };

const Deck = ({ labels = false, shuffle = false, done, start }: Options) => {
  const o = useOnboarding(start ?? (done ? DONE_STATE : undefined));
  const finished = o.step === "done";
  const { title, description } = copy(o);
  const n = stepNumber(o.step);
  const ahead = Math.max(0, STEPS.length - n);
  const canBack = o.step === "key" || o.step === "models";
  const peek = labels ? 26 : 12;

  // Shuffle: remember where we came from, to play the leaving card and pick the direction.
  const label = finished ? (done ? "Настройка завершена" : "Готово") : `Шаг ${n} · ${STEPS[n - 1]?.title}`;
  const prev = useRef({ label, n, title });
  const [leaving, setLeaving] = useState<{ label: string; title: string; forward: boolean; id: number } | null>(null);
  useEffect(() => {
    if (!shuffle || prev.current.n === n) return;
    const forward = n > prev.current.n;
    setLeaving({ forward, id: Date.now(), label: prev.current.label, title: prev.current.title });
    prev.current = { label, n, title };
    const t = setTimeout(() => setLeaving(null), 300);
    return () => clearTimeout(t);
  }, [n, shuffle, title, label]);
  useEffect(() => {
    prev.current.title = title;
    prev.current.label = label;
  }, [title, label]);

  // Direction is decided during render, so the entering card animates the right way on its first frame.
  const last = useRef({ forward: true, n });
  if (last.current.n !== n) last.current = { forward: n > last.current.n, n };
  const { forward } = last.current;
  const enterClass = shuffle
    ? forward
      ? "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-3 origin-bottom delay-150 duration-300"
      : "animate-in fade-in-0 slide-in-from-top-6 delay-150 duration-300"
    : "animate-in fade-in slide-in-from-bottom-3 zoom-in-[0.98] duration-300";

  return (
    <div className="bg-muted/40 flex min-h-dvh justify-center px-6 pt-[10vh] pb-24">
      {shuffle && <style>{LEAVE_KEYFRAMES}</style>}
      <div className="relative isolate h-fit w-full max-w-xl">
        {Array.from({ length: ahead }, (_, i) => {
          const next = STEPS[n + i];
          return (
            <div
              aria-hidden
              className={cn(
                SURFACE,
                "absolute inset-x-0 top-0 flex h-full origin-bottom items-end justify-center rounded-xl border shadow-xs transition-transform duration-300 ease-out"
              )}
              key={next?.id ?? i}
              style={{ opacity: 1 - (i + 1) * 0.2, transform: `translateY(${(i + 1) * peek}px) scale(${1 - (i + 1) * 0.05})`, zIndex: -1 - i }}
            >
              {labels && (
                <span className="text-muted-foreground pb-1.5 text-[11px] font-medium">
                  {i === 0 ? `Далее: ${next?.title}` : next?.title}
                </span>
              )}
            </div>
          );
        })}

        {leaving && (
          <div
            aria-hidden
            className={cn(
              SURFACE,
              "pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-xl border px-6 pt-4 shadow-lg motion-reduce:hidden",
              leaving.forward ? "origin-bottom-left" : "origin-bottom"
            )}
            key={leaving.id}
            style={{ animation: `${leaving.forward ? "deck-leave-forward" : "deck-leave-back"} 260ms cubic-bezier(0.23, 1, 0.32, 1) forwards` }}
          >
            <p className="text-muted-foreground text-xs font-medium">{leaving.label}</p>
            <div className="bg-border -mx-6 my-4 h-px opacity-60" />
            <p className="text-xl font-semibold tracking-tight">{leaving.title}</p>
          </div>
        )}

        <Frame
          className={cn(SURFACE, enterClass, "fill-mode-both relative shadow-lg ease-out motion-reduce:animate-none")}
          key={o.step}
          spacing="lg"
          stacked
        >
          {/* Navigation row: equal air above and below, the rule sits right under it */}
          <div className="flex h-6 items-center justify-between px-(--frame-panel-header-px) pt-3 pb-4 box-content">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                {canBack && (
                  <Button aria-label="Назад" className="-ml-1.5" onClick={o.back} size="icon-xs" variant="ghost">
                    <ArrowLeft />
                  </Button>
                )}
                {label}
              </span>
              <span aria-label={`Шаг ${Math.min(n, STEPS.length)} из ${STEPS.length}`} className="flex items-center gap-1.5">
                {STEPS.map((s, i) => (
                  <span
                    className={cn(
                      "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out",
                      finished && done ? "bg-primary w-1.5" : n === i + 1 ? "bg-primary w-5" : n > i + 1 ? "bg-primary/40 w-1.5" : "bg-border w-1.5"
                    )}
                    key={s.id}
                  />
                ))}
              </span>
          </div>
          <Separator className="opacity-60" />
          {finished && done ? (
            <DoneScreen kind={done} o={o} />
          ) : (
            <>
          <FrameHeader className="gap-1 pt-4!">
            {o.step === "done" && (
              <IconTile className="text-success mb-3" size="default" variant="soft">
                <Check />
              </IconTile>
            )}
            <FrameTitle className="text-xl">{title}</FrameTitle>
            <FrameDescription>{description}</FrameDescription>
          </FrameHeader>
          <FramePanel>
            <StepBody large o={o} />
          </FramePanel>
            </>
          )}
        </Frame>
      </div>
    </div>
  );
};

export const DeckQuiet = () => <Deck />;
/** The chosen onboarding end to end: "Тихая" deck, finish "Праздник · Конфетти · Залп". */
export const OnboardingFinal = () => <Deck done="burst" />;
export const DeckModels = () => <Deck done="burst" start={MODELS_STATE} />;
export const DoneSummary = () => <Deck done="summary" />;
export const DoneCompose = () => <Deck done="compose" />;
export const DoneBurst = () => <Deck done="burst" />;
export const DoneCannons = () => <Deck done="cannons" />;
export const DoneFireworks = () => <Deck done="fireworks" />;
export const DoneStars = () => <Deck done="stars" />;
export const DoneBurstMany = () => <Deck done="burst" start={DONE_MANY_STATE} />;
export const DoneDeal = () => <Deck done="deal" />;
export const DoneHello = () => <Deck done="hello" />;
export const DeckLabels = () => <Deck labels />;
export const DeckShuffle = () => <Deck shuffle />;
