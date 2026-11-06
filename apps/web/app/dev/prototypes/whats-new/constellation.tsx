"use client";

import { cn } from "@metobe/ui/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";

import { Sky, SKY_CSS } from "@/components/chat/night-sky";

import type { Change } from "./data";
import { RELEASE } from "./data";

// The tour's cover: the release drawn as a star chart, not a diagram. Each big change is a star — the four-point glint
// of the new chat's sky — with its name in small letters under it, joined to the next by a hairline. The shape is laid
// out from the count: stars walk left to right over the upper part of the cover, up and down by a seed taken from the
// version, so every release gets its own constellation and the same release always the same one. A tour has at most
// six big changes (the rest go to «И ещё» — a seventh page would not be read), so the chart never crowds.
// A star brightens once its page was seen, the next one to see twinkles, and on the last page all of them burn. The
// lines draw themselves once, as the window opens. Transform, opacity, stroke-dashoffset; reduced motion — still.

export const MAX_STARS = 6;

const CSS = `
@keyframes cs-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
@keyframes cs-in { from { opacity: 0; transform: scale(0.85) } to { opacity: 1; transform: scale(1) } }
@keyframes cs-rise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
@keyframes cs-twinkle { 0%, 100% { opacity: 0.7; transform: scale(1) } 50% { opacity: 1; transform: scale(1.3) } }
.cs-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cs-draw 800ms cubic-bezier(0.23, 1, 0.32, 1) both; }
.cs-star { animation: cs-in 350ms cubic-bezier(0.23, 1, 0.32, 1) both; }
.cs-rise { animation: cs-rise 400ms cubic-bezier(0.23, 1, 0.32, 1) both; }
.cs-next { animation: cs-twinkle 1.8s cubic-bezier(0.77, 0, 0.175, 1) infinite; }
.cs-glint { transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms ease; }
@media (hover: hover) and (pointer: fine) { .cs-btn:hover .cs-glint { transform: scale(1.18); } .cs-btn:hover .cs-name { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .cs-line { animation: none; stroke-dashoffset: 0; }
  .cs-star, .cs-rise { animation-name: none; }
  .cs-next { animation: none; }
}
`;

/** The new chat's sky's glint: four thin rays. */
/** How far a line stops short of a star, px. */
const GAP = 16;

const GLINT = "M0 -7 L1.1 -1.1 L7 0 L1.1 1.1 L0 7 L-1.1 1.1 L-7 0 L-1.1 -1.1 Z";

/** A small seeded random: the same version, the same sky. */
const seeded = (seed: string) => {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
};

/**
 * Where the stars stand, in % of the cover: left to right from 36 % to 90 % (the title keeps the lower left), up and
 * down in turn within 16–58 %, each nudged by the seed — a walk, so the line between them reads as one figure.
 */
/** The cover's room for the chart, and the last page's: the same figure, smaller, in the upper right corner. */
const ROOM = { cover: { h: 24, w: 54, x: 36, y: 20 }, end: { h: 13, w: 30, x: 62, y: 14 } };

export const layout = (count: number, seed: string, room = ROOM.cover) => {
  const rand = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const high = i % 2 === 0;
    return {
      x: room.x + t * room.w + (rand() - 0.5) * (room.w / 9),
      y: room.y + (high ? 0 : room.h) + rand() * (room.h * 0.58),
    };
  });
};

