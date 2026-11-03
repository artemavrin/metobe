"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

// The sky behind a new chat (round 4 of the new-chat prototypes, after Animata's «Shooting Stars», MIT): a quiet
// starfield and, now and then, a star that falls onto the composer's top edge, bounces off it on a short arc and burns
// out, a spark where it hits. Each star is SVG moved by WAAPI — computed points, CSS performance. On the light page a
// field of specks reads as a dirty screen: there the far stars are a few four-point sparkles in the brand's blue at the
// sides; in the dark it is the field of dots. Reduced motion: the field stays, still; no star flies.

/** The next id of a list whose items come and go. */
const nextId = (counter: { current: number }) => {
  counter.current += 1;
  return counter.current;
};

/** A sky's own name for its gradients: useId's marks do not belong in `url(#…)`. */
const useSkyId = () => `sky${useId().replaceAll(/[^a-zA-Z0-9]/gu, "")}`;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** A four-point sparkle: the glint that makes a streak a star. */
const GLINT = "M0 -6 L1 -1 L6 0 L1 1 L0 6 L-1 1 L-6 0 L-1 -1 Z";

export const SKY_CSS = `
.sky { position: absolute; inset: 0; overflow: hidden;
  --star: oklch(0.55 0.2 264); --star-1: oklch(0.62 0.14 235); --star-2: oklch(0.7 0.13 55); --glow: oklch(0.6 0.2 264); --dot: oklch(0.5 0.16 264); }
.dark .sky, .sky[data-tone="night"] { --star: #ffffff; --star-1: #cfe0ff; --star-2: #ffe9cf; --glow: #ffffff; --dot: #ffffff; }
@keyframes sky-shoot {
  0% { transform: translate(0px, 0px); opacity: 0; }
  6% { opacity: 1; }
  80% { opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)); opacity: 0; }
}
@keyframes sky-twinkle { 0%, 100% { opacity: var(--o); } 50% { opacity: calc(var(--o) * 0.25); } }
/* Flying stars stay in the background: they show, but do not pull the eye from the greeting. */
.sky-flight { opacity: 0.6; }
.sky-dot { display: none; opacity: var(--o); }
.dark .sky-dot, .sky[data-tone="night"] .sky-dot { display: inline; }
@media (prefers-reduced-motion: no-preference) { .sky .sky-dot { animation: sky-twinkle var(--t) ease-in-out var(--d) infinite; } }
.sky-spark { opacity: 0.35; transform-box: fill-box; transform-origin: center; }
.dark .sky-spark, .sky[data-tone="night"] .sky-spark { display: none; }
@keyframes sky-spark {
  0%, 55%, 100% { opacity: 0.2; transform: scale(0.6); }
  70% { opacity: 0.8; transform: scale(1.05); }
  85% { opacity: 0.35; transform: scale(0.75); }
}
@media (prefers-reduced-motion: no-preference) { .sky .sky-spark { animation: sky-spark var(--t) ease-in-out var(--d) infinite; } }
`;

type Accent = 0 | 1 | 2;

const accent = (): Accent => {
  if (Math.random() < 0.8) {
    return 0;
  }
  return Math.random() < 0.5 ? 1 : 2;
};

/**
 * Where a star bound for `to` on a shallow slant comes from: the line back from `to` (25–42° above the horizon, from
 * the left or the right) followed out past the screen's top or side edge by `margin`. A star is never born in view.
 */
const fromEdge = (to: { x: number; y: number }, w: number, margin: number) => {
  const side = Math.random() < 0.5 ? -1 : 1;
  const a = (rand(25, 42) * Math.PI) / 180;
  const bx = side * Math.cos(a);
  const by = -Math.sin(a);
  const across = bx < 0 ? (-margin - to.x) / bx : (w + margin - to.x) / bx;
  const up = (-margin - to.y) / by;
  const t = Math.min(...[across, up].filter((v) => v > 0));
  return { x: to.x + bx * t, y: to.y + by * t };
};

