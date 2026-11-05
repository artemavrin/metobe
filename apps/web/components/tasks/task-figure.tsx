"use client";

import { cn } from "@metobe/ui/lib/utils";
import { useEffect, useRef } from "react";

import conveyor from "@/components/hairline/conveyor";
import { mk } from "@/components/hairline/stage";
import { inject } from "@/components/hairline/styles";

// A periodic task drawn as a Hairline figure: a small desk conveyor (spikes/hairline-agents/conveyor.js). Every step of the
// belt is one run: a sheet leaves the feeder, the one under the arch is scanned, the one at the end drops onto the results.
// The figure keeps Hairline's rules (one stroke, no colour of its own) and marks the parts the page lights: the arch's
// `lamp` (its beacon and the scan line) and the `done` band every result carries. With the task's colour, those are in it.

const PALETTE_CSS = `
[data-hairline="task"] {
  --hairline-plate: var(--background);
  --hairline-hi: var(--foreground);
  --hairline-edge: color-mix(in oklab, var(--foreground) 40%, var(--background));
  --hairline-mid: color-mix(in oklab, var(--foreground) 26%, var(--background));
  --hairline-lo: color-mix(in oklab, var(--foreground) 14%, var(--background));
}
.dark [data-hairline="task"] {
  --hairline-edge: color-mix(in oklab, var(--foreground) 48%, var(--background));
  --hairline-mid: color-mix(in oklab, var(--foreground) 32%, var(--background));
  --hairline-lo: color-mix(in oklab, var(--foreground) 20%, var(--background));
}
[data-hairline="task"] svg .lamp, [data-hairline="task"] svg .done {
  transition: fill 360ms cubic-bezier(0.23, 1, 0.32, 1), stroke 360ms cubic-bezier(0.23, 1, 0.32, 1), filter 360ms ease;
}
[data-hairline="task"][data-colored] svg circle.lamp {
  fill: var(--task);
  filter: drop-shadow(0 0 3px var(--task));
}
[data-hairline="task"][data-colored] svg path.lamp {
  stroke: var(--task);
  stroke-width: 1.8;
  stroke-linecap: round;
  filter: drop-shadow(0 0 2.5px var(--task));
}
[data-hairline="task"][data-colored] svg path.done {
  stroke: var(--task);
  stroke-width: 2.2;
  stroke-linecap: round;
}
@media (prefers-reduced-motion: reduce) {
  [data-hairline="task"] svg .lamp, [data-hairline="task"] svg .done { transition: none; }
}
`;

/** The task; `color` — its colour (none: drawn plain, while it is being set up); `running` — whether the belt steps. */
export const TaskFigure = ({
  color,
  className,
  running = true,
}: {
  color?: string;
  className?: string;
  running?: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<{ run: (on: boolean) => void } | null>(null);
  useEffect(() => {
    const stage = ref.current;
    if (!stage) {
      return;
    }
    inject(document);
    const svg = mk(
      "svg",
      { "aria-hidden": "true", viewBox: "0 0 400 320" },
      stage
    );
    const h = conveyor.mount(
      { read: { textContent: null }, stage, svg },
      conveyor.range[1]
    );
    handle.current = h;
    return () => {
      handle.current = null;
      h.destroy();
      svg.remove();
    };
  }, []);
  useEffect(() => {
    handle.current?.run(running);
  }, [running]);
  return (
    <>
      <style>{PALETTE_CSS}</style>
      {/* The drawing fills two thirds of Hairline's 400 × 320 frame; the stage is drawn larger and clipped, so the
          pointer, which the engine reads against the stage's own box, still lands where it is. */}
      <div
        aria-hidden
        className={cn("relative aspect-[5/4] overflow-hidden", className)}
      >
        <div
          className="absolute top-1/2 left-1/2 aspect-[5/4] w-[140%] -translate-x-1/2 -translate-y-1/2"
          data-colored={color ? "" : undefined}
          data-hairline="task"
          ref={ref}
          style={
            color ? ({ "--task": color } as React.CSSProperties) : undefined
          }
        />
      </div>
    </>
  );
};
