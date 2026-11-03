"use client";

import { Stage, useCalm, usePart } from "./backdrop";
import type { StageView } from "./backdrop";

// «Свет дня»: soft light behind the greeting in the colour of the hour it names — warm in the morning, clear by day,
// coral at dusk, deep blue at night — with paper grain over it, so it reads as light, not as a gradient. It drifts too
// slowly to watch. While a question is being typed the light leaves the sky and gathers under the composer: the screen
// leans toward where the answer will start. Axis: atmosphere and state. CSS only — the drift runs off the main thread;
// the typing shift is a transition, so typing and erasing retarget it instead of restarting it.

// Grain: fractal noise turned into alpha and used as the light's own mask, so the light itself is grainy — paper, not
// a gradient. No blend mode: a blend over a transparent group (any fade or mask) shows the noise as grey everywhere.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0 0 0 0.35'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const CSS = `
.dl { --ease-out: cubic-bezier(0.23, 1, 0.32, 1); position: absolute; inset: 0; overflow: hidden; }
/* The light fades in under the chat's top bar instead of being cut by it. */
.dl-air { position: absolute; inset: 0; mask-image: linear-gradient(to bottom, transparent, black 140px); }
.dl[data-part="morning"] { --sky: oklch(0.93 0.065 72); --sky-2: oklch(0.94 0.045 25); --ground: oklch(0.91 0.07 58); }
.dl[data-part="day"] { --sky: oklch(0.93 0.045 238); --sky-2: oklch(0.95 0.035 195); --ground: oklch(0.9 0.06 245); }
.dl[data-part="evening"] { --sky: oklch(0.9 0.07 42); --sky-2: oklch(0.91 0.04 255); --ground: oklch(0.88 0.08 36); }
.dl[data-part="night"] { --sky: oklch(0.86 0.06 258); --sky-2: oklch(0.91 0.04 210); --ground: oklch(0.84 0.07 252); }
.dark .dl[data-part="morning"] { --sky: oklch(0.36 0.07 65); --sky-2: oklch(0.32 0.05 25); --ground: oklch(0.36 0.07 55); }
.dark .dl[data-part="day"] { --sky: oklch(0.34 0.07 240); --sky-2: oklch(0.33 0.05 195); --ground: oklch(0.36 0.08 245); }
.dark .dl[data-part="evening"] { --sky: oklch(0.34 0.08 38); --sky-2: oklch(0.3 0.05 260); --ground: oklch(0.36 0.08 35); }
.dark .dl[data-part="night"] { --sky: oklch(0.3 0.08 262); --sky-2: oklch(0.29 0.05 210); --ground: oklch(0.33 0.08 258); }

.dl-sky, .dl-sky-2, .dl-ground { position: absolute; border-radius: 9999px; will-change: transform, opacity; mask-image: ${GRAIN}; mask-size: 160px; }
.dl-sky { left: 8%; right: 8%; top: -32%; height: 78%; background: radial-gradient(closest-side, var(--sky), transparent); }
.dl-sky-2 { left: 38%; right: -18%; top: -12%; height: 58%; background: radial-gradient(closest-side, var(--sky-2), transparent); opacity: 0.85; }
.dl-ground { left: 12%; right: 12%; bottom: -34%; height: 62%; background: radial-gradient(closest-side, var(--ground), transparent); }

/* Typing: the sky dims, the ground gathers under the composer. */
.dl-sky, .dl-sky-2 { transition: opacity 400ms var(--ease-out); }
.dl-ground { opacity: 0; transform: scale(0.92); transition: opacity 400ms var(--ease-out), transform 400ms var(--ease-out); }
.dl[data-typing] .dl-sky { opacity: 0.45; }
.dl[data-typing] .dl-sky-2 { opacity: 0.35; }
.dl[data-typing] .dl-ground { opacity: 1; transform: scale(1); }

/* The drift: too slow to watch, sine-shaped so it never visibly turns. */
@keyframes dl-drift { from { translate: -3% 1%; } to { translate: 3% -2%; } }
@keyframes dl-drift-2 { from { translate: 4% -1%; } to { translate: -3% 3%; } }
.dl-sky { animation: dl-drift 26s cubic-bezier(0.37, 0, 0.63, 1) infinite alternate; }
.dl-sky-2 { animation: dl-drift-2 34s cubic-bezier(0.37, 0, 0.63, 1) infinite alternate; }


.dl[data-calm] .dl-sky, .dl[data-calm] .dl-sky-2 { animation: none; }
.dl[data-calm] .dl-ground { transform: none; transition: opacity 400ms var(--ease-out); }
`;

const Daylight = ({ typing }: StageView) => {
  const part = usePart();
  const calm = useCalm();
  if (!part) return null;
  return (
    <>
      <style>{CSS}</style>
      <div className="dl" data-calm={calm ? "" : undefined} data-part={part} data-typing={typing ? "" : undefined}>
        <div className="dl-air">
          <div className="dl-sky" />
          <div className="dl-sky-2" />
        </div>
        <div className="dl-ground" />
      </div>
    </>
  );
};

export const DaylightVariant = () => <Stage backdrop={(view) => <Daylight {...view} />} />;
