"use client";

// Round 4 «Щелчок»: motion constants and the small primitives every part stands on. Values are from the spec
// (emil / animate skills): strong ease-out for UI, ease-in-out for things moving on screen, springs only for
// drag and the one delight moment (the star). Reduced motion keeps opacity and colour, drops movement.
import { Star } from "lucide-react";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@metobe/ui/lib/utils";

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_OUT_CSS = "cubic-bezier(0.23, 1, 0.32, 1)";
export const EASE_IN_OUT_CSS = "cubic-bezier(0.77, 0, 0.175, 1)";
export const SPRING_DRAG = { bounce: 0.2, duration: 0.5, type: "spring" } as const;
export const SPRING_POP = { bounce: 0.3, duration: 0.5, type: "spring" } as const;
export const SPRING_REFLOW = { bounce: 0.1, duration: 0.5, type: "spring" } as const;
export const SNAP = { duration: 0 } as const;

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- the travelling highlight -------------------------------------------------------------------

/** How the selection moved: a single arrow or pointer step glides, everything else (jumps, typing) snaps. */
export type NavSource = "step" | "snap";

/**
 * One highlight under the rows that moves to the selected one (`[data-selected=true]` or `[aria-selected=true]`)
 * with a compositor transform: 100ms for a single step, none for jumps. Put the returned ref on an absolutely
 * positioned div that shares the rows' scrolling parent.
 */
export const useListHighlight = ({
  container,
  source,
  deps,
}: {
  container: React.RefObject<HTMLElement | null>;
  source: React.RefObject<NavSource>;
  deps: unknown[];
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = container.current;
    const hl = ref.current;
    const parent = hl?.offsetParent as HTMLElement | null;
    if (!box || !hl || !parent) {
      return;
    }
    const el = box.querySelector<HTMLElement>('[data-selected="true"], [aria-selected="true"]');
    if (!el) {
      hl.style.opacity = "0";
      return;
    }
    const glide = source.current === "step" && !reduced() && hl.style.opacity === "1";
    hl.style.transition = glide ? `transform 100ms ${EASE_OUT_CSS}` : "none";
    hl.style.height = `${el.offsetHeight}px`;
    // Layout offsets, not client rects: a popup still scaling in (zoom-in) would skew rects by a few pixels, and the
    // highlight would jump when the entrance ends.
    let top = 0;
    let node: HTMLElement | null = el;
    while (node && node !== parent) {
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    if (node !== parent) {
      top = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - parent.clientTop;
    }
    hl.style.transform = `translateY(${top}px)`;
    hl.style.opacity = "1";
    source.current = "snap";
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the caller says when the selection may have moved
  }, deps);
  return ref;
};

// --- the star ----------------------------------------------------------------------------------

/** Six sparks from the star's centre, 300ms, removed when done. The rare delight moment of pinning. */
const sparkle = (host: HTMLElement) => {
  for (const a of host.getAnimations({ subtree: true })) {
    a.cancel();
  }
  for (const old of host.querySelectorAll("[data-spark]")) {
    old.remove();
  }
  for (let i = 0; i < 6; i++) {
    const dot = document.createElement("span");
    dot.dataset.spark = "";
    dot.className = "pointer-events-none absolute top-1/2 left-1/2 -mt-[1.5px] -ml-[1.5px] size-[3px] rounded-full bg-amber-400";
    host.append(dot);
    const t = i * 60;
    dot
      .animate(
        [
          { opacity: 1, transform: `rotate(${t}deg) translateY(-6px) scale(1)` },
          { opacity: 0, transform: `rotate(${t}deg) translateY(-${i % 2 ? 10 : 12}px) scale(0.5)` },
        ],
        { duration: 300, easing: EASE_OUT_CSS }
      )
      .finished.then(
        () => dot.remove(),
        () => dot.remove()
      );
  }
};

/**
 * Gold when pinned. Pinning pops the star (spring, bounce 0.3) and throws six sparks; unpinning only fades the
 * colour. Never steals focus from the list or the search.
 */
