"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import { Stage, useCalm } from "./backdrop";
import { HoldEgg } from "./bg-egg";
import type { StageView } from "./backdrop";

// Round 4, after Animata's «Shooting Stars» (animata.design/docs/background/shooting-stars, MIT): a streak with a
// glowing head flies along its angle and fades, then comes back somewhere else; under it a starfield twinkles. Each
// star is SVG moved by its own CSS animation — off the main thread, as the original. The variants differ in how many
// stars, where, and what they mean:
//   «Звездопад» — the original's sky over the whole screen, thinned out for a working screen;
//   «Редкие»   — one star now and then in the upper half, nothing else;
//   «Окно»     — a night panel behind the greeting only, night in both themes;
//   «К вопросу» — stars fall toward the composer and fade before it; typing calls more of them.
// On the light page white stars vanish: the full-screen variants draw them in the brand's blue there. Reduced motion:
// the starfield stays, still; no stars fly.

type Tone = "page" | "night";

interface Star {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  angle: number;
  len: number;
  width: number;
  duration: number;
  delay: number;
  accent: 0 | 1 | 2;
}

interface Dot {
  id: number;
  x: number;
  y: number;
  r: number;
  o: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Where a star bound for `to` on a shallow slant comes from: the line back from `to` (25–42° above the horizon, from
 * the left or the right) followed out past the screen's top or side edge by `margin`. A star is never born in view:
 * it comes in from beyond the edge, already lit, and may only burn out in the sky.
 */
const fromEdge = (to: { x: number; y: number }, w: number, margin: number) => {
  const side = Math.random() < 0.5 ? -1 : 1;
  const a = (rand(25, 42) * Math.PI) / 180;
  const bx = side * Math.cos(a);
  const by = -Math.sin(a);
  const ts = [bx < 0 ? (-margin - to.x) / bx : (w + margin - to.x) / bx, (-margin - to.y) / by].filter((t) => t > 0);
  const t = Math.min(...ts);
  return { x: to.x + bx * t, y: to.y + by * t };
};

export interface SkyRules {
  /** Stars in flight at once. */
  count: number;
  /** Seconds before a star comes back after it faded. */
  rest: [number, number];
  /** Seconds a flight takes. */
  pace: [number, number];
  /** Where a star starts: anywhere along the top and left edges, or the upper half only. */
  region: "all" | "top";
  /** A point the stars fall toward (the composer); null — the original's one diagonal. */
  target?: () => { x: number; y: number } | null;
}

const makeStar = (id: number, w: number, h: number, rules: SkyRules, first: boolean): Star => {
  const len = rand(50, rules.region === "top" ? 140 : 170);
  const margin = len + 40;
  const [r0, r1] = rules.rest;
  const delay = first ? rand(0.2, r0 + (r1 - r0) / 2) : rand(r0, r1);
  const accent = (Math.random() < 0.8 ? 0 : Math.random() < 0.5 ? 1 : 2) as Star["accent"];
  const width = rand(1, 2);
  const duration = rand(...rules.pace);
  const aim = rules.target?.();
  if (aim) {
    // From the left or the right on a shallow slant toward the composer, as a meteor crosses the sky; it burns out
    // short of it.
    const { x, y } = fromEdge(aim, w, margin);
    const angle = (Math.atan2(aim.y - y, aim.x - x) * 180) / Math.PI;
    const travel = Math.hypot(aim.x - x, aim.y - y) * rand(0.62, 0.8);
    const rad = (angle * Math.PI) / 180;
    return { accent, angle, delay, dx: Math.cos(rad) * travel, dy: Math.sin(rad) * travel, duration, id, len, width, x, y };
  }
  const angle = rand(15, 31);
  const rad = (angle * Math.PI) / 180;
  if (rules.region === "top") {
    // A stroke across the upper half: in from beyond the top or the left edge, burning out in the sky.
    const fromTop = Math.random() < 0.6;
    const x = fromTop ? rand(0.05 * w, 0.6 * w) : -margin;
    const y = fromTop ? -margin : rand(0.02 * h, 0.22 * h);
    const travel = margin + rand(0.35, 0.6) * w;
    return { accent, angle, delay, dx: Math.cos(rad) * travel, dy: Math.sin(rad) * travel, duration, id, len, width, x, y };
  }
  const diag = Math.hypot(w, h);
  const travel = diag + margin * 2 + rand(0, diag * 0.3);
  const fromTop = Math.random() < w / (w + h);
  const x = fromTop ? rand(-0.15 * w, 0.85 * w) : -margin - rand(0, 0.2 * w);
  const y = fromTop ? -margin - rand(0, 0.2 * h) : rand(-0.15 * h, 0.6 * h);
  return { accent, angle, delay, dx: Math.cos(rad) * travel, dy: Math.sin(rad) * travel, duration, id, len, width, x, y };
};

export const SKY_CSS = `
.sky { position: absolute; inset: 0; overflow: hidden;
  --star: oklch(0.55 0.2 264); --star-1: oklch(0.62 0.14 235); --star-2: oklch(0.7 0.13 55); --glow: oklch(0.6 0.2 264); --dot: oklch(0.5 0.16 264); --boost: 1.6; --grow: 0.8px; }
.dark .sky, .sky[data-tone="night"] { --star: #ffffff; --star-1: #cfe0ff; --star-2: #ffe9cf; --glow: #ffffff; --dot: #ffffff; --boost: 1; --grow: 0px; }
@keyframes sky-shoot {
  0% { transform: translate(0px, 0px); opacity: 0; }
  6% { opacity: 1; }
  80% { opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)); opacity: 0; }
}
/* The rows are see-through in the product: a star must not cross behind their text. */
.sky-stage section button { background-color: var(--background); }
/* On the light page a star needs more ink: denser and a little larger (a stroke of its own colour). */
@keyframes sky-twinkle { 0%, 100% { opacity: min(1, calc(var(--o) * var(--boost))); } 50% { opacity: calc(var(--o) * var(--boost) * 0.25); } }
/* Flying stars stay in the background: they show, but do not pull the eye from the greeting. */
.sky-flight { opacity: 0.6; }
.sky-dot { opacity: min(1, calc(var(--o) * var(--boost))); stroke: var(--dot); stroke-width: var(--grow); }
.sky[data-moving] .sky-dot { animation: sky-twinkle var(--t) ease-in-out var(--d) infinite; }
/* On the white page a field of specks reads as a dirty screen: there the far stars are a few four-point sparkles in
   the brand's blue that come and go, each at its own pace. In the dark (and the night window) — the field of dots. */
.sky-dot { display: none; }
.dark .sky-dot, .sky[data-tone="night"] .sky-dot { display: inline; }
.sky-spark { opacity: 0.35; transform-box: fill-box; transform-origin: center; }
.dark .sky-spark, .sky[data-tone="night"] .sky-spark { display: none; }
@keyframes sky-spark {
  0%, 55%, 100% { opacity: 0.2; transform: scale(0.6); }
  70% { opacity: 0.8; transform: scale(1.05); }
  85% { opacity: 0.35; transform: scale(0.75); }
}
.sky[data-moving] .sky-spark { animation: sky-spark var(--t) ease-in-out var(--d) infinite; }
`;

/** The sky: a starfield (optional) and stars in flight by the rules; recycles each star where its flight ends. */
export const Sky = ({ rules, field, tone = "page", className, style }: { rules: SkyRules; field: boolean; tone?: Tone; className?: string; style?: CSSProperties }) => {
  const calm = useCalm();
  const box = useRef<HTMLDivElement>(null);
  const size = useRef({ h: 0, w: 0 });
  const next = useRef(0);
  const [stars, setStars] = useState<Star[]>([]);
  const [dots, setDots] = useState<Dot[]>([]);
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let seeded = false;
    const seed = () => {
      const r = el.getBoundingClientRect();
      size.current = { h: r.height, w: r.width };
      if (!r.width || !r.height) return;
      seeded = true;
      const n = field ? Math.min(80, Math.max(20, Math.round((r.width * r.height) / 16_000))) : 0;
      setDots(Array.from({ length: n }, (_, i) => ({ id: i, o: rand(0.15, 0.6), r: rand(0.4, 1.2), x: rand(0, r.width), y: rand(0, r.height) })));
      setStars(calm ? [] : Array.from({ length: rulesRef.current.count }, () => makeStar(next.current++, r.width, r.height, rulesRef.current, true)));
    };
    const first = requestAnimationFrame(seed);
    const resize = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      size.current = { h: r.height, w: r.width };
      if (!seeded && r.width && r.height) requestAnimationFrame(seed);
    });
    resize.observe(el);
    return () => {
      cancelAnimationFrame(first);
      resize.disconnect();
    };
  }, [calm, field]);

  // More stars in flight when the rules ask for more (typing in «К вопросу»): new ones join, extra ones finish.
  useEffect(() => {
    if (calm) return;
    const { w, h } = size.current;
    if (!w || !h) return;
    setStars((list) => (list.length >= rules.count ? list : [...list, ...Array.from({ length: rules.count - list.length }, () => makeStar(next.current++, w, h, rulesRef.current, false))]));
  }, [rules.count, calm]);

  const recycle = useCallback((id: number) => {
    const { w, h } = size.current;
    if (!w || !h) return;
    setStars((list) => {
      const over = list.length > rulesRef.current.count;
      return over ? list.filter((s) => s.id !== id) : list.map((s) => (s.id === id ? makeStar(next.current++, w, h, rulesRef.current, false) : s));
    });
  }, []);

  const fill = ["var(--star)", "var(--star-1)", "var(--star-2)"];
  return (
    <div className={`sky ${className ?? ""}`} data-moving={calm ? undefined : ""} data-tone={tone} ref={box} style={style}>
      <svg aria-hidden className="absolute inset-0 size-full">
        <defs>
          {fill.map((c, i) => (
            <linearGradient id={`sky-${i}`} key={c} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" style={{ stopColor: c, stopOpacity: 0 }} />
              <stop offset="100%" style={{ stopColor: c, stopOpacity: 1 }} />
            </linearGradient>
          ))}
          <radialGradient id="sky-glow">
            <stop offset="0%" style={{ stopColor: "var(--glow)", stopOpacity: 0.85 }} />
            <stop offset="100%" style={{ stopColor: "var(--glow)", stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        {dots.map((d) => (
          <circle
            className="sky-dot"
            cx={d.x}
            cy={d.y}
            fill="var(--dot)"
            key={d.id}
            r={d.r}
            style={{ "--d": `${d.id % 7}s`, "--o": d.o, "--t": `${4 + (d.id % 5)}s` } as CSSProperties}
          />
        ))}
        {/* The sparkles keep to the sides: one by the text reads as a stray mark in it. */}
        {dots.filter((d) => Math.abs(d.x - size.current.w / 2) > 360).slice(0, 11).map((d) => (
          <g key={`spark-${d.id}`} transform={`translate(${d.x} ${d.y})`}>
            <path
              className="sky-spark"
              d={GLINT}
              fill="var(--star)"
              style={{ "--d": `${(d.id * 0.7) % 6}s`, "--t": `${4.5 + (d.id % 4) * 0.9}s`, scale: 0.9 + d.r * 0.4 } as CSSProperties}
            />
          </g>
        ))}
        <g className="sky-flight">
        {stars.map((s) => (
          <g key={s.id} transform={`translate(${s.x} ${s.y})`}>
            <g
              onAnimationEnd={() => recycle(s.id)}
              style={
                {
                  "--dx": `${s.dx}px`,
                  "--dy": `${s.dy}px`,
                  // The original's curve: a meteor gathers speed, then burns out.
                  animation: `sky-shoot ${s.duration}s cubic-bezier(0.4, 0, 0.7, 1) ${s.delay}s forwards`,
                  opacity: 0,
                } as CSSProperties
              }
            >
              <g transform={`rotate(${s.angle})`}>
                <rect fill={`url(#sky-${s.accent})`} height={s.width} rx={s.width / 2} width={s.len} x={-s.len} y={-s.width / 2} />
                <circle cx={0} cy={0} fill="url(#sky-glow)" r={Math.max(5, s.width * 3.5)} />
                <circle cx={0} cy={0} fill="var(--star)" r={Math.max(1.3, s.width)} />
                <path d={GLINT} fill="var(--star)" />
              </g>
            </g>
          </g>
        ))}
        </g>
      </svg>
    </div>
  );
};

/** Fades the sky toward the composer and under the top bar, so nothing flies over the field where you type. */
const FADE = "[mask-image:linear-gradient(to_bottom,transparent,black_90px,black_55%,transparent_88%)]";

const FALL: SkyRules = { count: 7, pace: [1.4, 3.4], region: "all", rest: [0.4, 2.2] };
const RARE: SkyRules = { count: 1, pace: [0.9, 1.4], region: "top", rest: [4, 10] };

export const Falling = () => (
  <div className="sky-stage contents">
    <style>{SKY_CSS}</style>
    <Stage phrase backdrop={() => (
      <>
        <Sky className={FADE} field rules={FALL} />
        <HoldEgg />
      </>
    )} />
  </div>
);

export const Rare = () => (
  <>
    <style>{SKY_CSS}</style>
    <Stage phrase backdrop={() => (
      <>
        <Sky className={FADE} field={false} rules={RARE} />
        <HoldEgg />
      </>
    )} />
  </>
);

// «Окно»: the night lives in a panel behind the greeting — measured from the greeting and today's date, a little
// larger — and the greeting reads white on it. The rest of the screen stays the product's.
const WINDOW_CSS = `
.sky-window h1, .sky-window h1 + p { position: relative; color: #fff; }
.sky-window h1 + p { color: rgb(255 255 255 / 0.7); }
.sky-panel { position: absolute; border-radius: 20px; overflow: hidden; background: radial-gradient(120% 90% at 50% 0%, oklch(0.32 0.09 264), oklch(0.17 0.04 264) 60%, oklch(0.12 0.02 264)); box-shadow: 0 0 0 1px oklch(1 0 0 / 0.06) inset, 0 12px 40px -12px oklch(0.2 0.08 264 / 0.45); }
`;

const WINDOW_RULES: SkyRules = { count: 4, pace: [1.1, 2.4], region: "all", rest: [0.6, 3] };

const Panel = ({ welcome }: StageView) => {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = welcome.current;
    const layer = host.current;
    if (!root || !layer) return;
    const measure = () => {
      const h1 = root.querySelector("h1");
      const p = h1?.nextElementSibling;
      if (!h1 || !p) return;
      const base = layer.getBoundingClientRect();
      const a = h1.getBoundingClientRect();
      const b = p.getBoundingClientRect();
      const column = h1.closest(".max-w-xl")?.getBoundingClientRect();
      const left = (column?.left ?? Math.min(a.left, b.left)) - base.left;
      const width = column?.width ?? Math.max(a.width, b.width);
      setRect({ height: b.bottom - a.top + 64, left, top: a.top - base.top - 32, width });
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    root.addEventListener("scroll", measure, true);
    root.addEventListener("animationend", measure, true);
    return () => {
      resize.disconnect();
      root.removeEventListener("scroll", measure, true);
      root.removeEventListener("animationend", measure, true);
    };
  }, [welcome]);
  return (
    <div className="absolute inset-0" ref={host}>
      {rect && (
        <div className="sky-panel" style={rect}>
          <Sky field rules={WINDOW_RULES} tone="night" />
        </div>
      )}
    </div>
  );
};

