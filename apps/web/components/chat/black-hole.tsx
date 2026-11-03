"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Cormorant_Garamond } from "next/font/google";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CSSProperties, RefObject } from "react";
import { createPortal } from "react-dom";

import { createHoleRenderer } from "@/components/chat/hole-gl";
import { Sky, SKY_CSS } from "@/components/chat/night-sky";

// The easter egg of a new chat's night sky: hold the pointer down on an empty spot. After a second stars come flying
// into it from beyond the screen's edges, spiralling in, faster as they near, and a black hole grows under the pointer:
// an event horizon with a tilted accretion disk turning round it (the shader in hole-gl). Let go — the disk's matter
// is flung off in a firework. Held at critical mass for five seconds it swallows the page: piece by piece, the nearest
// first, every text, button and picture is torn off and pulled into it; the black over the page is its horizon, frame
// by frame; once the page is in, the horizon bursts past the screen's edges — we fall in. Beyond it: a few lines about
// rest and «Новый чат», which brings the page back. Moving more than a few px before the second is up is a selection
// or a drag: no egg. Reduced motion: no egg — it is all motion (the caller does not mount it).

const HOLD_MS = 1000;
const SLOP = 8;
const MAX_CHARGE = 32;
/** The black hole held at critical mass this long swallows the page. */
const SWALLOW_MS = 5000;
/** easeInCirc (easings.net): falling in — slow at the rim, sudden at the end. */
const FALL_IN = "cubic-bezier(0.55, 0, 1, 0.45)";
/** The burst once the page is in the hole. */
const FLOOD_MS = 520;
/** Its breath in before the burst. */
const FLOOD_BREATH = 110;
/** The longest the swallowing may take: the hole is drawn this long. */
const SWALLOW_DURATION = 4400;
/** The disk seen almost edge-on, a little from above, slightly tilted. */
const TILT = -0.14;
const RATIO = 0.17;

interface Incoming {
  sx: number;
  sy: number;
  t: number;
  d: number;
  px: number;
  py: number;
  color: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: string;
  width: number;
}

/** The swallowing, shared by the canvas (which draws the hole) and the black over the page (its horizon). */
interface SwallowPlan {
  el: HTMLDivElement | null;
  /** When the last piece is in and the horizon bursts past the screen. */
  floodAt: number;
}

const unsubscribe = (): void => undefined;
const noSubscribe = () => unsubscribe;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = (list: string[]) =>
  list[Math.floor(Math.random() * list.length)] ?? "#fff";

/** The far side speaks in a book's voice: an old-style serif with Cyrillic, italic for the head. */
const serif = Cormorant_Garamond({
  preload: false,
  style: ["italic"],
  subsets: ["cyrillic", "latin"],
  weight: ["400"],
});

const HOLE = {
  dark: {
    cool: "oklch(0.66 0.19 42)",
    hot: "#fff6e6",
    warm: "oklch(0.84 0.14 72)",
  },
  light: {
    cool: "oklch(0.58 0.21 38)",
    hot: "oklch(0.9 0.1 80)",
    warm: "oklch(0.74 0.17 62)",
  },
};

const palette = (dark: boolean) =>
  dark
    ? {
        fire: [
          "oklch(0.82 0.13 250)",
          "oklch(0.86 0.13 75)",
          "oklch(0.8 0.15 15)",
          "oklch(0.85 0.13 165)",
          "#ffffff",
        ],
        stars: ["#ffffff", "#cfe0ff", "#ffe9cf"],
      }
    : {
        fire: [
          "oklch(0.58 0.21 264)",
          "oklch(0.72 0.17 60)",
          "oklch(0.63 0.21 15)",
          "oklch(0.66 0.15 160)",
          "oklch(0.6 0.18 300)",
        ],
        stars: [
          "oklch(0.55 0.2 264)",
          "oklch(0.62 0.14 235)",
          "oklch(0.7 0.13 55)",
        ],
      };

const interactive = (el: EventTarget | null) =>
  el instanceof Element &&
  Boolean(
    el.closest(
      "button, a, input, textarea, select, label, [contenteditable='true'], [role='menu'], [role='dialog'], [role='listbox'], [data-egg]"
    )
  );