export const StarToggle = ({
  on,
  onToggle,
  label,
  className,
  iconClassName,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
  iconClassName?: string;
}) => {
  const host = useRef<HTMLButtonElement>(null);
  const icon = useRef<SVGSVGElement>(null);
  const toggle = () => {
    const next = !on;
    onToggle();
    if (next && !reduced() && host.current && icon.current) {
      animate(icon.current, { transform: ["scale(0.9)", "scale(1)"] }, SPRING_POP);
      sparkle(host.current);
    }
  };
  return (
    <button
      aria-label={label}
      aria-pressed={on}
      className={cn("relative flex items-center justify-center rounded-md", className)}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      ref={host}
      tabIndex={-1}
      type="button"
    >
      <Star
        className={cn(
          "size-3.5 transition-[fill,color] duration-150 ease-out",
          on ? "fill-amber-400 text-amber-500 dark:fill-amber-300 dark:text-amber-300" : "text-muted-foreground/60 [@media(hover:hover)]:hover:text-amber-500",
          iconClassName
        )}
        ref={icon}
      />
    </button>
  );
};

/** Imperative pin for a keyboard shortcut (⌘D): find the row's star and play the same moment. */
export const popStar = (root: HTMLElement | null) => {
  const host = root?.querySelector<HTMLElement>('[aria-pressed="true"]');
  const icon = host?.querySelector("svg");
  if (!host || !icon || reduced()) {
    return;
  }
  animate(icon, { transform: ["scale(0.9)", "scale(1)"] }, SPRING_POP);
  sparkle(host);
};

// --- numbers that roll ----------------------------------------------------------------------------

/** «12 из 40» and the like: the number rolls up when it grows, down when it shrinks. */
export const RollingCount = ({ value, className }: { value: number; className?: string }) => {
  const prev = useRef(value);
  const dir = value >= prev.current ? 1 : -1;
  prev.current = value;
  return (
    <span className={cn("relative inline-flex overflow-hidden tabular-nums", className)}>
      <AnimatePresence custom={dir} initial={false} mode="popLayout">
        <motion.span
          animate={{ opacity: 1, transform: "translateY(0%)" }}
          custom={dir}
          exit={{ opacity: 0, transform: `translateY(${-dir * 40}%)` }}
          initial={{ opacity: 0, transform: `translateY(${dir * 40}%)` }}
          key={value}
          transition={{ duration: 0.15, ease: EASE_OUT }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

/** Digits as columns 0–9 that slide to their value (a quiet odometer for percentages). */
export const RollingDigits = ({ text, className }: { text: string; className?: string }) => {
  const chars = [...text];
  return (
    <span className={cn("inline-flex tabular-nums", className)}>
      {chars.map((ch, i) => {
        // Keys from the right, so the units column stays the units column when the number grows.
        const key = chars.length - i;
        if (!/\d/u.test(ch)) {
          return <span key={`c${key}`}>{ch}</span>;
        }
        const d = Number(ch);
        return (
          <span className="relative inline-block h-[1lh] overflow-hidden" key={`d${key}`}>
            <span
              className="block transition-transform duration-[250ms] motion-reduce:transition-none"
              style={{ transform: `translateY(-${d * 10}%)`, transitionTimingFunction: EASE_IN_OUT_CSS }}
            >
              {Array.from({ length: 10 }, (_, n) => (
                <span className="block h-[1lh]" key={n}>
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
};

// --- a box whose height follows its content ------------------------------------------------------

export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

/**
 * Height follows the content smoothly (the band on top of the composer: files, nothing, the context status), so
 * the card below never jumps. A small box and an occasional change, the accordion exception to "no height".
 */
export const AutoHeight = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | "auto">("auto");
  const reduce = useReducedMotion() ?? false;
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) {
      return;
    }
    setH(el.offsetHeight);
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div
      animate={{ height: h }}
      className={cn("overflow-hidden", className)}
      initial={false}
      transition={reduce ? SNAP : { duration: 0.22, ease: EASE_IN_OUT }}
    >
      <div ref={inner}>{children}</div>
    </motion.div>
  );
};

// --- shared CSS -----------------------------------------------------------------------------------

/** Bits Tailwind cannot say: the scroll-driven bottom edge and @starting-style entrances. */
export const Y_CSS = `
@keyframes y-edge { to { opacity: 0 } }
.y-edge { animation: y-edge linear both; animation-timeline: scroll(nearest); animation-range: calc(100% - 24px) 100%; }
.y-appear { transition: opacity 150ms ${EASE_OUT_CSS}, transform 150ms ${EASE_OUT_CSS}; transition-delay: 80ms; }
@starting-style { .y-appear { opacity: 0; transform: translateY(25%); } }
.y-fade-in { transition: opacity 200ms ease, filter 200ms ease; }
@starting-style { .y-fade-in { opacity: 0; filter: blur(2px); } }
@media (prefers-reduced-motion: reduce) {
  .y-appear { transform: none !important; transition: opacity 150ms ease; }
  .y-fade-in { filter: none !important; }
}
`;