export const Window = () => (
  <div className="sky-window contents">
    <style>{SKY_CSS + WINDOW_CSS}</style>
    <Stage phrase backdrop={(view) => <Panel {...view} />} />
  </div>
);

// «К вопросу»: the stars fall toward the composer's middle and burn out before it; while a question is typed, more
// of them come.
const Toward = ({ composer, typing }: StageView) => {
  const host = useRef<HTMLDivElement>(null);
  const target = useCallback(() => {
    const c = composer.current?.getBoundingClientRect();
    const base = host.current?.getBoundingClientRect();
    return c && base ? { x: c.left + c.width / 2 - base.left, y: c.top - base.top } : null;
  }, [composer]);
  const rules: SkyRules = { count: typing ? 4 : 2, pace: [1.6, 2.8], region: "all", rest: typing ? [0.4, 1.4] : [1.2, 4], target };
  return (
    <div className="absolute inset-0" ref={host}>
      <Sky className="[mask-image:linear-gradient(to_bottom,transparent,black_80px)]" field rules={rules} />
    </div>
  );
};

export const TowardQuestion = () => (
  <div className="sky-stage contents">
    <style>{SKY_CSS}</style>
    <Stage phrase backdrop={(view) => (
      <>
        <Toward {...view} />
        <HoldEgg />
      </>
    )} />
  </div>
);

