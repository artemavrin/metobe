"use client";

import { animate, motionValue } from "motion/react";
import { useEffect, useRef } from "react";

import { Stage, useCalm } from "./backdrop";

// «Сетка»: a quiet field of dots under the screen, gone toward the edges. Where the pointer is, the dots swell and
// brighten a little; the patch follows the pointer on a spring, so it trails and settles instead of sticking to it.
// Axis: feedback — the screen notices the hand on it and nothing else moves. A touch screen and reduced motion get
// the still field. The base field is drawn once; a frame redraws only the dots near the pointer, and only while the
// patch moves or fades.

const GAP = 22;
const DOT = 1.15;
const REACH = 150;
/** Apple-style spring from the motion table: the patch trails the pointer and settles. */
const FOLLOW = { bounce: 0.2, duration: 0.5, type: "spring" } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const DotGrid = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calm = useCalm();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const base = document.createElement("canvas");
    const bctx = base.getContext("2d");
    if (!bctx) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let color = "";
    let dark = false;
    // Light needs a little more ink than dark to read as the same field.
    const rest = () => (dark ? 0.34 : 0.26);
    const peak = () => (dark ? 0.72 : 0.55);
    const x = motionValue(-1e4);
    const y = motionValue(-1e4);
    const power = motionValue(0);
    let frame = 0;

    const dotsOver = (c: CanvasRenderingContext2D, alpha: number, r: number, px: number, py: number) => {
      c.globalAlpha = alpha;
      c.beginPath();
      c.arc(px, py, r, 0, Math.PI * 2);
      c.fill();
    };

    const drawBase = () => {
      base.width = canvas.width;
      base.height = canvas.height;
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.fillStyle = color;
      const ox = (w % GAP) / 2;
      const oy = (h % GAP) / 2;
      for (let px = ox; px < w; px += GAP) {
        for (let py = oy; py < h; py += GAP) dotsOver(bctx, rest(), DOT, px, py);
      }
    };

    const draw = () => {
      frame = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      const k = power.get();
      if (k < 0.002) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = color;
      const cx = x.get();
      const cy = y.get();
      const ox = (w % GAP) / 2;
      const oy = (h % GAP) / 2;
      const i0 = Math.max(0, Math.floor((cx - REACH - ox) / GAP));
      const j0 = Math.max(0, Math.floor((cy - REACH - oy) / GAP));
      for (let px = ox + i0 * GAP; px < Math.min(w, cx + REACH); px += GAP) {
        for (let py = oy + j0 * GAP; py < Math.min(h, cy + REACH); py += GAP) {
          const d = Math.hypot(px - cx, py - cy);
          if (d >= REACH) continue;
          const t = 1 - d / REACH;
          const s = t * t * (3 - 2 * t) * k;
          // Cover the resting dot, then the lit one over it.
          ctx.globalCompositeOperation = "destination-out";
          dotsOver(ctx, 1, DOT + 0.6, px, py);
          ctx.globalCompositeOperation = "source-over";
          dotsOver(ctx, rest() + (peak() - rest()) * s, DOT * (1 + 1.4 * s), px, py);
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      color = getComputedStyle(canvas).color;
      dark = document.documentElement.classList.contains("dark");
      drawBase();
      draw();
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(canvas);
    // The theme can change while the screen is open (the account menu).
    const theme = new MutationObserver(measure);
    theme.observe(document.documentElement, { attributeFilter: ["class"], attributes: true });

    const unsubs = [x.on("change", schedule), y.on("change", schedule), power.on("change", schedule)];
    let inside = false;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const within = px >= 0 && py >= 0 && px <= rect.width && py <= rect.height;
      if (!within) {
        if (inside) animate(power, 0, { duration: 0.4, ease: EASE_OUT });
        inside = false;
        return;
      }
      if (!inside) {
        // A fresh entry starts the patch under the pointer, not flying in from where it last was.
        x.jump(px);
        y.jump(py);
        animate(power, 1, { duration: 0.2, ease: EASE_OUT });
        inside = true;
        return;
      }
      animate(x, px, FOLLOW);
      animate(y, py, FOLLOW);
    };
    const onLeave = () => {
      inside = false;
      animate(power, 0, { duration: 0.4, ease: EASE_OUT });
    };
    if (fine && !calm) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      theme.disconnect();
      for (const u of unsubs) u();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [calm]);

  return (
    <canvas
      className="text-foreground absolute inset-0 size-full [mask-image:radial-gradient(ellipse_75%_70%_at_50%_42%,black_35%,transparent_100%)]"
      ref={canvasRef}
    />
  );
};

// The rows are see-through in the product; over a textured field they get the page under them, so the field stays a
// background and the text stays clean. Hover keeps its own colour (its class outranks this).
const ROWS_CSS = `.grid-stage section button { background-color: var(--background); }`;

export const Grid = () => (
  <div className="grid-stage contents">
    <style>{ROWS_CSS}</style>
    <Stage backdrop={() => <DotGrid />} />
  </div>
);
