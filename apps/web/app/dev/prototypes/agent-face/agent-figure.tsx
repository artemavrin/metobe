"use client";

import { useEffect, useRef } from "react";

import { mk } from "@/components/hairline/stage";
import { inject } from "@/components/hairline/styles";

import unit from "./figures/unit";

// The agent drawn as a Hairline figure — «Unit», a small desk robot (spikes/hairline-agents/unit.js). The figure keeps
// Hairline's rules (one stroke, no colour of its own) and marks three parts for the page: the `screen`, the `eye`s and
// the `lamp`s. Without a colour it is drawn plain, as Hairline draws everything. With the agent's colour the screen goes
// dark and the eyes, the antenna lamp and the plinth's light strip glow in that colour: the colour is the agent's light.

const PALETTE_CSS = `
[data-hairline="agent"] {
  --hairline-plate: var(--background);
  --hairline-hi: var(--foreground);
  --hairline-edge: color-mix(in oklab, var(--foreground) 40%, var(--background));
  --hairline-mid: color-mix(in oklab, var(--foreground) 26%, var(--background));
  --hairline-lo: color-mix(in oklab, var(--foreground) 14%, var(--background));
}
.dark [data-hairline="agent"] {
  --hairline-edge: color-mix(in oklab, var(--foreground) 48%, var(--background));
  --hairline-mid: color-mix(in oklab, var(--foreground) 32%, var(--background));
  --hairline-lo: color-mix(in oklab, var(--foreground) 20%, var(--background));
}
[data-hairline="agent"] svg .screen, [data-hairline="agent"] svg .eye, [data-hairline="agent"] svg .lamp {
  transition: fill 360ms cubic-bezier(0.23, 1, 0.32, 1), stroke 360ms cubic-bezier(0.23, 1, 0.32, 1), filter 360ms ease;
}
[data-hairline="agent"][data-colored] svg .screen {
  fill: color-mix(in oklab, var(--agent) 10%, oklch(0.2 0.01 270));
  stroke: color-mix(in oklab, var(--agent) 30%, oklch(0.3 0.01 270));
}
.dark [data-hairline="agent"][data-colored] svg .screen {
  fill: color-mix(in oklab, var(--agent) 8%, oklch(0.11 0.01 270));
}
[data-hairline="agent"][data-colored] svg .eye {
  fill: color-mix(in oklab, var(--agent) 78%, white);
  filter: drop-shadow(0 0 1.6px var(--agent)) drop-shadow(0 0 4px color-mix(in oklab, var(--agent) 60%, transparent));
}
[data-hairline="agent"][data-colored] svg circle.lamp {
  fill: var(--agent);
  filter: drop-shadow(0 0 3px var(--agent));
}
[data-hairline="agent"][data-colored] svg path.lamp {
  stroke: var(--agent);
  stroke-width: 1.6;
  stroke-linecap: round;
  filter: drop-shadow(0 0 2.5px var(--agent));
}
@media (prefers-reduced-motion: reduce) {
  [data-hairline="agent"] svg .screen, [data-hairline="agent"] svg .eye, [data-hairline="agent"] svg .lamp { transition: none; }
}
`;

/** The agent; `color` — its colour (none: drawn plain, while it is being made). */
export const AgentFigure = ({ color, className }: { color?: string; className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    inject(document);
    const svg = mk("svg", { "aria-hidden": "true", viewBox: "0 0 400 320" }, stage);
    const handle = unit.mount({ read: { textContent: null }, stage, svg }, unit.range[1]);
    return () => {
      handle.destroy();
      svg.remove();
    };
  }, []);
  return (
    <>
      <style>{PALETTE_CSS}</style>
      <div
        aria-hidden
        className={className}
        data-colored={color ? "" : undefined}
        data-hairline="agent"
        ref={ref}
        style={color ? ({ "--agent": color } as React.CSSProperties) : undefined}
      />
    </>
  );
};