// «Отскок»: the stars fall onto the composer's top edge, bounce off it on a short arc and burn out; a spark where each
// one hits. The fall only gathers speed (easeInCubic — the original's curve slows at its end, where its star burns out;
// one that hits must be fastest at the hit, as a falling body is); the bounce is a little physics — the speed the star hit
// with, reflected and damped, then gravity — sampled into keyframes, the streak turned along the arc and shortened as
// it loses energy. WAAPI: computed points, CSS performance.

const GRAVITY = 1500;
/** easeInCubic (easings.net): a falling body, fastest when it lands. */
const FALL_EASE = "cubic-bezier(0.32, 0, 0.67, 0)";
/** Its end slope: (1 − 0) / (1 − 0.67). */
const IMPACT = 3;
const SAMPLE = 0.04;

interface Meteor {
  id: number;
  from: { x: number; y: number };
  hit: { x: number; y: number };
  len: number;
  width: number;
  fall: number;
  delay: number;
  accent: 0 | 1 | 2;
}

/**
 * A meteor, not a raindrop: it comes in on a shallow slant (25–42° below the horizon) from the left or the right, so
 * it crosses the sky rather than dropping out of it; the pace follows the length of the way.
 */
const makeMeteor = (id: number, w: number, hit: { x: number; y: number }, first: boolean): Meteor => {
  const len = rand(60, 140);
  const from = fromEdge(hit, w, len + 40);
  const way = Math.hypot(hit.x - from.x, hit.y - from.y);
  return {
    accent: (Math.random() < 0.8 ? 0 : Math.random() < 0.5 ? 1 : 2) as Meteor["accent"],
    delay: first ? rand(0.3, 2.5) : rand(1.2, 4),
    fall: Math.min(3.2, Math.max(1.4, way / rand(520, 680))),
    from,
    hit,
    id,
    len,
    width: rand(1, 1.8),
  };
};

