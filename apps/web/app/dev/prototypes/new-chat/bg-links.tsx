"use client";

import { useEffect, useRef, useState } from "react";

import { Stage, useCalm } from "./backdrop";
import type { StageView } from "./backdrop";

// «Связи»: the screen drawn as the wiring it is. From every «Начать с» row a hairline steps out to the left and runs
// down into the composer's top edge, where it ends in a small port — the rows are inputs of the question. Hovering a
// row lights its line; choosing it sends a light down the line into the composer, landing where its badge appears.
// Axis: explanation and spatial consistency — the motion says where the choice went. Nothing moves on its own: the
// lines draw in once with the screen, the light runs only on a click. Where the column has no room to its left (a
// phone), there are no lines. Reduced motion: no drawing in, the click flashes the line instead of running a light.

/** Strong ease-out (entrances) and ease-in-out (movement along the line), from the motion table. */
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
/** The running light's length, as a share of its line. */
const SEG = 0.16;
const RADIUS = 10;

interface Rail {
  d: string;
  /** Where the line meets the composer. */
  end: { x: number; y: number };
  /** Rough length in px: sets the light's pace. */
  length: number;
}

const rowsIn = (root: HTMLElement | null) => [...(root?.querySelectorAll<HTMLElement>("section button") ?? [])];

const Links = ({ welcome, composer }: StageView) => {
  const calm = useCalm();
  const svg = useRef<SVGSVGElement>(null);
  const [rails, setRails] = useState<Rail[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const drawn = useRef(false);
  const lines = useRef<(SVGPathElement | null)[]>([]);
  const lights = useRef<(SVGPathElement | null)[]>([]);
  const sparks = useRef<(SVGCircleElement | null)[]>([]);

  // The lines follow the rows and the composer: on resize, on the welcome's scroll and after the screen's rise.
  useEffect(() => {
    const host = svg.current;
    const root = welcome.current;
    const box = composer.current;
    if (!host || !root || !box) return;
    const measure = () => {
      const base = host.getBoundingClientRect();
      const c = box.getBoundingClientRect();
      const rows = rowsIn(root);
      const n = rows.length;
      const bottom = c.top - base.top;
      const next = rows.map((row, i) => {
        const r = row.getBoundingClientRect();
        const y = r.top + r.height / 2 - base.top;
        const from = r.left - base.left - 6;
        // The first row's line runs outermost, so no line crosses another.
        const x = r.left - base.left - 22 - (n - 1 - i) * 9;
        return {
          d: `M ${from} ${y} H ${x + RADIUS} Q ${x} ${y} ${x} ${y + RADIUS} V ${bottom}`,
          end: { x, y: bottom },
          length: from - x + (bottom - y),
        };
      });
      const room = next.every((r) => r.end.x > 16 && r.end.x > c.left - base.left + 14 && r.end.y > 0);
      setRails(room ? next : []);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(host);
    resize.observe(root);
    resize.observe(box);
    root.addEventListener("scroll", measure, true);
    root.addEventListener("animationend", measure, true);
    box.parentElement?.addEventListener("animationend", measure);
    return () => {
      resize.disconnect();
      root.removeEventListener("scroll", measure, true);
      root.removeEventListener("animationend", measure, true);
      box.parentElement?.removeEventListener("animationend", measure);
    };
  }, [welcome, composer]);

  // The lines draw in once, with the screen's own rise.
  useEffect(() => {
    if (rails.length === 0 || drawn.current) return;
    drawn.current = true;
    if (calm) return;
    lines.current.forEach((line, i) =>
      line?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
        delay: 120 + i * 40,
        duration: 300,
        easing: EASE_OUT,
        fill: "backwards",
      })
    );
  }, [rails.length, calm]);

  // A row lit while the pointer or focus is on it; a click sends the light down its line.
  useEffect(() => {
    const rows = rowsIn(welcome.current);
    if (rows.length === 0 || rails.length !== rows.length) return;
    const send = (i: number) => {
      const light = lights.current[i];
      const spark = sparks.current[i];
      const rail = rails[i];
      if (!light || !spark || !rail) return;
      if (calm) {
        // No running light: the whole line flashes and settles.
        lines.current[i]?.animate([{ stroke: "var(--primary)", strokeOpacity: 0.9 }, { strokeOpacity: 0.42 }], { duration: 500, easing: "ease" });
        return;
      }
      const travel = Math.min(900, Math.max(520, rail.length * 1.6));
      light.animate([{ strokeDashoffset: SEG }, { strokeDashoffset: -1 }], { duration: travel, easing: EASE_IN_OUT });
      spark.animate(
        [
          { opacity: 0, transform: "scale(0.6)" },
          { offset: 0.35, opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(1.8)" },
        ],
        { delay: travel * 0.82, duration: 420, easing: EASE_OUT }
      );
    };
    const off: (() => void)[] = [];
    rows.forEach((row, i) => {
      const on = () => setLit(i);
      const out = () => setLit((v) => (v === i ? null : v));
      const click = () => send(i);
      row.addEventListener("pointerenter", on);
      row.addEventListener("pointerleave", out);
      row.addEventListener("focus", on);
      row.addEventListener("blur", out);
      row.addEventListener("click", click);
      off.push(() => {
        row.removeEventListener("pointerenter", on);
        row.removeEventListener("pointerleave", out);
        row.removeEventListener("focus", on);
        row.removeEventListener("blur", out);
        row.removeEventListener("click", click);
      });
    });
    return () => {
      for (const f of off) f();
    };
  }, [welcome, rails, calm]);

  return (
    <svg className="text-foreground absolute inset-0 size-full overflow-visible" ref={svg}>
      {rails.map((r, i) => (
        <g key={i}>
          <path
            d={r.d}
            fill="none"
            pathLength={1}
            ref={(el) => {
              lines.current[i] = el;
            }}
            stroke="currentColor"
            strokeDasharray="1 1"
            strokeOpacity={lit === i ? 0.42 : 0.14}
            strokeWidth={1}
            style={{ transition: "stroke-opacity 150ms ease" }}
          />
          <path
            d={r.d}
            fill="none"
            pathLength={1}
            ref={(el) => {
              lights.current[i] = el;
            }}
            stroke="var(--primary)"
            strokeDasharray={`${SEG} 1`}
            strokeDashoffset={SEG}
            strokeLinecap="round"
            strokeWidth={1.75}
          />
          {/* The port where the line meets the composer */}
          <circle cx={r.end.x} cy={r.end.y} fill="currentColor" fillOpacity={lit === i ? 0.55 : 0.22} r={2} style={{ transition: "fill-opacity 150ms ease" }} />
          <circle
            cx={r.end.x}
            cy={r.end.y}
            fill="var(--primary)"
            opacity={0}
            r={4}
            ref={(el) => {
              sparks.current[i] = el;
            }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        </g>
      ))}
    </svg>
  );
};

export const LinksVariant = () => <Stage backdrop={(view) => <Links {...view} />} />;
