"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Hand, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { DEMOS } from "@/components/whats-new/demos";

// The demos played by a cursor (prototype «Смотреть»): it travels to the real button and presses it — a real click, a
// real hover — waits, starts again. The reader watches; a click on the stage takes over and the demo is theirs,
// «Показать снова» gives it back. Only the page on screen plays. The cursor moves with the strong in-out curve (it is
// on screen, moving), a press sinks it for 100 ms and leaves a ring. Reduced motion: no cursor, no script — the demo
// stands, live.

type Step =
  | { move: string; fy?: number }
  | { click: string }
  | { hover: string; fy: number }
  | { wait: number };

const RAIL = "[data-map-rail]";
const OPTION = '[role="option"]:nth-of-type(2)';
const SHARE = '[data-demo="share-header"] button:has(svg.lucide-share)';

const SCRIPTS: Record<string, Step[]> = {
  askUser: [{ wait: 900 }, { move: OPTION }, { click: OPTION }, { wait: 2600 }],
  shareChat: [
    { wait: 700 },
    { move: SHARE },
    { click: SHARE },
    { wait: 700 },
    { move: '[data-demo="share-switch"]' },
    { click: '[data-demo="share-switch"]' },
    { wait: 900 },
    { move: '[data-demo="share-copy"]' },
    { click: '[data-demo="share-copy"]' },
    { wait: 2200 },
  ],
  threadMap: [
    { wait: 700 },
    { fy: 0.15, move: RAIL },
    { fy: 0.15, hover: RAIL },
    { wait: 1300 },
    { fy: 0.5, move: RAIL },
    { fy: 0.5, hover: RAIL },
    { wait: 1300 },
    { click: RAIL },
    { wait: 1800 },
  ],
};

const CSS = `
@keyframes wn-ripple { from { opacity: 0.45; transform: scale(0.4) } to { opacity: 0; transform: scale(1.7) } }
@keyframes wn-chip { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
.wn-ripple { animation: wn-ripple 450ms cubic-bezier(0.23, 1, 0.32, 1) forwards; }
.wn-chip { animation: wn-chip 200ms cubic-bezier(0.23, 1, 0.32, 1) both; }
@media (prefers-reduced-motion: reduce) { .wn-ripple { animation: none; opacity: 0; } .wn-chip { animation-name: none; } }
`;

/** Waits, then says whether the show is still on. */
const sleep = (ms: number, alive: () => boolean) =>
  // oxlint-disable-next-line promise/avoid-new -- a timer has no promise form in the browser
  new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(alive()), ms);
  });

/** One click as the browser makes it: pointer and mouse downs and ups, then the click itself. */
const press = (el: Element) => {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    const Event = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  }
  if (el instanceof HTMLElement) {
    el.click();
  }
};

interface CursorState {
  x: number;
  y: number;
  pressed: boolean;
  shown: boolean;
  /** Bumps on every press: a new ring each time. */
  press: number;
}

const REST: CursorState = {
  press: 0,
  pressed: false,
  shown: false,
  x: 470,
  y: 290,
};

const Cursor = ({ x, y, pressed, shown, press: presses }: CursorState) => (
  <div
    aria-hidden
    className={cn(
      "pointer-events-none absolute top-0 left-0 z-30 transition-[transform,opacity] duration-[700ms,200ms] ease-[cubic-bezier(0.77,0,0.175,1),cubic-bezier(0.23,1,0.32,1)]",
      shown ? "opacity-100" : "opacity-0"
    )}
    style={{ transform: `translate(${x}px, ${y}px)` }}
  >
    {presses > 0 && (
      <span
        className="wn-ripple bg-primary/40 absolute -top-3 -left-3 size-6 rounded-full"
        key={presses}
      />
    )}
    <svg
      aria-hidden
      className={cn(
        "relative drop-shadow-md transition-transform duration-100 ease-out",
        pressed && "scale-[0.82]"
      )}
      fill="none"
      height="22"
      style={{ transformOrigin: "3px 3px" }}
      viewBox="0 0 24 24"
      width="22"
    >
      <path
        d="M4 3l15 7.5-6.5 1.8L10 19 4 3z"
        fill="black"
        stroke="white"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  </div>
);

type SetCursor = (next: (c: CursorState) => CursorState) => void;

/** Where on the stage an element is, for the cursor's tip: its middle (or 40 px in), `fy` down. */
const spotOf = (stage: HTMLElement, el: Element, fy = 0.5) => {
  const box = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    x: r.left - box.left + Math.min(r.width * 0.5, 40),
    y: r.top - box.top + r.height * fy,
  };
};

