"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Hand, Play } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { DEMOS } from "./demos";

// «Смотреть»: the same live demos, but a cursor plays them — it travels to the real button and presses it (a real
// click, a real hover), waits, starts again. The user watches; a click on the stage takes over, the cursor goes away
// and the demo is theirs, «Показать снова» gives it back. Only the page on screen plays. Movement across the screen
// eases in and out (it is already on screen); a press is a quick scale and a ring. Reduced motion: no cursor and no
// script — the demo just stands, live.

type Step =
  | { move: string; fy?: number }
  | { click: string }
  | { hover: string; fy: number }
  | { wait: number }
  | { reset: true };

const SCRIPTS: Record<string, Step[]> = {
  ask: [
    { wait: 900 },
    { move: '[role="option"]:nth-of-type(2)' },
    { click: '[role="option"]:nth-of-type(2)' },
    { wait: 2600 },
    { reset: true },
  ],
  map: [
    { wait: 700 },
    { move: '[data-demo="map"] button[aria-label^="Перейти"]', fy: 0.15 },
    { hover: '[data-demo="map"] button[aria-label^="Перейти"]', fy: 0.15 },
    { wait: 1300 },
    { move: '[data-demo="map"] button[aria-label^="Перейти"]', fy: 0.5 },
    { hover: '[data-demo="map"] button[aria-label^="Перейти"]', fy: 0.5 },
    { wait: 1300 },
    { click: '[data-demo="map"] button[aria-label^="Перейти"]' },
    { wait: 1800 },
    { reset: true },
  ],
  share: [
    { wait: 700 },
    { move: '[data-demo="share-header"] button:has(svg.lucide-share)' },
    { click: '[data-demo="share-header"] button:has(svg.lucide-share)' },
    { wait: 700 },
    { move: '[data-demo="share-switch"]' },
    { click: '[data-demo="share-switch"]' },
    { wait: 900 },
    { move: '[data-demo="share-copy"]' },
    { click: '[data-demo="share-copy"]' },
    { wait: 2200 },
    { reset: true },
  ],
};

const sleep = (ms: number, alive: () => boolean) =>
  new Promise<boolean>((done) => setTimeout(() => done(alive()), ms));

/** One click as the browser makes it: pointer and mouse downs and ups, then the click itself. */
const press = (el: Element) => {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    el.dispatchEvent(new (type.startsWith("pointer") ? PointerEvent : MouseEvent)(type, { bubbles: true, cancelable: true }));
  }
  (el as HTMLElement).click();
};

const CSS = `
@keyframes ap-ripple { from { opacity: 0.45; transform: scale(0.4) } to { opacity: 0; transform: scale(1.7) } }
@keyframes ap-chip { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
.ap-ripple { animation: ap-ripple 450ms cubic-bezier(0.23, 1, 0.32, 1) forwards; }
.ap-chip { animation: ap-chip 200ms cubic-bezier(0.23, 1, 0.32, 1) both; }
@media (prefers-reduced-motion: reduce) { .ap-ripple { animation: none; opacity: 0; } .ap-chip { animation-name: none; } }
`;

interface CursorState {
  x: number;
  y: number;
  pressed: boolean;
  shown: boolean;
  /** Bumps on every press: a new ring each time. */
  press: number;
}

/**
 * The cursor: it travels with the strong in-out curve (it is on screen, moving), fades in where a round starts and
 * out where it ends. A press sinks it a little (100 ms, ease-out) and leaves a ring that widens and fades — the click
 * must be seen, the page would otherwise change by itself.
 */
const Cursor = ({ x, y, pressed, shown, press }: CursorState) => (
  <div
    aria-hidden
    className={cn(
      "pointer-events-none absolute top-0 left-0 z-30 transition-[transform,opacity] duration-[700ms,200ms] ease-[cubic-bezier(0.77,0,0.175,1),cubic-bezier(0.23,1,0.32,1)]",
      shown ? "opacity-100" : "opacity-0"
    )}
    style={{ transform: `translate(${x}px, ${y}px)` }}
  >
    {press > 0 && <span className="ap-ripple bg-primary/40 absolute -top-3 -left-3 size-6 rounded-full" key={press} />}
    <svg
      className={cn("relative drop-shadow-md transition-transform duration-100 ease-out", pressed && "scale-[0.82]")}
      fill="none"
      height="22"
      style={{ transformOrigin: "3px 3px" }}
      viewBox="0 0 24 24"
      width="22"
    >
      <path d="M4 3l15 7.5-6.5 1.8L10 19 4 3z" fill="black" stroke="white" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  </div>
);