/** Where a star pulled toward `p` comes from: beyond the screen's edge in direction `a`. */
const beyondEdge = (p: { x: number; y: number }, a: number) => {
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ways: number[] = [];
  if (cx > 0) {
    ways.push((w - p.x) / cx);
  }
  if (cx < 0) {
    ways.push(-p.x / cx);
  }
  if (cy > 0) {
    ways.push((h - p.y) / cy);
  }
  if (cy < 0) {
    ways.push(-p.y / cy);
  }
  const r = Math.min(...ways) + rand(60, 220);
  return { x: p.x + cx * r, y: p.y + cy * r };
};

/** The hole's burst once the page is in: a breath in, then past the screen's edges. */
const burstAt = (k: number, h: number, far: number) => {
  const breath = FLOOD_BREATH / FLOOD_MS;
  if (k < breath) {
    return {
      burst: null,
      h: h * (1 - 0.35 * Math.sin((k / breath) * (Math.PI / 2))),
      shake: { x: 0, y: 0 },
    };
  }
  const u = (k - breath) / (1 - breath);
  // easeOutExpo: almost all of it at once.
  const out = u >= 1 ? 1 : 1 - 2 ** (-10 * u);
  const from = h * 0.65;
  // Past the screen by half again: nothing of it lingers at the edge.
  const r = from + (far * 1.5 - from) * out;
  // The hole's own light is gone in the first third — the flash and the shock wave carry it.
  const fade = 1 - Math.min(1, u / 0.3) ** 2;
  // The shake moves the hole, not its canvas: moving the canvas would bare a strip at the screen's edge.
  const amp = 12 * (1 - u) ** 2;
  return {
    burst: {
      fade,
      flash: (1 - u) ** 2.2,
      shockA: 2.2 * (1 - u) ** 1.5,
      shockR: r * 0.4 + far * 0.7 * out,
    },
    h: r,
    shake: { x: rand(-amp, amp), y: rand(-amp, amp) },
  };
};

const BEYOND_CSS = `
/* Each line comes out of the dark: from a blur, a little below, slowly — this is the moment to slow down for. */
@keyframes beyond-rise { from { opacity: 0; filter: blur(8px); transform: translateY(10px); } }
@keyframes beyond-fade { from { opacity: 0; } }
.beyond-rise { animation: beyond-rise 900ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
@media (prefers-reduced-motion: reduce) { .beyond-rise { animation-name: beyond-fade; } }
.beyond-go { transition: background-color 200ms ease, border-color 200ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1); }
.beyond-go:active { transform: scale(0.97); }
.beyond-go svg { transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1); }
@media (hover: hover) and (pointer: fine) {
  .beyond-go:hover { background-color: rgb(255 255 255 / 0.1); border-color: rgb(255 255 255 / 0.4); }
  .beyond-go:hover svg { transform: translateX(3px); }
}
/* A far bright star: dim most of the time, a sparkle now and then, each at its own pace. */
@keyframes beyond-glint {
  0%, 62%, 100% { opacity: 0.25; transform: scale(0.55) rotate(0deg); }
  74% { opacity: 1; transform: scale(1.1) rotate(25deg); }
  86% { opacity: 0.45; transform: scale(0.75) rotate(40deg); }
}
.beyond-glint { position: absolute; width: 18px; height: 18px; margin: -9px; filter: drop-shadow(0 0 4px rgb(255 255 255 / 0.8)); animation: beyond-glint var(--t) ease-in-out var(--d) infinite; }
`;

/** What a piece of the page is: something one sees as one thing — a control, a line of text, a picture. */
const PIECE =
  "button, a, input, textarea, select, img, svg, [contenteditable='true'], [role='button'], h1, h2, h3, p, li, label";

interface Piece {
  el: HTMLElement | SVGElement;
  c: { x: number; y: number };
  area: number;
}

/** Whether something round the element clips it (a scroll area): a piece flying out of it would be cut at its edge. */
const clipped = (el: Element) => {
  for (
    let a = el.parentElement;
    a && a !== document.body;
    a = a.parentElement
  ) {
    const cs = getComputedStyle(a);
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
      return true;
    }
  }
  return false;
};

/**
 * A clipped piece flies as its double: an exact copy on a layer over the page, at the same place, in the same font
 * and colour, while the piece itself is hidden. Nothing round the double clips it. `undo` puts the piece back.
 */