/** One step of a script; false when the show was cut short (the page left, the reader took over). */
const runStep = async (
  step: Step,
  stage: HTMLElement,
  alive: () => boolean,
  setCursor: SetCursor
) => {
  if ("wait" in step) {
    return sleep(step.wait, alive);
  }
  if ("move" in step) {
    const el = stage.querySelector(step.move);
    if (el) {
      setCursor((c) => ({ ...c, ...spotOf(stage, el, step.fy) }));
    }
    return sleep(750, alive);
  }
  if ("hover" in step) {
    const el = stage.querySelector(step.hover);
    const r = el?.getBoundingClientRect();
    if (el && r) {
      el.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: r.left + 6,
          clientY: r.top + r.height * step.fy,
        })
      );
    }
    return alive();
  }
  setCursor((c) => ({ ...c, press: c.press + 1, pressed: true }));
  if (!(await sleep(110, alive))) {
    return false;
  }
  const el = stage.querySelector(step.click);
  if (el) {
    press(el);
  }
  setCursor((c) => ({ ...c, pressed: false }));
  return true;
};

/** Runs a script from step `i` on; at its end the cursor fades out. False when it was cut short. */
const play = async (
  script: Step[],
  i: number,
  stage: HTMLElement,
  alive: () => boolean,
  setCursor: SetCursor
): Promise<boolean> => {
  const step = script[i];
  if (!step) {
    // Out, then the demo anew: the next round fades the cursor in at its start.
    setCursor((c) => ({ ...c, shown: false }));
    return sleep(250, alive);
  }
  if (!(await runStep(step, stage, alive, setCursor))) {
    return false;
  }
  return play(script, i + 1, stage, alive, setCursor);
};

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const AutoDemo = ({ id, active }: { id: string; active: boolean }) => {
  const t = useTranslations("whatsNew");
  const Demo = DEMOS[id];
  const stage = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState(0);
  const [cursor, setCursor] = useState<CursorState>(REST);
  const [mine, setMine] = useState(false);
  const script = SCRIPTS[id];
  const scripted = Boolean(script) && !reducedMotion();
  const playing = scripted && active && !mine;

  // Leaving the page puts the demo back: coming back, the show starts over.
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) {
      setMine(false);
      setRound((r) => r + 1);
      setCursor(REST);
    }
  }

  // While it plays, a demo must not take the focus (the question panel focuses itself): it goes back where it was,
  // so ←/→ and Enter keep turning the tour. A layout effect — in place before the demo's own effects run.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!(el && playing)) {
      return;
    }
    const back = (e: FocusEvent) => {
      const from = e.relatedTarget;
      if (from instanceof HTMLElement && !el.contains(from)) {
        from.focus({ preventScroll: true });
      }
    };
    el.addEventListener("focusin", back);
    return () => el.removeEventListener("focusin", back);
  }, [playing]);

  // The show, round after round, while it plays: each round a fresh demo (its key), the cursor fading in at the start.
  useEffect(() => {
    const el = stage.current;
    if (!(playing && script && el)) {
      return;
    }
    let live = true;
    const alive = () => live;
    const show = async () => {
      setCursor(() => ({ ...REST, shown: true }));
      if (await play(script, 0, el, alive, setCursor)) {
        setRound((r) => r + 1);
        await show();
      }
    };
    show();
    return () => {
      live = false;
    };
  }, [playing, script]);

  if (!Demo) {
    return null;
  }
  return (
    <div className="relative h-full" data-demo={id} ref={stage}>
      <style>{CSS}</style>
      <Demo key={round} />
      {scripted && <Cursor {...cursor} shown={cursor.shown && playing} />}
      {playing && (
        // The stage is the cursor's while it plays; a click hands it over.
        <button
          aria-label={t("takeOver")}
          className="absolute inset-0 z-20 cursor-pointer"
          onClick={() => {
            setMine(true);
            setCursor(REST);
            setRound((r) => r + 1);
          }}
          type="button"
        />
      )}
      {scripted && active && (
        <div className="pointer-events-none absolute right-3 bottom-3 z-20">
          {mine ? (
            <button
              className="wn-chip bg-foreground/80 text-background hover:bg-foreground pointer-events-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors duration-150"
              key="replay"
              onClick={() => {
                setMine(false);
                setRound((r) => r + 1);
              }}
              type="button"
            >
              <Play className="size-3" /> {t("replay")}
            </button>
          ) : (
            <span
              className="wn-chip bg-foreground/70 text-background flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
              key="try"
              style={{ animationDelay: "1200ms" }}
            >
              <Hand className="size-3.5" /> {t("tryIt")}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/** A stage with nothing to play (the sky plays itself): the demo, live. */
export const LiveDemo = ({ id }: { id: string }) => {
  const Demo = DEMOS[id];
  return Demo ? (
    <div className="h-full" data-demo={id}>
      <Demo />
    </div>
  ) : null;
};