const REST = { pressed: false, press: 0, shown: false, x: 470, y: 290 };

export const AutoDemo = ({ id, active }: { id: string; active: boolean }) => {
  const Demo = DEMOS[id];
  const stage = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState(0);
  const [cursor, setCursor] = useState<CursorState>(REST);
  const [mine, setMine] = useState(false);
  const script = SCRIPTS[id];
  const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const playing = Boolean(script) && active && !mine && !calm;

  // Leaving the page puts the demo back: coming back, the show starts over.
  useEffect(() => {
    if (!active) {
      setMine(false);
      setRound((r) => r + 1);
      setCursor(REST);
    }
  }, [active]);

  // While it plays, a demo must not take the focus (the question panel focuses itself): it goes back where it was,
  // so ←/→ and Enter keep turning the tour. A layout effect — in place before the demo's own effects run.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!(el && playing)) return;
    const back = (e: FocusEvent) => {
      const from = e.relatedTarget;
      if (from instanceof HTMLElement && !el.contains(from)) from.focus({ preventScroll: true });
    };
    el.addEventListener("focusin", back);
    return () => el.removeEventListener("focusin", back);
  }, [playing]);

  useEffect(() => {
    if (!playing || !script) return;
    let live = true;
    const alive = () => live;
    const find = (sel: string) => stage.current?.querySelector(sel) ?? null;
    const at = (el: Element, fy = 0.5) => {
      const box = stage.current?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - (box?.left ?? 0) + Math.min(r.width * 0.5, 40), y: r.top - (box?.top ?? 0) + r.height * fy };
    };
    (async () => {
      setCursor({ ...REST, shown: true });
      for (const step of script) {
        if (!live) return;
        if ("wait" in step && !(await sleep(step.wait, alive))) return;
        if ("move" in step) {
          const el = find(step.move);
          if (el) setCursor((c) => ({ ...c, ...at(el, step.fy) }));
          if (!(await sleep(750, alive))) return;
        }
        if ("hover" in step) {
          const el = find(step.hover);
          if (el) {
            const r = el.getBoundingClientRect();
            el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: r.left + 6, clientY: r.top + r.height * step.fy }));
          }
        }
        if ("click" in step) {
          const el = find(step.click);
          setCursor((c) => ({ ...c, press: c.press + 1, pressed: true }));
          if (!(await sleep(110, alive))) return;
          if (el) press(el);
          setCursor((c) => ({ ...c, pressed: false }));
        }
        if ("reset" in step) {
          // Out, then the demo anew: the next round fades the cursor in at its start.
          setCursor((c) => ({ ...c, shown: false }));
          if (!(await sleep(250, alive))) return;
          setRound((r) => r + 1);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [playing, script, round]);

  if (!Demo) return null;
  return (
    <div className="relative h-full" data-demo={id} ref={stage}>
      <style>{CSS}</style>
      <Demo key={round} />
      {script && !calm && <Cursor {...cursor} shown={cursor.shown && playing} />}
      {playing && (
        // The stage is the cursor's while it plays; a click hands it over.
        <button
          aria-label="Попробовать самому"
          className="absolute inset-0 z-20 cursor-pointer"
          onClick={() => {
            setMine(true);
            setCursor(REST);
            setRound((r) => r + 1);
          }}
          type="button"
        />
      )}
      {script && !calm && active && (
        <div className="pointer-events-none absolute right-3 bottom-3 z-20">
          {mine ? (
            <button
              className="ap-chip bg-foreground/80 text-background hover:bg-foreground pointer-events-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors duration-150"
              key="again"
              onClick={() => {
                setMine(false);
                setRound((r) => r + 1);
              }}
              type="button"
            >
              <Play className="size-3" /> Показать снова
            </button>
          ) : (
            <span className="ap-chip bg-foreground/70 text-background flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" key="try" style={{ animationDelay: "1200ms" }}>
              <Hand className="size-3.5" /> Щёлкните, чтобы попробовать
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/** For the stages with nothing to play (the sky plays itself). */
export const Live = ({ id }: { id: string }): ReactNode => {
  const Demo = DEMOS[id];
  return Demo ? (
    <div className="h-full" data-demo={id}>
      <Demo />
    </div>
  ) : null;
};