/** The gradients a star is drawn with, named for one sky. */
const StarDefs = ({ id }: { id: string }) => (
  <defs>
    {["var(--star)", "var(--star-1)", "var(--star-2)"].map((c, i) => (
      <linearGradient id={`${id}-${i}`} key={c} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" style={{ stopColor: c, stopOpacity: 0 }} />
        <stop offset="100%" style={{ stopColor: c, stopOpacity: 1 }} />
      </linearGradient>
    ))}
    <radialGradient id={`${id}-glow`}>
      <stop
        offset="0%"
        style={{ stopColor: "var(--glow)", stopOpacity: 0.85 }}
      />
      <stop
        offset="100%"
        style={{ stopColor: "var(--glow)", stopOpacity: 0 }}
      />
    </radialGradient>
  </defs>
);

/** A streak with a glowing head and its glint, pointing along +x, the head at 0,0. */
const Streak = ({
  id,
  tone,
  len,
  width,
}: {
  id: string;
  tone: Accent;
  len: number;
  width: number;
}) => (
  <>
    <rect
      fill={`url(#${id}-${tone})`}
      height={width}
      rx={width / 2}
      width={len}
      x={-len}
      y={-width / 2}
    />
    <circle
      cx={0}
      cy={0}
      fill={`url(#${id}-glow)`}
      r={Math.max(5, width * 3.5)}
    />
    <circle cx={0} cy={0} fill="var(--star)" r={Math.max(1.3, width)} />
    <path d={GLINT} fill="var(--star)" />
  </>
);

interface Dot {
  id: number;
  x: number;
  y: number;
  r: number;
  o: number;
}

interface Shooting {
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
  tone: Accent;
}

/** A star across the whole sky on the original's diagonal, in from beyond the top or the left edge. */
const makeShooting = (
  id: number,
  w: number,
  h: number,
  first: boolean
): Shooting => {
  const len = rand(50, 170);
  const margin = len + 40;
  const angle = rand(15, 31);
  const rad = (angle * Math.PI) / 180;
  const diag = Math.hypot(w, h);
  const travel = diag + margin * 2 + rand(0, diag * 0.3);
  const fromTop = Math.random() < w / (w + h);
  return {
    angle,
    delay: first ? rand(0.2, 3.5) : rand(2, 5),
    duration: rand(1.2, 2.4),
    dx: Math.cos(rad) * travel,
    dy: Math.sin(rad) * travel,
    id,
    len,
    tone: accent(),
    width: rand(1, 2),
    x: fromTop ? rand(-0.15 * w, 0.85 * w) : -margin - rand(0, 0.2 * w),
    y: fromTop ? -margin - rand(0, 0.2 * h) : rand(-0.15 * h, 0.6 * h),
  };
};

/**
 * The starfield, and `shooting` stars at once crossing it (each comes back somewhere else once it fades). «night» is
 * the night in both themes; «page» follows the theme.
 */