const lift = (
  p: Piece,
  layer: HTMLElement
): { piece: Piece; undo: () => void } => {
  const { el } = p;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const copy = el.cloneNode(true);
  if (!(copy instanceof HTMLElement || copy instanceof SVGElement)) {
    return { piece: p, undo: () => null };
  }
  Object.assign(copy.style, {
    boxSizing: "border-box",
    color: cs.color,
    font: cs.font,
    height: `${r.height}px`,
    left: `${r.left}px`,
    letterSpacing: cs.letterSpacing,
    // A list item away from its list would get a bullet.
    listStyle: "none",
    margin: "0",
    pointerEvents: "none",
    position: "fixed",
    textAlign: cs.textAlign,
    top: `${r.top}px`,
    whiteSpace: cs.whiteSpace,
    width: `${r.width}px`,
  });
  layer.append(copy);
  const was = el.style.visibility;
  el.style.visibility = "hidden";
  return {
    piece: { ...p, el: copy },
    undo: () => {
      copy.remove();
      el.style.visibility = was;
    },
  };
};

/** A transform does not move an inline box: an inline piece goes with its nearest block. */
const movable = (el: Element): Element => {
  let e: Element = el;
  while (
    e.parentElement &&
    getComputedStyle(e).display === "inline" &&
    !(e instanceof SVGSVGElement)
  ) {
    e = e.parentElement;
  }
  return e;
};

const pieceOf = (el: Element): Piece | null => {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) {
    return null;
  }
  const r = el.getBoundingClientRect();
  return {
    area: r.width * r.height,
    c: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    el,
  };
};

const piecesIn = (set: Set<Element>) =>
  [...set].map(pieceOf).filter((p): p is Piece => p !== null);

/**
 * The page in pieces, for the hole to eat: the small things that read as one (a control, a picture, a line of text),
 * and the panels they sat on (anything with a background or a border, the outermost of them).
 */
const piecesOfPage = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const small = new Set<Element>();
  const panels = new Set<Element>();
  const visible = (el: Element, style: CSSStyleDeclaration) => {
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < vh &&
      r.left < vw &&
      style.visibility !== "hidden"
    );
  };
  const walk = (el: Element, inPanel: boolean) => {
    if (small.size >= 260 || el.matches("[data-egg]")) {
      return;
    }
    const style = getComputedStyle(el);
    // A `display: contents` wrapper has no box of its own: its children are what is on screen.
    if (style.display === "contents") {
      for (const child of el.children) {
        walk(child, inPanel);
      }
      return;
    }
    if (!visible(el, style)) {
      return;
    }
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    const text = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim()
    );
    if ((el.matches(PIECE) || text) && area < vw * vh * 0.2) {
      small.add(movable(el));
      return;
    }
    const painted =
      style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      style.borderTopWidth !== "0px" ||
      style.boxShadow !== "none";
    const panel = !inPanel && painted && area < vw * vh * 0.5 && area > 400;
    if (panel) {
      panels.add(el);
    }
    for (const child of el.children) {
      walk(child, inPanel || panel);
    }
  };
  for (const child of document.body.children) {
    walk(child, false);
  }
  return { panels: piecesIn(panels), small: piecesIn(small) };
};

/**
 * One piece torn off and carried in, as keyframes: a short shudder where it sits (it is being torn off), then the
 * stream takes it — round the hole by part of a turn (the stream turns, not the piece: it stays upright), in and in,
 * faster and faster, shrinking; solid till the rim, where it is gone.
 */
const SHUDDER = 0.16;
const fallFrames = (
  c: { x: number; y: number },
  at: { x: number; y: number },
  horizon: number,
  sweep: number
): Keyframe[] => {
  const r0 = Math.max(1, Math.hypot(c.x - at.x, c.y - at.y));
  const a0 = Math.atan2(c.y - at.y, c.x - at.x);
  const frames: Keyframe[] = [
    { offset: 0, opacity: 1, transform: "translate(0px, 0px) scale(1)" },
    {
      offset: SHUDDER * 0.25,
      opacity: 1,
      transform: "translate(1.5px, -1px) scale(1)",
    },
    {
      offset: SHUDDER * 0.5,
      opacity: 1,
      transform: "translate(-1.5px, 1px) scale(1.02)",
    },
    {
      offset: SHUDDER * 0.75,
      opacity: 1,
      transform: "translate(1px, 0.5px) scale(1)",
    },
  ];
  const n = 18;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const fall = t ** 2;
    const r = r0 * (1 - fall);
    const a = a0 + sweep * fall ** 1.4;
    const size = Math.max(0.04, (r / r0) ** 0.6);
    frames.push({
      offset: SHUDDER + (1 - SHUDDER) * t,
      opacity:
        r < horizon * 1.6
          ? Math.max(0, (r - horizon * 0.4) / (horizon * 1.2))
          : 1,
      transform: `translate(${at.x + Math.cos(a) * r - c.x}px, ${at.y + Math.sin(a) * r - c.y}px) scale(${size})`,
    });
  }
  return frames;
};