const deg = (y: number, x: number) => (Math.atan2(y, x) * 180) / Math.PI;

/** One star: falls to its hit point, bounces, fades; then says it is done. */
const MeteorView = ({ m, onDone }: { m: Meteor; onDone: (id: number) => void }) => {
  const body = useRef<SVGGElement>(null);
  const spark = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const dx = m.hit.x - m.from.x;
    const dy = m.hit.y - m.from.y;
    const dist = Math.hypot(dx, dy);
    const a1 = deg(dy, dx);
    // easeInCubic ends at three times its mean speed: the star hits with that.
    const v = (dist / m.fall) * IMPACT;
    const vx = (dx / dist) * v * 0.5;
    const vy = -(dy / dist) * v * 0.28;
    const frames: Keyframe[] = [];
    const bounce = Math.min(0.7, Math.max(0.35, (2 * -vy) / GRAVITY));
    const total = m.fall + bounce;
    frames.push({ easing: FALL_EASE, offset: 0, opacity: 0, transform: `translate(0px, 0px) rotate(${a1}deg) scale(1, 1)` });
    frames.push({ offset: (m.fall * 0.08) / total, opacity: 1 });
    frames.push({ easing: "linear", offset: m.fall / total, opacity: 1, transform: `translate(${dx}px, ${dy}px) rotate(${a1}deg) scale(1, 1)` });
    for (let t = SAMPLE; t <= bounce + 1e-6; t += SAMPLE) {
      const k = t / bounce;
      const x = dx + vx * t;
      const y = dy + vy * t + (GRAVITY * t * t) / 2;
      frames.push({
        easing: "linear",
        offset: Math.min(1, (m.fall + t) / total),
        opacity: Math.max(0, 1 - k) ** 1.4,
        // Along the arc, shorter as it loses energy.
        transform: `translate(${x}px, ${y}px) rotate(${deg(vy + GRAVITY * t, vx)}deg) scale(${0.45 - 0.25 * k}, 1)`,
      });
    }
    frames.at(-1)!.offset = 1;
    const run = el.animate(frames, { delay: m.delay * 1000, duration: total * 1000, fill: "both" });
    spark.current?.animate(
      [
        { opacity: 0, transform: "scale(0.5)" },
        { offset: 0.25, opacity: 0.9, transform: "scale(1)" },
        { opacity: 0, transform: "scale(2.2)" },
      ],
      { delay: (m.delay + m.fall) * 1000, duration: 450, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" }
    );
    run.onfinish = () => onDone(m.id);
    return () => run.cancel();
  }, [m, onDone]);
  return (
    <g>
      <g transform={`translate(${m.from.x} ${m.from.y})`}>
        <g ref={body} style={{ opacity: 0 }}>
          <rect fill={`url(#sky-${m.accent})`} height={m.width} rx={m.width / 2} width={m.len} x={-m.len} y={-m.width / 2} />
          <circle cx={0} cy={0} fill="url(#sky-glow)" r={Math.max(5, m.width * 3.5)} />
          <circle cx={0} cy={0} fill="var(--star)" r={Math.max(1.3, m.width)} />
          {/* The glint that makes it a star */}
          <path d={GLINT} fill="var(--star)" />
        </g>
      </g>
      <circle cx={m.hit.x} cy={m.hit.y} fill="url(#sky-glow)" opacity={0} r={9} ref={spark} style={{ transformBox: "fill-box", transformOrigin: "center" }} />
    </g>
  );
};