export const StarCover = ({
  changes,
  seen,
  onPick,
  end,
  rest,
}: {
  changes: Change[];
  /** The pages already seen, by the change's index. */
  seen: Set<number>;
  /** A star leads to its page; without a page of its own (a preview of more stars) it does nothing. */
  onPick: (index: number) => void;
  /** The last page: every star burns. */
  end?: boolean;
  /** The last page: what goes under the finished chart, on the same sky («И ещё»). */
  rest?: React.ReactNode;
}) => {
  const stars = changes.slice(0, MAX_STARS);
  const spots = layout(stars.length, RELEASE.version, end ? ROOM.end : ROOM.cover);
  const next = end ? -1 : stars.findIndex((_, i) => !seen.has(i));
  const lit = (i: number) => end || seen.has(i);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ h: 0, w: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ h: el.clientHeight, w: el.clientWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="relative isolate h-full overflow-hidden bg-[oklch(0.17_0.035_264)] text-white" ref={box}>
      <style>{SKY_CSS + CSS}</style>
      <Sky shooting={1} tone="night" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_12%_100%,oklch(0.45_0.17_264/0.5),transparent_60%)]" />

      {/* In the cover's own pixels (measured), so a line is one stroke and stops short of its stars, as on a chart. */}
      <svg aria-hidden className="absolute inset-0 size-full">
        {size.w > 0 &&
          spots.slice(1).map((b, i) => {
            const a = spots[i];
            if (!a) return null;
            const ax = (a.x / 100) * size.w;
            const ay = (a.y / 100) * size.h;
            const bx = (b.x / 100) * size.w;
            const by = (b.y / 100) * size.h;
            const len = Math.hypot(bx - ax, by - ay);
            const ux = (bx - ax) / len;
            const uy = (by - ay) / len;
            const on = lit(i) && lit(i + 1);
            return (
              <line
                className="cs-line transition-[stroke-opacity] duration-300"
                key={`${a.x}-${b.x}`}
                pathLength={1}
                stroke="white"
                strokeOpacity={on ? 0.5 : 0.2}
                strokeWidth={1}
                style={{ animationDelay: `${300 + i * 160}ms` }}
                x1={ax + ux * GAP}
                x2={bx - ux * GAP}
                y1={ay + uy * GAP}
                y2={by - uy * GAP}
              />
            );
          })}
      </svg>

      {stars.map((c, i) => {
        const spot = spots[i];
        if (!spot) return null;
        const on = lit(i);
        return (
          <button
            aria-label={`${c.title} — открыть`}
            className="cs-btn cs-star group absolute grid size-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none"
            key={c.id}
            onClick={() => onPick(i)}
            style={{ animationDelay: `${200 + i * 160}ms`, left: `${spot.x}%`, top: `${spot.y}%` }}
            type="button"
          >
            <span className={cn("grid size-[22px] place-items-center", i === next && "cs-next")}>
              <svg
                aria-hidden
                className={cn(
                  "cs-glint size-[22px] overflow-visible",
                  on ? "opacity-100 drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]" : "scale-[0.72] opacity-60"
                )}
                viewBox="-8 -8 16 16"
              >
                <path d={GLINT} fill="white" />
                <circle fill="white" r={on ? 1.6 : 1.1} />
              </svg>
            </span>
            {/* The name on the side away from the lines: over a high star (its lines go down), under a low one. */}
            <span
              className={cn(
                "cs-name absolute left-1/2 -translate-x-1/2 rounded px-1 text-[11px] leading-4 whitespace-nowrap text-white transition-opacity duration-200 group-focus-visible:ring-1 group-focus-visible:ring-white/70",
                i % 2 === 0 ? "bottom-full mb-1" : "top-full mt-1",
                on ? "opacity-90" : "opacity-55"
              )}
            >
              {c.short ?? c.title}
            </span>
          </button>
        );
      })}

      {rest ? (
        <div className="absolute inset-x-0 top-[38%] bottom-0">{rest}</div>
      ) : (
        <div className="absolute bottom-7 left-7 flex flex-col gap-1">
          <span className="cs-rise text-xs font-medium tracking-[0.18em] text-white/60 uppercase" style={{ animationDelay: "80ms" }}>
            Что нового · {RELEASE.date}
          </span>
          <span className="cs-rise text-4xl font-semibold tracking-tight" style={{ animationDelay: "140ms" }}>
            Metobe {RELEASE.version}
          </span>
        </div>
      )}
    </div>
  );
};