/** Far bright stars that sparkle now and then, placed once. */
const GLINTS = [
  { d: 0.4, t: 4.2, x: 14, y: 18 },
  { d: 2.1, t: 5.6, x: 82, y: 12 },
  { d: 1.2, t: 4.8, x: 68, y: 74 },
  { d: 3.3, t: 6.1, x: 22, y: 68 },
  { d: 0.9, t: 5.1, x: 90, y: 46 },
  { d: 2.7, t: 4.5, x: 40, y: 88 },
  { d: 1.8, t: 6.4, x: 55, y: 9 },
];
const GLINT_PATH =
  "M9 0 L10.2 7.8 L18 9 L10.2 10.2 L9 18 L7.8 10.2 L0 9 L7.8 7.8 Z";

/** By importance, not by a fixed step: the head first and slowest, the lines after it closer together, the way back
 * last — in about a second. */
const STEPS = [0, 0, 120, 300, 560, 640, 720, 0, 980];

interface RestLine {
  head: [string, string];
  lines: [string, string, string];
}

/** The page pulled into the hole piece by piece; the black over it is the horizon (sized by the canvas). */
const swallowPage = (
  at: { x: number; y: number },
  plan: SwallowPlan,
  black: HTMLDivElement | null
) => {
  const found = piecesOfPage();
  // Pieces in a scroll area (the sidebar's list) fly as their doubles, over the page, so its edge does not cut them.
  const layer = document.createElement("div");
  layer.dataset.egg = "";
  Object.assign(layer.style, {
    inset: "0",
    pointerEvents: "none",
    position: "fixed",
    zIndex: "65",
  });
  document.body.append(layer);
  const undo: (() => void)[] = [() => layer.remove()];
  /** A double → the piece it stands for: what lies on which panel is the piece's, not its double's. */
  const origin = new Map<Element, Element>();
  const small = found.small.map((p) => {
    if (!clipped(p.el)) {
      return p;
    }
    const lifted = lift(p, layer);
    undo.push(lifted.undo);
    origin.set(lifted.piece.el, p.el);
    return lifted.piece;
  });
  const { panels } = found;
  const horizon = 30;
  const distance = (p: Piece) => Math.hypot(at.x - p.c.x, at.y - p.c.y);
  const reach = Math.max(1, ...[...small, ...panels].map(distance));
  // The stream turns one way, as a tornado does.
  const turn = Math.random() < 0.5 ? -1 : 1;
  // One by one, the nearest first: a piece, a pause, the next — the pauses shorter and shorter as the hole gathers
  // strength, till it is a stream.
  let clock = 0;
  let gap = 260;
  const ends = new Map<Element, number>();
  const nearest = [...small];
  // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array; toSorted is past the ES2022 target
  nearest.sort((a, b) => distance(a) - distance(b));
  const first = nearest.map((p) => {
    const delay = clock;
    clock += gap;
    gap = Math.max(14, gap * 0.86);
    const duration = 650 + (distance(p) / reach) * 450;
    ends.set(p.el, delay + duration);
    p.el.style.transformOrigin = "center";
    p.el.style.transformBox = "fill-box";
    return p.el.animate(fallFrames(p.c, at, horizon, turn * rand(0.9, 1.5)), {
      delay,
      duration,
      easing: "linear",
      fill: "forwards",
    });
  });
  // The panels they sat on do not fly — a whole sidebar sliding off reads as a sheet, not as matter. Once all that
  // lay on one is gone, it dissolves: fades, leaning a little toward the hole, as if drawn after its contents.
  let last = Math.max(0, ...ends.values());
  const second = panels.map((p) => {
    const onIt = small
      .filter((q) => p.el.contains(origin.get(q.el) ?? q.el))
      .map((q) => ends.get(q.el) ?? 0);
    const delay = Math.max(0, Math.max(0, ...onIt) - 350);
    last = Math.max(last, delay + 700);
    p.el.style.transformOrigin = "center";
    return p.el.animate(
      [
        { opacity: 1, transform: "translate(0px, 0px) scale(1)" },
        {
          opacity: 0,
          transform: `translate(${(at.x - p.c.x) * 0.08}px, ${(at.y - p.c.y) * 0.08}px) scale(0.96)`,
        },
      ],
      { delay, duration: 700, easing: FALL_IN, fill: "forwards" }
    );
  });
  plan.el = black;
  plan.floodAt = performance.now() + last;
  return { last, runs: [...first, ...second], undo };
};