export const Sky = ({
  shooting = 0,
  tone = "page",
  className,
}: {
  shooting?: number;
  tone?: "page" | "night";
  className?: string;
}) => {
  const calm = Boolean(useReducedMotion());
  const id = useSkyId();
  const box = useRef<HTMLDivElement>(null);
  const size = useRef({ h: 0, w: 0 });
  const next = useRef(0);
  const [stars, setStars] = useState<Shooting[]>([]);
  const [dots, setDots] = useState<Dot[]>([]);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) {
      return;
    }
    let seeded = false;
    const seed = () => {
      const r = el.getBoundingClientRect();
      size.current = { h: r.height, w: r.width };
      if (!r.width || !r.height) {
        return;
      }
      seeded = true;
      const n = Math.min(
        80,
        Math.max(20, Math.round((r.width * r.height) / 16_000))
      );
      setWidth(r.width);
      setDots(
        Array.from({ length: n }, (_, i) => ({
          id: i,
          o: rand(0.15, 0.6),
          r: rand(0.4, 1.2),
          x: rand(0, r.width),
          y: rand(0, r.height),
        }))
      );
      setStars(
        calm
          ? []
          : Array.from({ length: shooting }, () =>
              makeShooting(nextId(next), r.width, r.height, true)
            )
      );
    };
    const first = requestAnimationFrame(seed);
    const resize = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      size.current = { h: r.height, w: r.width };
      if (!seeded && r.width && r.height) {
        requestAnimationFrame(seed);
      }
    });
    resize.observe(el);
    return () => {
      cancelAnimationFrame(first);
      resize.disconnect();
    };
  }, [calm, shooting]);

  const recycle = useCallback((done: number) => {
    const { w, h } = size.current;
    setStars((list) =>
      list.map((s) =>
        s.id === done ? makeShooting(nextId(next), w, h, false) : s
      )
    );
  }, []);

  // The sparkles keep to the sides: one by the text reads as a stray mark in it.
  const sparks = dots
    .filter((d) => Math.abs(d.x - width / 2) > 360)
    .slice(0, 11);
  return (
    <div className={`sky ${className ?? ""}`} data-tone={tone} ref={box}>
      <svg aria-hidden className="absolute inset-0 size-full">
        <StarDefs id={id} />
        {dots.map((d) => (
          <circle
            className="sky-dot"
            cx={d.x}
            cy={d.y}
            fill="var(--dot)"
            key={d.id}
            r={d.r}
            style={
              {
                "--d": `${d.id % 7}s`,
                "--o": d.o,
                "--t": `${4 + (d.id % 5)}s`,
              } as CSSProperties
            }
          />
        ))}
        {sparks.map((d) => (
          <g key={`spark-${d.id}`} transform={`translate(${d.x} ${d.y})`}>
            <path
              className="sky-spark"
              d={GLINT}
              fill="var(--star)"
              style={
                {
                  "--d": `${(d.id * 0.7) % 6}s`,
                  "--t": `${4.5 + (d.id % 4) * 0.9}s`,
                  scale: 0.9 + d.r * 0.4,
                } as CSSProperties
              }
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
                  <Streak id={id} len={s.len} tone={s.tone} width={s.width} />
                </g>
              </g>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};

// The bounce: the fall only gathers speed (easeInCubic — a falling body is fastest when it lands); then a little
// physics — the speed it hit with, reflected and damped, then gravity — sampled into keyframes, the streak turned
// along the arc and shortened as it loses energy.

const GRAVITY = 1500;
/** easeInCubic (easings.net). */
const FALL_EASE = "cubic-bezier(0.32, 0, 0.67, 0)";
/** Its end slope, (1 − 0) / (1 − 0.67): the star hits at three times its mean speed. */
const IMPACT = 3;
const SAMPLE = 0.04;
/** Stars on their way to the composer at once. */
const BOUNCERS = 2;

interface Meteor {
  id: number;
  from: { x: number; y: number };
  hit: { x: number; y: number };
  len: number;
  width: number;
  fall: number;
  delay: number;
  tone: Accent;
}

/** A meteor, not a raindrop: in on a shallow slant from the left or the right; the pace follows the way. */
const makeMeteor = (
  id: number,
  w: number,
  hit: { x: number; y: number },
  first: boolean
): Meteor => {
  const len = rand(60, 140);
  const from = fromEdge(hit, w, len + 40);
  const way = Math.hypot(hit.x - from.x, hit.y - from.y);
  return {
    delay: first ? rand(0.3, 2.5) : rand(1.2, 4),
    fall: Math.min(3.2, Math.max(1.4, way / rand(520, 680))),
    from,
    hit,
    id,
    len,
    tone: accent(),
    width: rand(1, 1.8),
  };
};

const deg = (y: number, x: number) => (Math.atan2(y, x) * 180) / Math.PI;

const meteorFrames = (m: Meteor) => {
  const dx = m.hit.x - m.from.x;
  const dy = m.hit.y - m.from.y;
  const dist = Math.hypot(dx, dy);
  const a1 = deg(dy, dx);
  const v = (dist / m.fall) * IMPACT;
  const vx = (dx / dist) * v * 0.5;
  const vy = -(dy / dist) * v * 0.28;
  const bounce = Math.min(0.7, Math.max(0.35, (2 * -vy) / GRAVITY));
  const total = m.fall + bounce;
  const frames: Keyframe[] = [
    {
      easing: FALL_EASE,
      offset: 0,
      opacity: 0,
      transform: `translate(0px, 0px) rotate(${a1}deg) scale(1, 1)`,
    },
    { offset: (m.fall * 0.08) / total, opacity: 1 },
    {
      easing: "linear",
      offset: m.fall / total,
      opacity: 1,
      transform: `translate(${dx}px, ${dy}px) rotate(${a1}deg) scale(1, 1)`,
    },
  ];
  const steps = Math.floor(bounce / SAMPLE + 1e-6);
  for (let i = 1; i <= steps; i += 1) {
    const t = i * SAMPLE;
    const k = t / bounce;
    frames.push({
      easing: "linear",
      offset: i === steps ? 1 : Math.min(1, (m.fall + t) / total),
      opacity: Math.max(0, 1 - k) ** 1.4,
      transform: `translate(${dx + vx * t}px, ${dy + vy * t + (GRAVITY * t * t) / 2}px) rotate(${deg(vy + GRAVITY * t, vx)}deg) scale(${0.45 - 0.25 * k}, 1)`,
    });
  }
  return { frames, total };
};

/** One star: falls to its hit point, bounces, fades; then says it is done. */
const MeteorView = ({
  id,
  m,
  onDone,
}: {
  id: string;
  m: Meteor;
  onDone: (id: number) => void;
}) => {
  const body = useRef<SVGGElement>(null);
  const spark = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const el = body.current;
    if (!el) {
      return;
    }
    const { frames, total } = meteorFrames(m);
    const run = el.animate(frames, {
      delay: m.delay * 1000,
      duration: total * 1000,
      fill: "both",
    });
    const flash = spark.current?.animate(
      [
        { opacity: 0, transform: "scale(0.5)" },
        { offset: 0.25, opacity: 0.9, transform: "scale(1)" },
        { opacity: 0, transform: "scale(2.2)" },
      ],
      {
        delay: (m.delay + m.fall) * 1000,
        duration: 450,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        fill: "both",
      }
    );
    run.addEventListener("finish", () => onDone(m.id));
    return () => {
      run.cancel();
      flash?.cancel();
    };
  }, [m, onDone]);
  return (
    <g>
      <g transform={`translate(${m.from.x} ${m.from.y})`}>
        <g ref={body} style={{ opacity: 0 }}>
          <Streak id={id} len={m.len} tone={m.tone} width={m.width} />
        </g>
      </g>
      <circle
        cx={m.hit.x}
        cy={m.hit.y}
        fill={`url(#${id}-glow)`}
        opacity={0}
        r={9}
        ref={spark}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </g>
  );
};

/** The sky behind a new chat: the field, faded under the top bar and toward the composer, and the stars that bounce off
 * the composer's top edge (`composer` is its box). */
export const NightSky = ({
  composer,
}: {
  composer: RefObject<HTMLElement | null>;
}) => {
  const calm = Boolean(useReducedMotion());
  const id = useSkyId();
  const host = useRef<HTMLDivElement>(null);
  const next = useRef(0);
  const [meteors, setMeteors] = useState<Meteor[]>([]);
  /** A point on the composer's top edge, away from its rounded ends. */
  const hitPoint = useCallback(() => {
    const c = composer.current?.getBoundingClientRect();
    const base = host.current?.getBoundingClientRect();
    if (!c || !base) {
      return null;
    }
    return {
      x: rand(c.left + c.width * 0.12, c.right - c.width * 0.12) - base.left,
      y: c.top - base.top + 1,
    };
  }, [composer]);
  useEffect(() => {
    if (calm) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const w = host.current?.getBoundingClientRect().width ?? 0;
      const list: Meteor[] = [];
      for (let i = 0; i < BOUNCERS; i += 1) {
        const hit = hitPoint();
        if (hit) {
          list.push(makeMeteor(nextId(next), w, hit, true));
        }
      }
      setMeteors(list);
    });
    return () => cancelAnimationFrame(frame);
  }, [calm, hitPoint]);
  const done = useCallback(
    (finished: number) => {
      const w = host.current?.getBoundingClientRect().width ?? 0;
      const hit = hitPoint();
      setMeteors((list) =>
        list.map((m) =>
          m.id === finished && hit ? makeMeteor(nextId(next), w, hit, false) : m
        )
      );
    },
    [hitPoint]
  );
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      ref={host}
    >
      <style>{SKY_CSS}</style>
      <Sky className="[mask-image:linear-gradient(to_bottom,transparent,black_90px,black_55%,transparent_88%)]" />
      <div className="sky [mask-image:linear-gradient(to_bottom,transparent,black_80px)]">
        <svg
          aria-hidden
          className="absolute inset-0 size-full overflow-visible"
        >
          <StarDefs id={id} />
          <g className="sky-flight">
            {meteors.map((m) => (
              <MeteorView id={id} key={m.id} m={m} onDone={done} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
};