const BOUNCERS = 2;
/** A four-point sparkle at the head. */
const GLINT = "M0 -6 L1 -1 L6 0 L1 1 L0 6 L-1 1 L-6 0 L-1 -1 Z";
/** The starfield alone: the night that tells it is space, not weather. */
const FIELD_ONLY: SkyRules = { count: 0, pace: [1, 1], region: "all", rest: [1, 1] };

const Bounce = ({ composer }: StageView) => {
  const calm = useCalm();
  const host = useRef<HTMLDivElement>(null);
  const next = useRef(0);
  const [meteors, setMeteors] = useState<Meteor[]>([]);
  /** A point on the composer's top edge, away from its rounded ends. */
  const hitPoint = useCallback(() => {
    const c = composer.current?.getBoundingClientRect();
    const base = host.current?.getBoundingClientRect();
    if (!c || !base) return null;
    return { x: rand(c.left + c.width * 0.12, c.right - c.width * 0.12) - base.left, y: c.top - base.top + 1 };
  }, [composer]);
  useEffect(() => {
    if (calm) return;
    const frame = requestAnimationFrame(() => {
      const w = host.current?.getBoundingClientRect().width ?? 0;
      const list: Meteor[] = [];
      for (let i = 0; i < BOUNCERS; i++) {
        const hit = hitPoint();
        if (hit) list.push(makeMeteor(next.current++, w, hit, true));
      }
      setMeteors(list);
    });
    return () => cancelAnimationFrame(frame);
  }, [calm, hitPoint]);
  const done = useCallback(
    (id: number) => {
      const w = host.current?.getBoundingClientRect().width ?? 0;
      const hit = hitPoint();
      setMeteors((list) => list.map((m) => (m.id === id && hit ? makeMeteor(next.current++, w, hit, false) : m)));
    },
    [hitPoint]
  );
  return (
    <div className="absolute inset-0" ref={host}>
      <Sky className={FADE} field rules={FIELD_ONLY} />
      <div className="sky [mask-image:linear-gradient(to_bottom,transparent,black_80px)]">
        <svg aria-hidden className="absolute inset-0 size-full overflow-visible">
          <defs>
            {["var(--star)", "var(--star-1)", "var(--star-2)"].map((c, i) => (
              <linearGradient id={`sky-${i}`} key={c} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" style={{ stopColor: c, stopOpacity: 0 }} />
                <stop offset="100%" style={{ stopColor: c, stopOpacity: 1 }} />
              </linearGradient>
            ))}
            <radialGradient id="sky-glow">
              <stop offset="0%" style={{ stopColor: "var(--glow)", stopOpacity: 0.85 }} />
              <stop offset="100%" style={{ stopColor: "var(--glow)", stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <g className="sky-flight">
            {meteors.map((m) => (
              <MeteorView key={m.id} m={m} onDone={done} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
};

export const BounceVariant = () => (
  <div className="sky-stage contents">
    <style>{SKY_CSS}</style>
    <Stage phrase backdrop={(view) => (
      <>
        <Bounce {...view} />
        <HoldEgg />
      </>
    )} />
  </div>
);