/**
 * Beyond the horizon: the page is pulled into the hole while its horizon spreads over it; then the far side's night,
 * a few lines about rest and «Новый чат». The button (or Esc) puts the page back and lets the black fade.
 */
const Beyond = ({
  at,
  onBack,
  plan,
}: {
  at: { x: number; y: number };
  onBack: () => void;
  plan: RefObject<SwallowPlan>;
}) => {
  const t = useTranslations("chat.beyond");
  const black = useRef<HTMLDivElement>(null);
  const runs = useRef<Animation[]>([]);
  /** Puts the lifted pieces back and drops their doubles. */
  const undoRef = useRef<(() => void)[]>([]);
  const go = useRef<HTMLButtonElement>(null);
  /** One of the lines about rest, a new one each time. */
  // oxlint-disable-next-line react/hook-use-state -- picked once for this visit and never changed: no setter to name
  const [rest] = useState(() => {
    const all = t.raw("rest") as RestLine[];
    return all[Math.floor(Math.random() * all.length)];
  });
  /** When the black has covered all: the far side's text rises then. */
  const [reveal, setReveal] = useState(SWALLOW_DURATION);
  useEffect(() => {
    const shared = plan.current;
    const swallowing = swallowPage(at, shared, black.current);
    runs.current = swallowing.runs;
    undoRef.current = swallowing.undo;
    setReveal(swallowing.last + FLOOD_MS + 150);
    return () => {
      for (const r of runs.current) {
        r.cancel();
      }
      for (const u of undoRef.current) {
        u();
      }
      undoRef.current = [];
      shared.el = null;
      shared.floodAt = 0;
    };
  }, [at, plan]);
  // Beyond the horizon the keyboard lives here: the page under the black is inert, the way back takes the focus once
  // it shows, and Esc goes back too.
  useEffect(() => {
    const page = [...document.body.children].filter(
      (el) => !el.matches("[data-egg]") && !el.querySelector("[data-egg]")
    );
    for (const el of page) {
      el.setAttribute("inert", "");
    }
    const focus = window.setTimeout(
      () => go.current?.focus({ preventScroll: true }),
      reveal + 980
    );
    return () => {
      clearTimeout(focus);
      for (const el of page) {
        el.removeAttribute("inert");
      }
    };
  }, [reveal]);
  const back = () => {
    // The page returns at once under the black, and the black fades off it.
    for (const r of runs.current) {
      r.cancel();
    }
    runs.current = [];
    for (const u of undoRef.current) {
      u();
    }
    undoRef.current = [];
    const fade = black.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 320,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      fill: "forwards",
    });
    if (fade) {
      fade.addEventListener("finish", onBack);
    } else {
      onBack();
    }
  };
  const onEscape = useEffectEvent(back);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscape();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const late = (i: number) => ({
    animationDelay: `${reveal + (STEPS[i] ?? 0)}ms`,
  });
  return (
    <div
      className="fixed inset-0 z-[70] bg-black text-white"
      data-egg=""
      ref={black}
      style={{ clipPath: `circle(0px at ${at.x}px ${at.y}px)` }}
    >
      <style>{SKY_CSS + BEYOND_CSS}</style>
      <div className="absolute inset-0">
        <Sky shooting={2} tone="night" />
      </div>
      {GLINTS.map((g) => (
        <svg
          aria-hidden
          className="beyond-glint"
          key={`${g.x}-${g.y}`}
          style={
            {
              "--d": `${g.d}s`,
              "--t": `${g.t}s`,
              left: `${g.x}%`,
              top: `${g.y}%`,
            } as CSSProperties
          }
          viewBox="0 0 18 18"
        >
          <path d={GLINT_PATH} fill="#fff" />
        </svg>
      ))}
      {rest && (
        <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
          <p
            className="beyond-rise text-[11px] font-medium tracking-[0.32em] text-white/55 uppercase"
            style={late(1)}
          >
            {t("eyebrow")}
          </p>
          <h2
            className={`${serif.className} mt-6 text-5xl leading-[1.05] font-normal tracking-tight text-balance italic sm:text-6xl`}
          >
            <span className="beyond-rise block" style={late(2)}>
              {rest.head[0]}
            </span>
            <span className="beyond-rise block text-white/85" style={late(3)}>
              {rest.head[1]}
            </span>
          </h2>
          {/* The head is the book's voice; the lines under it are in the interface's own face — they have to be read. */}
          <div className="mt-8 flex max-w-xl flex-col gap-1.5 text-[17px] leading-relaxed text-white/75">
            {rest.lines.map((line, i) => (
              <p
                className="beyond-rise text-balance"
                key={line}
                style={late(4 + i)}
              >
                {line}
              </p>
            ))}
          </div>
          <div className="beyond-rise mt-12" style={late(8)}>
            <button
              className="beyond-go inline-flex h-11 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 text-sm text-white/90 backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              onClick={back}
              ref={go}
              type="button"
            >
              {t("back")}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** The egg itself: its two canvases over the page, and the far side once the page is swallowed. */
const Egg = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The hole's own canvas: WebGL, over the stars' one, so a star falling in goes into its shadow. */
  const glRef = useRef<HTMLCanvasElement>(null);
  const [swallowed, setSwallowed] = useState<{ x: number; y: number } | null>(
    null
  );
  const planRef = useRef<SwallowPlan>({ el: null, floodAt: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const glCanvas = glRef.current;
    if (!canvas || !ctx || !glCanvas) {
      return;
    }
    let dpr = 1;
    const hole = createHoleRenderer(glCanvas);
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      hole?.size();
    };
    size();
    window.addEventListener("resize", size);

    /** The burst's shake this frame: the horizon (the black over the page) follows the hole by it. */
    let lastShake = { x: 0, y: 0 };
    let holeDrawn = false;
    let colors = palette(false);
    let holeColors = HOLE.light;
    /** The horizon's drawn radius, eased to the charge. */
    let holeR = 0;
    /** When the hole began to swallow the page: it stays drawn, eating and growing, till the black covers it. */
    let swallowAt = 0;
    let held: { x: number; y: number; id: number } | null = null;
    let armed = false;
    let charge = 0;
    let flash = 0;
    let lastSpawn = 0;
    let fullAt = 0;
    const pointer = { x: 0, y: 0 };
    let incoming: Incoming[] = [];
    let sparks: Spark[] = [];
    let timer = 0;
    let raf = 0;
    let last = 0;

    const drawIncoming = (dt: number, now: number) => {
      // One every ~80ms, from beyond the screen's edge: never born in view.
      if (armed && now - lastSpawn > 80) {
        lastSpawn = now;
        const from = beyondEdge(pointer, rand(0, Math.PI * 2));
        incoming.push({
          color: pick(colors.stars),
          d: rand(0.55, 0.95),
          px: from.x,
          py: from.y,
          sx: from.x,
          sy: from.y,
          t: 0,
        });
      }
      const still: Incoming[] = [];
      for (const s of incoming) {
        s.t += dt / s.d;
        // Pulled in: slow far out, fast near the hole (easeInCubic), turning round it the more the closer.
        const k = Math.min(1, s.t) ** 3;
        const r0 = Math.hypot(s.sx - pointer.x, s.sy - pointer.y);
        const a = Math.atan2(s.sy - pointer.y, s.sx - pointer.x) + 2.4 * k * k;
        const x = pointer.x + Math.cos(a) * r0 * (1 - k);
        const y = pointer.y + Math.sin(a) * r0 * (1 - k);
        const len = Math.min(140, 8 + Math.hypot(x - s.px, y - s.py) * 5);
        const ang = Math.atan2(y - s.py, x - s.px);
        const tx = x - Math.cos(ang) * len;
        const ty = y - Math.sin(ang) * len;
        const g = ctx.createLinearGradient(tx, ty, x, y);
        g.addColorStop(0, "transparent");
        g.addColorStop(1, s.color);
        ctx.globalAlpha = Math.min(1, s.t * 4) * 0.85;
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        s.px = x;
        s.py = y;
        if (s.t >= 1) {
          charge = Math.min(MAX_CHARGE, charge + 1);
          flash = 1;
        } else {
          still.push(s);
        }
      }
      incoming = still;
    };

    /** Draws the hole; returns its shadow's radius as drawn. At critical mass it spins up and burns brighter. */
    const drawHole = (dt: number, now: number) => {
      const unstable = fullAt ? Math.min(1, (now - fullAt) / SWALLOW_MS) : 0;
      const eating = swallowAt
        ? Math.min(1, (now - swallowAt) / SWALLOW_DURATION)
        : 0;
      holeR +=
        (5 + charge * 0.42 + unstable * 8 + eating * 14 - holeR) *
        Math.min(1, dt * 6);
      let h = holeR;
      let burst: ReturnType<typeof burstAt>["burst"] = null;
      let shake = { x: 0, y: 0 };
      const plan = planRef.current;
      if (swallowAt && plan.floodAt && now > plan.floodAt) {
        const far =
          Math.hypot(
            Math.max(pointer.x, window.innerWidth - pointer.x),
            Math.max(pointer.y, window.innerHeight - pointer.y)
          ) + 20;
        ({ burst, h, shake } = burstAt(
          Math.min(1, (now - plan.floodAt) / FLOOD_MS),
          h,
          far
        ));
      }
      const spin = fullAt
        ? 1.6 + unstable * 2.6
        : 1 + (charge / MAX_CHARGE) * 0.6;
      const glow =
        (0.85 + (charge / MAX_CHARGE) * 0.25 + unstable * 0.35 + flash * 0.15) *
        (1 + (burst?.flash ?? 0) * 2.5);
      if (hole) {
        hole.draw({
          ...burst,
          glow,
          r: h,
          spin,
          t: now / 1000,
          x: pointer.x + shake.x,
          y: pointer.y + shake.y,
        });
        holeDrawn = true;
      } else {
        // No WebGL: the shadow at least.
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, h, 0, Math.PI * 2);
        ctx.fill();
      }
      lastShake = shake;
      return h;
    };

    const drawSparks = (dt: number) => {
      const alive: Spark[] = [];
      for (const s of sparks) {
        s.age += dt;
        const ox = s.x;
        const oy = s.y;
        const drag = Math.exp(-1.8 * dt);
        s.vx *= drag;
        s.vy = s.vy * drag + 320 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const fade = 1 - s.age / s.life;
        // A spark twinkles as it dies.
        ctx.globalAlpha =
          Math.max(0, fade) * (fade < 0.35 && Math.random() < 0.3 ? 0.3 : 1);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(ox - s.vx * dt * 2.5, oy - s.vy * dt * 2.5);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        if (s.age < s.life) {
          alive.push(s);
        }
      }
      sparks = alive;
    };

    /** It takes the page: the egg stops here, the swallowing is Beyond's. */
    const swallow = (now: number) => {
      armed = false;
      held = null;
      document.body.style.userSelect = "";
      incoming = [];
      swallowAt = now;
      planRef.current.floodAt = 0;
      // The hole's disk is drawn over its horizon (the black over the page).
      canvas.style.zIndex = "75";
      glCanvas.style.zIndex = "76";
      setSwallowed({ x: pointer.x, y: pointer.y });
    };

    /** While the page goes in: the black over it is the horizon, the same radius, this frame; then it is all. */
    const drawSwallowing = (dt: number, now: number) => {
      const plan = planRef.current;
      const done = plan.floodAt
        ? now > plan.floodAt + FLOOD_MS + 120
        : now - swallowAt > SWALLOW_DURATION;
      if (!done) {
        const h = drawHole(dt, now);
        if (plan.el) {
          plan.el.style.clipPath = `circle(${h}px at ${pointer.x + lastShake.x}px ${pointer.y + lastShake.y}px)`;
        }
        return;
      }
      swallowAt = 0;
      holeR = 0;
      fullAt = 0;
      canvas.style.zIndex = "";
      glCanvas.style.zIndex = "";
      hole?.clear();
      if (plan.el) {
        plan.el.style.clipPath = "none";
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.lineCap = "round";
      holeDrawn = false;
      drawIncoming(dt, now);
      if (armed) {
        flash = Math.max(0, flash - dt * 6);
        if (charge >= MAX_CHARGE && !fullAt) {
          fullAt = now;
        }
        if (fullAt && now - fullAt > SWALLOW_MS) {
          swallow(now);
        }
        drawHole(dt, now);
      }
      drawSparks(dt);
      ctx.globalAlpha = 1;
      if (!armed && swallowAt) {
        drawSwallowing(dt, now);
      }
      if (!holeDrawn) {
        hole?.clear();
      }
      if (armed || swallowAt || incoming.length > 0 || sparks.length > 0) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
        last = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    const run = () => {
      if (!raf) {
        raf = requestAnimationFrame(loop);
      }
    };

    const spark = (
      x: number,
      y: number,
      a: number,
      v: number,
      color: string,
      life: number,
      width: number
    ) =>
      sparks.push({
        age: 0,
        color,
        life,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        width,
        x,
        y,
      });

    /** Let go: a firework from that spot, and the disk's matter flung off along it, round the way it turned. */
    const burst = (x: number, y: number) => {
      const power = 1 + charge / 22;
      const count = Math.round(36 + charge * 2.2);
      for (let i = 0; i < count; i += 1) {
        spark(
          x,
          y,
          rand(0, Math.PI * 2),
          rand(140, 420) * power,
          pick(colors.fire),
          rand(0.9, 1.7),
          rand(1.2, 2.4)
        );
      }
      for (let i = 0; i < 30; i += 1) {
        const a = rand(0, Math.PI * 2);
        const m = rand(1.6, 3.2);
        const px = Math.cos(a) * holeR * m;
        const py = Math.sin(a) * holeR * m * RATIO;
        const rx = px * Math.cos(TILT) - py * Math.sin(TILT);
        const ry = px * Math.sin(TILT) + py * Math.cos(TILT);
        const color = pick([holeColors.hot, holeColors.warm, holeColors.cool]);
        spark(
          x + rx,
          y + ry,
          Math.atan2(ry, rx) + Math.PI / 2,
          rand(320, 560) * power,
          color,
          rand(0.6, 1.1),
          1.8
        );
      }
      holeR = 0;
      run();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || swallowAt || interactive(e.target)) {
        return;
      }
      const dark = document.documentElement.classList.contains("dark");
      colors = palette(dark);
      holeColors = dark ? HOLE.dark : HOLE.light;
      held = { id: e.pointerId, x: e.clientX, y: e.clientY };
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!held) {
          return;
        }
        armed = true;
        charge = 0;
        fullAt = 0;
        holeR = 0;
        // No selection or drag while the egg runs.
        document.body.style.userSelect = "none";
        window.getSelection()?.removeAllRanges();
        run();
      }, HOLD_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (!held || e.pointerId !== held.id) {
        return;
      }
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!armed && Math.hypot(e.clientX - held.x, e.clientY - held.y) > SLOP) {
        held = null;
        clearTimeout(timer);
      }
    };
    const onUp = (e: PointerEvent) => {
      // After the swallowing `held` is gone: the release does nothing.
      if (!held || e.pointerId !== held.id) {
        return;
      }
      held = null;
      clearTimeout(timer);
      if (!armed) {
        return;
      }
      armed = false;
      document.body.style.userSelect = "";
      incoming = [];
      burst(pointer.x, pointer.y);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      document.body.style.userSelect = "";
      window.removeEventListener("resize", size);
      hole?.clear();
      hole?.dispose();
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <>
      <canvas
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[60] size-full"
        data-egg=""
        ref={canvasRef}
      />
      <canvas
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[61] size-full"
        data-egg=""
        ref={glRef}
      />
      {swallowed && (
        <Beyond
          at={swallowed}
          onBack={() => setSwallowed(null)}
          plan={planRef}
        />
      )}
    </>
  );
};

/** Drawn in the browser only, over everything: a canvas in a portal, so the sparks fly over the text. */
export const BlackHole = () => {
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  return mounted ? createPortal(<Egg />, document.body) : null;
};
