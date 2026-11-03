"use client";

import { ArrowRight } from "lucide-react";
import { Cormorant_Garamond } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useCalm, useCharge } from "./backdrop";
import type { Charge } from "./backdrop";
import { Sky, SKY_CSS } from "./bg-stars";
import type { SkyRules } from "./bg-stars";
import { createHoleRenderer } from "./hole-gl";
import { useBeyondLabels, usePick, useRestLines } from "./phrases";

// The easter egg of the star sky: hold the pointer down on an empty spot. After a second stars come flying into it
// from all around, faster as they near (pulled in), and what they bring gathers under the pointer — the «заряд» knob
// picks how:
//   «Звезда»     — one four-point star, the same glint the meteors carry: every star caught makes its rays longer and
//                  grows short diagonal ones between them;
//   «Созвездие»  — every star caught stays as a point near the pointer, joined by a thin line to its nearest one, so a
//                  constellation builds up;
//   «Вихрь»      — the caught stars circle the pointer round a small core;
//   «Сгусток»    — a living blob of plasma: a crisp edge that breathes (a few waves of their own pace run round it),
//                  currents turning inside, a dent where each star hits and a short crackle off the surface now and
//                  then; it grows with the charge;
//   «Чёрная дыра» — an event horizon with a tilted accretion disk turning round it, brighter on the side coming at
//                  us, its far half bent over and under the horizon by the light; stars spiral in instead of flying
//                  straight; it grows with the charge. Held at critical mass for five seconds it grows unstable —
//                  then swallows the page: piece by piece — the nearest first — every text, button and picture of
//                  it is torn off, stretched toward the hole, spun and pulled in; the hole stays in view eating and
//                  growing — the black over the page is its horizon, frame by frame, the disk drawn over it — and
//                  once the page is in, the horizon swells past the screen's edges with its disk: we fall in. Inside
//                  there is a line of text and «Новый чат», which brings the page back.
// At critical mass it throbs like a heart. Let go — what gathered is thrown into a firework from that spot: sparks fly
// out, slow in the air, fall and fade; the more charge, the more sparks and the wider. Moving more than a few px
// before the second is up means a selection or a drag: no egg. Over everything (a canvas in a portal), so the sparks
// fly over the text. Reduced motion: no egg — it is all motion.

const HOLD_MS = 1000;
const SLOP = 8;
const MAX_CHARGE = 32;
/** At full charge it throbs: a beat this long, a sharp push and a soft fall. */
const BEAT_MS = 600;
/** The black hole held at critical mass this long swallows the page. */
const SWALLOW_MS = 5000;
/** easeInCirc (easings.net): falling in — slow at the rim, sudden at the end. */
const FALL_IN = "cubic-bezier(0.55, 0, 1, 0.45)";
/** The black's flood once the page is in the hole. */
const FLOOD_MS = 520;
/** Its breath in before the burst. */
const FLOOD_BREATH = 110;
/** The longest the swallowing may take: the hole is drawn this long. */
const SWALLOW_DURATION = 4400;

interface Incoming {
  sx: number;
  sy: number;
  t: number;
  d: number;
  px: number;
  py: number;
  color: string;
}

/** A caught star, kept relative to the pointer: an orbit (swirl) or a fixed place (constellation). */
interface Caught {
  a: number;
  r: number;
  goal: number;
  w: number;
  color: string;
  /** When it was caught: it pops in. */
  at: number;
  /** The point it is joined to (constellation). */
  link: number;
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

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)] as T;

/** The far side speaks in a book's voice: an old-style serif with Cyrillic, italic for the head. */
const serif = Cormorant_Garamond({ style: ["italic", "normal"], subsets: ["cyrillic", "latin"], weight: ["400", "500"] });

const HOLE = {
  // `clear` ends the gradients: the canvas fades to «transparent» through grey, so it fades to a clear warm instead.
  dark: { clear: "oklch(0.66 0.19 42 / 0)", hot: "#fff6e6", warm: "oklch(0.84 0.14 72)", cool: "oklch(0.66 0.19 42)" },
  light: { clear: "oklch(0.58 0.21 38 / 0)", hot: "oklch(0.9 0.1 80)", warm: "oklch(0.74 0.17 62)", cool: "oklch(0.58 0.21 38)" },
};
/** The disk seen almost edge-on, a little from above, slightly tilted. */
const TILT = -0.14;
const RATIO = 0.17;

const ORB = {
  dark: { edge: "oklch(0.72 0.15 252)", inner: "#ffffff", mid: "oklch(0.86 0.09 250)" },
  light: { edge: "oklch(0.5 0.21 264)", inner: "oklch(0.93 0.05 250)", mid: "oklch(0.64 0.19 262)" },
};

const palette = (dark: boolean) =>
  dark
    ? { core: "#ffffff", fire: ["oklch(0.82 0.13 250)", "oklch(0.86 0.13 75)", "oklch(0.8 0.15 15)", "oklch(0.85 0.13 165)", "#ffffff"], stars: ["#ffffff", "#cfe0ff", "#ffe9cf"] }
    : { core: "oklch(0.55 0.2 264)", fire: ["oklch(0.58 0.21 264)", "oklch(0.72 0.17 60)", "oklch(0.63 0.21 15)", "oklch(0.66 0.15 160)", "oklch(0.6 0.18 300)"], stars: ["oklch(0.55 0.2 264)", "oklch(0.62 0.14 235)", "oklch(0.7 0.13 55)"] };

const interactive = (el: EventTarget | null) =>
  el instanceof Element && Boolean(el.closest("button, a, input, textarea, select, label, [contenteditable='true'], [role='menu'], [role='dialog'], [role='listbox'], .proto-picker"));

/** A star: four rays of `long`, four of `short` between them, waist `w`; centred at 0,0. */
const starPath = (ctx: CanvasRenderingContext2D, long: number, short: number, w: number) => {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const len = i % 2 === 0 ? long : short;
    const b = a + Math.PI / 8;
    if (i === 0) ctx.moveTo(Math.cos(a) * len, Math.sin(a) * len);
    else ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.lineTo(Math.cos(b) * w, Math.sin(b) * w);
  }
  ctx.closePath();
};

export const HoldEgg = () => {
  const calm = useCalm();
  const mode: Charge = useCharge();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The black hole's own canvas: WebGL, over the stars' one, so a star falling in goes into its shadow. */
  const glRef = useRef<HTMLCanvasElement>(null);
  const [swallowed, setSwallowed] = useState<{ x: number; y: number } | null>(null);
  const swallowRef = useRef<((x: number, y: number) => void) | null>(null);
  /** The swallowing, shared by the canvas (which draws the hole) and the black over the page (its horizon). */
  const planRef = useRef<SwallowPlan>({ el: null, floodAt: 0 });
  swallowRef.current = (x, y) => setSwallowed({ x, y });
  useEffect(() => setHost(document.body), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (calm || !canvas || !ctx) return;
    let dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    size();
    window.addEventListener("resize", size);
    const sizeHole = () => hole?.size();
    window.addEventListener("resize", sizeHole);

    const glCanvas = glRef.current;
    const hole = mode === "hole" && glCanvas ? createHoleRenderer(glCanvas) : null;
    /** The burst's shake this frame: the horizon (the black over the page) follows the hole by it. */
    let lastShake = { x: 0, y: 0 };
    /** Whether the hole was drawn this frame: if not, its canvas is cleared. */
    let holeDrawn = false;
    let colors = palette(false);
    let orbColors = ORB.light;
    let holeColors = HOLE.light;
    /** «Чёрная дыра»: its horizon's drawn radius, eased to the charge. */
    let holeR = 0;
    /** When the hole began to swallow the page: it stays drawn, eating and growing, till the black covers it. */
    let swallowAt = 0;
    /** «Сгусток»: its drawn radius (eases to the charge), dents where stars hit, crackles off its surface. */
    let orbR = 0;
    let dents: { a: number; at: number }[] = [];
    let crackles: { pts: [number, number][]; at: number }[] = [];
    let nextCrackle = 0;
    let held: { x: number; y: number; id: number } | null = null;
    let armed = false;
    let charge = 0;
    let flash = 0;
    let lastSpawn = 0;
    let fullAt = 0;
    const pointer = { x: 0, y: 0 };
    let incoming: Incoming[] = [];
    let caught: Caught[] = [];
    let sparks: Spark[] = [];
    let timer = 0;
    let raf = 0;
    let last = 0;

    /** The heartbeat at critical mass: 0…1, a sharp push and a soft fall. */
    const beatAt = (now: number) => (fullAt ? (1 - ((now - fullAt) % BEAT_MS) / BEAT_MS) ** 3 : 0);

    const catchOne = (s: Incoming, now: number) => {
      charge = Math.min(MAX_CHARGE, charge + 1);
      flash = 1;
      if (caught.length >= 28) return;
      const from = Math.atan2(s.sy - pointer.y, s.sx - pointer.x);
      if (mode === "constellation") {
        // A place near the pointer on the side it came from, joined to its nearest point.
        const r = rand(10, 18 + caught.length * 1.4);
        const a = from + rand(-0.6, 0.6);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        let link = -1;
        let best = Number.POSITIVE_INFINITY;
        caught.forEach((c, i) => {
          const d = Math.hypot(Math.cos(c.a) * c.r - x, Math.sin(c.a) * c.r - y);
          if (d < best) {
            best = d;
            link = i;
          }
        });
        caught.push({ a, at: now, color: s.color, goal: r, link, r, w: 0 });
      } else if (mode === "orb") {
        dents.push({ a: from, at: now });
        if (Math.random() < 0.45) crackle(from, now);
      } else if (mode === "swirl") {
        caught.push({ a: from, at: now, color: s.color, goal: rand(6, 12 + charge * 0.5), link: -1, r: 2, w: rand(3.2, 6.5) });
      }
    };

    /** A jagged spark off the blob's surface at angle `a`: a few kinked segments, gone in a blink. */
    function crackle(a: number, now: number) {
      const pts: [number, number][] = [];
      let r = orbR * 0.95;
      let ang = a;
      for (let i = 0; i < 5; i++) {
        pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
        r += rand(3, 6);
        ang += rand(-0.22, 0.22);
      }
      crackles.push({ at: now, pts });
    }

    const drawIncoming = (dt: number, now: number) => {
      // One every ~80ms, from beyond the screen's edge in some direction from the pointer: never born in view.
      if (armed && now - lastSpawn > 80) {
        lastSpawn = now;
        const a = rand(0, Math.PI * 2);
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        const W = window.innerWidth;
        const H = window.innerHeight;
        const out = Math.min(cx > 0 ? (W - pointer.x) / cx : cx < 0 ? -pointer.x / cx : Infinity, cy > 0 ? (H - pointer.y) / cy : cy < 0 ? -pointer.y / cy : Infinity);
        const r = out + rand(60, 220);
        const sx = pointer.x + Math.cos(a) * r;
        const sy = pointer.y + Math.sin(a) * r;
        incoming.push({ color: pick(colors.stars), d: rand(0.55, 0.95), px: sx, py: sy, sx, sy, t: 0 });
      }
      incoming = incoming.filter((s) => {
        s.t += dt / s.d;
        // Pulled in: slow far out, fast near the pointer (easeInCubic).
        const k = Math.min(1, s.t) ** 3;
        let x = s.sx + (pointer.x - s.sx) * k;
        let y = s.sy + (pointer.y - s.sy) * k;
        if (mode === "hole") {
          // Spiralling in: the closer, the more it turns round the hole.
          const r0 = Math.hypot(s.sx - pointer.x, s.sy - pointer.y);
          const a = Math.atan2(s.sy - pointer.y, s.sx - pointer.x) + 2.4 * k * k;
          x = pointer.x + Math.cos(a) * r0 * (1 - k);
          y = pointer.y + Math.sin(a) * r0 * (1 - k);
        }
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
          catchOne(s, now);
          return false;
        }
        return true;
      });
    };

    const glowing = (blur: number, draw: () => void) => {
      ctx.shadowColor = colors.core;
      ctx.shadowBlur = blur;
      draw();
      ctx.shadowBlur = 0;
    };

    // «Звезда»: one star under the pointer; rays grow with the charge, diagonals sprout from a quarter of it.
    const drawStar = (now: number, beat: number) => {
      const k = charge / MAX_CHARGE;
      const twinkle = fullAt ? 0.82 + 0.18 * Math.sin(now / 55) : 1;
      const long = (5 + k * 30 + flash * 4) * (1 + beat * 0.3) * twinkle;
      const short = Math.max(0, k - 0.25) * 22 * (1 + beat * 0.4) * (fullAt ? 2 - twinkle : 1);
      ctx.save();
      ctx.translate(pointer.x, pointer.y);
      ctx.rotate(fullAt ? (now - fullAt) / 1800 : 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.core;
      glowing(8 + beat * 14 + flash * 6, () => {
        starPath(ctx, long, Math.max(short, 1.5), 1.4 + k * 1.2);
        ctx.fill();
      });
      ctx.restore();
    };

    // «Созвездие»: the caught stars as points, each joined to its nearest earlier one.
    const drawConstellation = (now: number, beat: number) => {
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.core;
      for (const c of caught) {
        if (c.link < 0) continue;
        const o = caught[c.link];
        if (!o) continue;
        const grow = Math.min(1, (now - c.at) / 220);
        const ax = pointer.x + Math.cos(o.a) * o.r;
        const ay = pointer.y + Math.sin(o.a) * o.r;
        const bx = pointer.x + Math.cos(c.a) * c.r;
        const by = pointer.y + Math.sin(c.a) * c.r;
        ctx.globalAlpha = 0.32 + beat * 0.45;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        // The line draws from the old point to the new one.
        ctx.lineTo(ax + (bx - ax) * grow, ay + (by - ay) * grow);
        ctx.stroke();
      }
      for (const c of caught) {
        const pop = Math.min(1, (now - c.at) / 200);
        const r = (1.2 + (1 - pop) * 2.2 + beat * 0.8) * (0.85 + 0.15 * Math.sin(now / 140 + c.a * 7));
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = c.color;
        glowing(5 + beat * 8, () => {
          ctx.beginPath();
          ctx.arc(pointer.x + Math.cos(c.a) * c.r, pointer.y + Math.sin(c.a) * c.r, r, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    };

    // «Вихрь»: the caught stars on orbits round a small core.
    const drawSwirl = (dt: number, beat: number) => {
      for (const c of caught) {
        c.a += c.w * dt * (fullAt ? 1.6 : 1);
        c.r += (c.goal - c.r) * Math.min(1, dt * 6);
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, c.r, c.a - 0.5, c.a);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.core;
      glowing(10 + beat * 16 + flash * 6, () => {
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 2.4 + charge * 0.06 + flash * 1.2 + beat * 2.4, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    // «Сгусток»: the breathing edge (three waves of their own pace), dents fading where stars hit, a gradient lit
    // from inside, currents turning in it, crackles off it.
    const orbEdge = (a: number, now: number, beat: number, wild: number) => {
      const t = now / 1000;
      let r = orbR * (1 + wild * (0.07 * Math.sin(3 * a + t * 2.1) + 0.05 * Math.sin(5 * a - t * 3.3) + 0.03 * Math.sin(7 * a + t * 4.7))) * (1 + beat * 0.2);
      for (const d of dents) {
        const age = (now - d.at) / 1000;
        let da = Math.abs(a - d.a) % (Math.PI * 2);
        if (da > Math.PI) da = Math.PI * 2 - da;
        r -= 3.5 * Math.exp(-age * 5) * Math.exp(-(da * da) / 0.12);
      }
      return r;
    };
    const drawOrb = (dt: number, now: number, beat: number) => {
      orbR += (5 + charge * 0.5 - orbR) * Math.min(1, dt * 8);
      dents = dents.filter((d) => now - d.at < 900);
      const wild = fullAt ? 1.8 : 1;
      const n = 72;
      ctx.save();
      ctx.translate(pointer.x, pointer.y);
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = orbEdge(a, now, beat, wild);
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(-orbR * 0.2, -orbR * 0.25, 0, 0, 0, orbR * 1.25);
      g.addColorStop(0, orbColors.inner);
      g.addColorStop(0.5, orbColors.mid);
      g.addColorStop(1, orbColors.edge);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = g;
      ctx.shadowColor = orbColors.mid;
      ctx.shadowBlur = 12 + beat * 18 + flash * 6;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Currents inside: a few thin arcs turning at their own pace, clipped to the blob.
      ctx.clip();
      ctx.strokeStyle = orbColors.inner;
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const turn = (now / 1000) * (1.3 + i * 0.7) * (i % 2 ? -1 : 1) * (fullAt ? 1.7 : 1);
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, orbR * (0.35 + i * 0.2), turn, turn + 1.6 + i * 0.4);
        ctx.stroke();
      }
      ctx.restore();
      // Crackles: on hits, and on their own at critical mass.
      if (fullAt && now > nextCrackle) {
        crackle(rand(0, Math.PI * 2), now);
        nextCrackle = now + rand(90, 220);
      }
      crackles = crackles.filter((c) => now - c.at < 140);
      ctx.strokeStyle = orbColors.inner;
      ctx.lineWidth = 1.2;
      for (const c of crackles) {
        ctx.globalAlpha = 1 - (now - c.at) / 140;
        ctx.beginPath();
        c.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(pointer.x + x, pointer.y + y) : ctx.lineTo(pointer.x + x, pointer.y + y)));
        ctx.stroke();
      }
    };

    /** Draws the hole (the shader); returns its shadow's radius as drawn. No throbbing: at critical mass it only
     * spins up and burns brighter, steadily, till it swallows the page. */
    const drawHole = (dt: number, now: number) => {
      const unstable = fullAt ? Math.min(1, (now - fullAt) / SWALLOW_MS) : 0;
      const eating = swallowAt ? Math.min(1, (now - swallowAt) / SWALLOW_DURATION) : 0;
      holeR += (5 + charge * 0.42 + unstable * 8 + eating * 14 - holeR) * Math.min(1, dt * 6);
      let H = holeR;
      // The page is in: a breath in, then the burst past the screen's edges — almost all of it at once (easeOutExpo),
      // with a white flash, a shock wave ahead of the horizon and the screen shaking.
      let burst: { fade: number; flash: number; shockA: number; shockR: number } | null = null;
      let shake = { x: 0, y: 0 };
      const plan = planRef.current;
      if (swallowAt && plan.floodAt && now > plan.floodAt) {
        const k = Math.min(1, (now - plan.floodAt) / FLOOD_MS);
        const far = Math.hypot(Math.max(pointer.x, window.innerWidth - pointer.x), Math.max(pointer.y, window.innerHeight - pointer.y)) + 20;
        const breath = FLOOD_BREATH / FLOOD_MS;
        if (k < breath) {
          H *= 1 - 0.35 * Math.sin((k / breath) * (Math.PI / 2));
        } else {
          const u = (k - breath) / (1 - breath);
          const out = u >= 1 ? 1 : 1 - 2 ** (-10 * u);
          const from = H * 0.65;
          // Past the screen by half again: nothing of it lingers at the edge.
          H = from + (far * 1.5 - from) * out;
          // The hole's own light is gone in the first third of the burst — the flash and the shock wave carry it.
          const fade = 1 - Math.min(1, u / 0.3) ** 2;
          burst = { fade, flash: (1 - u) ** 2.2, shockA: 2.2 * (1 - u) ** 1.5, shockR: H * 0.4 + far * 0.7 * out };
          // The shake moves the hole, not its canvas: moving the canvas would bare a strip at the screen's edge.
          const amp = 12 * (1 - u) ** 2;
          shake = { x: rand(-amp, amp), y: rand(-amp, amp) };
        }
      }
      const spin = fullAt ? 1.6 + unstable * 2.6 : 1 + (charge / MAX_CHARGE) * 0.6;
      const glow = (0.85 + (charge / MAX_CHARGE) * 0.25 + unstable * 0.35 + flash * 0.15) * (1 + (burst?.flash ?? 0) * 2.5);
      if (hole) {
        hole.draw({ ...burst, glow, r: H, spin, t: now / 1000, x: pointer.x + shake.x, y: pointer.y + shake.y });
        holeDrawn = true;
      } else {
        // No WebGL: the shadow at least.
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, H, 0, Math.PI * 2);
        ctx.fill();
      }
      lastShake = shake;
      return H;
    };

    const drawSparks = (dt: number) => {
      sparks = sparks.filter((s) => {
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
        ctx.globalAlpha = Math.max(0, fade) * (fade < 0.35 && Math.random() < 0.3 ? 0.3 : 1);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(ox - s.vx * dt * 2.5, oy - s.vy * dt * 2.5);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        return s.age < s.life;
      });
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
        if (charge >= MAX_CHARGE) fullAt ||= now;
        if (mode === "hole" && fullAt && now - fullAt > SWALLOW_MS) {
          // It takes the page: the egg stops here, the swallowing is the component's.
          armed = false;
          held = null;
          document.body.style.userSelect = "";
          incoming = [];
          caught = [];
          swallowAt = now;
          planRef.current.floodAt = 0;
          // The hole's disk is drawn over its horizon (the black over the page).
          canvas.style.zIndex = "75";
          if (glCanvas) glCanvas.style.zIndex = "76";
          swallowRef.current?.(pointer.x, pointer.y);
        }
        const beat = beatAt(now);
        if (mode === "star") drawStar(now, beat);
        else if (mode === "constellation") drawConstellation(now, beat);
        else if (mode === "orb") drawOrb(dt, now, beat);
        else if (mode === "hole") drawHole(dt, now);
        else drawSwirl(dt, beat);
      }
      drawSparks(dt);
      ctx.globalAlpha = 1;
      if (!armed && swallowAt) {
        const plan = planRef.current;
        const done = plan.floodAt ? now > plan.floodAt + FLOOD_MS + 120 : now - swallowAt > SWALLOW_DURATION;
        if (done) {
          swallowAt = 0;
          holeR = 0;
          fullAt = 0;
          canvas.style.zIndex = "";
          if (glCanvas) glCanvas.style.zIndex = "";
          hole?.clear();
          if (plan.el) plan.el.style.clipPath = "none";
        } else {
          // The black over the page is the horizon: the same radius, this frame.
          const H = drawHole(dt, now);
          if (plan.el) plan.el.style.clipPath = `circle(${H}px at ${pointer.x + lastShake.x}px ${pointer.y + lastShake.y}px)`;
        }
      }
      if (!holeDrawn) hole?.clear();
      if (armed || swallowAt || incoming.length || sparks.length) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
        last = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    const run = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const spark = (x: number, y: number, a: number, v: number, color: string, life = rand(0.9, 1.7), width = rand(1.2, 2.4)) =>
      sparks.push({ age: 0, color, life, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, width, x, y });

    const burst = (x: number, y: number) => {
      const power = 1 + charge / 22;
      const count = Math.round(36 + charge * 2.2);
      for (let i = 0; i < count; i++) spark(x, y, rand(0, Math.PI * 2), rand(140, 420) * power, pick(colors.fire));
      // What gathered goes with it: the star's rays as a cross of fast sparks, the constellation's points from their
      // places, the swirl off its orbits.
      if (mode === "star") {
        const turn = fullAt ? (performance.now() - fullAt) / 1800 : 0;
        for (let r = 0; r < 4; r++) {
          for (let i = 0; i < 6; i++) spark(x, y, turn + (r * Math.PI) / 2 - Math.PI / 2 + rand(-0.06, 0.06), rand(380, 720) * power, colors.core, rand(0.7, 1.1), 2);
        }
      }
      if (mode === "hole") {
        // The hole goes: the disk's matter flung off along it, round the way it turned.
        for (let i = 0; i < 30; i++) {
          const a = rand(0, Math.PI * 2);
          const m = rand(1.6, 3.2);
          const px = Math.cos(a) * holeR * m;
          const py = Math.sin(a) * holeR * m * RATIO;
          const rx = px * Math.cos(TILT) - py * Math.sin(TILT);
          const ry = px * Math.sin(TILT) + py * Math.cos(TILT);
          spark(x + rx, y + ry, Math.atan2(ry, rx) + Math.PI / 2, rand(320, 560) * power, pick([holeColors.hot, holeColors.warm, holeColors.cool]), rand(0.6, 1.1), 1.8);
        }
        holeR = 0;
      }
      if (mode === "orb") {
        // The blob bursts: a ring of sparks off its surface.
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2 + rand(-0.05, 0.05);
          spark(x + Math.cos(a) * orbR, y + Math.sin(a) * orbR, a, rand(300, 520) * power, pick([orbColors.inner, orbColors.mid]), rand(0.6, 1), 1.8);
        }
        orbR = 0;
        dents = [];
        crackles = [];
      }
      for (const c of caught) {
        const cx = x + Math.cos(c.a) * c.r;
        const cy = y + Math.sin(c.a) * c.r;
        const out = mode === "swirl" ? c.a + Math.PI / 2 : c.a;
        spark(cx, cy, out, (mode === "swirl" ? c.w * c.r * 6 : 0) + rand(160, 320) * power, c.color, rand(0.8, 1.3), 1.6);
      }
      caught = [];
      run();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || interactive(e.target)) return;
      const dark = document.documentElement.classList.contains("dark");
      colors = palette(dark);
      orbColors = dark ? ORB.dark : ORB.light;
      holeColors = dark ? HOLE.dark : HOLE.light;
      held = { id: e.pointerId, x: e.clientX, y: e.clientY };
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!held) return;
        armed = true;
        charge = 0;
        caught = [];
        fullAt = 0;
        orbR = 0;
        dents = [];
        crackles = [];
        holeR = 0;
        // No selection or drag while the egg runs.
        document.body.style.userSelect = "none";
        window.getSelection()?.removeAllRanges();
        run();
      }, HOLD_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (!held || e.pointerId !== held.id) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!armed && Math.hypot(e.clientX - held.x, e.clientY - held.y) > SLOP) {
        held = null;
        clearTimeout(timer);
      }
    };
    const onUp = (e: PointerEvent) => {
      // After the swallowing `held` is gone: the release does nothing.
      if (!held || e.pointerId !== held.id) return;
      held = null;
      clearTimeout(timer);
      if (!armed) return;
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
      window.removeEventListener("resize", sizeHole);
      hole?.clear();
      hole?.dispose();
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [calm, host, mode]);

  if (!host || calm) return null;
  return createPortal(
    <>
      <canvas aria-hidden className="pointer-events-none fixed inset-0 z-[60] size-full" data-egg="" ref={canvasRef} />
      <canvas aria-hidden className="pointer-events-none fixed inset-0 z-[61] size-full" data-egg="" ref={glRef} />
      {swallowed && <Beyond at={swallowed} onBack={() => setSwallowed(null)} plan={planRef.current} />}
    </>,
    host
  );
};

const BEYOND_CSS = `
/* Each line comes out of the dark: from a blur, a little below, slowly — this is the moment to slow down for. */
@keyframes beyond-rise { from { opacity: 0; filter: blur(8px); transform: translateY(10px); } }
.beyond-rise { animation: beyond-rise 900ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
@media (prefers-reduced-motion: reduce) { @keyframes beyond-rise { from { opacity: 0; } } }
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
@media (prefers-reduced-motion: reduce) { .beyond-glint { animation: none; opacity: 0.6; transform: scale(0.7); } }
`

/** What a piece of the page is: something one sees as one thing — a control, a line of text, a picture. */
const PIECE = "button, a, input, textarea, select, img, svg, [contenteditable='true'], [role='button'], h1, h2, h3, p, li, label";

type Piece = { el: HTMLElement | SVGElement; c: { x: number; y: number }; area: number };

/** Whether something round the element clips it (a scroll area): a piece flying out of it would be cut at its edge. */
const clipped = (el: Element) => {
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") return true;
  }
  return false;
};

/**
 * A clipped piece flies as its double: an exact copy on a layer over the page, at the same place, in the same font
 * and colour, while the piece itself is hidden. Nothing round the double clips it. `undo` puts the piece back.
 */
const lift = (p: Piece, layer: HTMLElement): { piece: Piece; undo: () => void } => {
  const el = p.el;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const copy = el.cloneNode(true) as HTMLElement | SVGElement;
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
  while (e.parentElement && getComputedStyle(e).display === "inline" && !(e instanceof SVGSVGElement)) e = e.parentElement;
  return e;
};

const pieceOf = (el: Element): Piece | null => {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return null;
  const r = el.getBoundingClientRect();
  return { area: r.width * r.height, c: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, el };
};

/**
 * The page in pieces, for the hole to eat: first the small things that read as one (a control, a picture, a line of
 * text), then the panels they sat on (anything with a background or a border, the outermost of them).
 */
const piecesOfPage = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const small = new Set<Element>();
  const panels = new Set<Element>();
  const visible = (el: Element, style: CSSStyleDeclaration) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw && style.visibility !== "hidden";
  };
  const walk = (el: Element, inPanel: boolean) => {
    if (small.size >= 260 || el.hasAttribute("data-egg")) return;
    const style = getComputedStyle(el);
    // A `display: contents` wrapper has no box of its own: its children are what is on screen.
    if (style.display === "contents") {
      for (const child of el.children) walk(child, inPanel);
      return;
    }
    if (!visible(el, style)) return;
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    const text = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
    if ((el.matches(PIECE) || text) && area < vw * vh * 0.2) {
      small.add(movable(el));
      return;
    }
    const painted = style.backgroundColor !== "rgba(0, 0, 0, 0)" || Number.parseFloat(style.borderTopWidth) > 0 || style.boxShadow !== "none";
    const panel = !inPanel && painted && area < vw * vh * 0.5 && area > 400;
    if (panel) panels.add(el);
    for (const child of el.children) walk(child, inPanel || panel);
  };
  for (const child of document.body.children) walk(child, false);
  const list = (set: Set<Element>) => [...set].map(pieceOf).filter((p): p is Piece => p !== null);
  return { panels: list(panels), small: list(small) };
};

/**
 * One piece torn off and carried in, as keyframes: first a short shudder where it sits (it is being torn off), then the
 * stream takes it — round the hole by part of a turn (the stream turns, not the piece: it stays upright), in and in,
 * faster and faster, shrinking; solid till the rim, where it is gone.
 */
const SHUDDER = 0.16;
const fallFrames = (c: { x: number; y: number }, at: { x: number; y: number }, horizon: number, sweep: number): Keyframe[] => {
  const r0 = Math.max(1, Math.hypot(c.x - at.x, c.y - at.y));
  const a0 = Math.atan2(c.y - at.y, c.x - at.x);
  const frames: Keyframe[] = [
    { offset: 0, opacity: 1, transform: "translate(0px, 0px) scale(1)" },
    { offset: SHUDDER * 0.25, opacity: 1, transform: "translate(1.5px, -1px) scale(1)" },
    { offset: SHUDDER * 0.5, opacity: 1, transform: "translate(-1.5px, 1px) scale(1.02)" },
    { offset: SHUDDER * 0.75, opacity: 1, transform: "translate(1px, 0.5px) scale(1)" },
  ];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const fall = t ** 2;
    const r = r0 * (1 - fall);
    const a = a0 + sweep * fall ** 1.4;
    const x = at.x + Math.cos(a) * r - c.x;
    const y = at.y + Math.sin(a) * r - c.y;
    const size = Math.max(0.04, (r / r0) ** 0.6);
    frames.push({
      offset: SHUDDER + (1 - SHUDDER) * t,
      opacity: r < horizon * 1.6 ? Math.max(0, (r - horizon * 0.4) / (horizon * 1.2)) : 1,
      transform: `translate(${x}px, ${y}px) scale(${size})`,
    });
  }
  return frames;
};

/** The far side's sky: the twinkling field, and now and then a star falling across it. */
const FAR_SKY: SkyRules = { count: 2, pace: [1.2, 2.4], region: "all", rest: [2, 5] };

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
const GLINT_PATH = "M9 0 L10.2 7.8 L18 9 L10.2 10.2 L9 18 L7.8 10.2 L0 9 L7.8 7.8 Z";

/**
 * Beyond the horizon: the page is pulled into the point the hole stood at (scaled down, turned, blurred, faster as it
 * goes) while black spreads from that point; then a small black hole, a line of text and «Новый чат». The button puts
 * the page back and lets the black fade.
 */
interface SwallowPlan {
  /** The black over the page: the hole's horizon. */
  el: HTMLDivElement | null;
  /** When the last piece is in and the horizon swells past the screen. */
  floodAt: number;
}

const Beyond = ({ at, onBack, plan }: { at: { x: number; y: number }; onBack: () => void; plan: SwallowPlan }) => {
  const black = useRef<HTMLDivElement>(null);
  const runs = useRef<Animation[]>([]);
  /** Puts the lifted pieces back and drops their doubles. */
  const undoRef = useRef<(() => void)[]>([]);
  const go = useRef<HTMLButtonElement>(null);
  /** One of the lines about rest, a new one each time. */
  const restLines = useRestLines();
  const rest = usePick(restLines) ?? restLines[0];
  const labels = useBeyondLabels();
  /** When the black has covered all: the far side's text rises then. */
  const [reveal, setReveal] = useState(SWALLOW_DURATION);
  useEffect(() => {
    const found = piecesOfPage();
    // Pieces in a scroll area (the sidebar's list) fly as their doubles, over the page, so its edge does not cut them.
    const layer = document.createElement("div");
    layer.setAttribute("data-egg", "");
    Object.assign(layer.style, { inset: "0", pointerEvents: "none", position: "fixed", zIndex: "65" });
    document.body.append(layer);
    const undo: (() => void)[] = [() => layer.remove()];
    /** A double → the piece it stands for: what lies on which panel is the piece's, not its double's. */
    const origin = new Map<Element, Element>();
    const small = found.small.map((p) => {
      if (!clipped(p.el)) return p;
      const lifted = lift(p, layer);
      undo.push(lifted.undo);
      origin.set(lifted.piece.el, p.el);
      return lifted.piece;
    });
    const { panels } = found;
    undoRef.current = undo;
    const horizon = 30;
    const reach = Math.max(1, ...[...small, ...panels].map(({ c }) => Math.hypot(at.x - c.x, at.y - c.y)));
    // The stream turns one way, as a tornado does.
    const turn = Math.random() < 0.5 ? -1 : 1;
    const fall = (p: Piece, delay: number, duration: number) => {
      p.el.style.transformOrigin = "center";
      p.el.style.transformBox = "fill-box";
      return p.el.animate(fallFrames(p.c, at, horizon, turn * rand(0.9, 1.5)), { delay, duration, easing: "linear", fill: "forwards" });
    };
    // One by one, the nearest first: a piece, a pause, the next — the pauses shorter and shorter as the hole gathers
    // strength, till it is a stream.
    const byDistance = (list: Piece[]) => [...list].sort((a, b) => Math.hypot(at.x - a.c.x, at.y - a.c.y) - Math.hypot(at.x - b.c.x, at.y - b.c.y));
    let clock = 0;
    let gap = 260;
    const next = () => {
      const t = clock;
      clock += gap;
      gap = Math.max(14, gap * 0.86);
      return t;
    };
    const ends = new Map<Element, number>();
    const first = byDistance(small).map((p) => {
      const d = Math.hypot(at.x - p.c.x, at.y - p.c.y) / reach;
      const delay = next();
      const duration = 650 + d * 450;
      ends.set(p.el, delay + duration);
      return fall(p, delay, duration);
    });
    // The panels they sat on do not fly — a whole sidebar sliding off reads as a sheet, not as matter. Once all that
    // lay on one is gone, it dissolves: fades, leaning a little toward the hole, as if drawn after its contents.
    let last = Math.max(0, ...ends.values());
    const second = panels.map((p) => {
      const onIt = small.filter((q) => p.el.contains(origin.get(q.el) ?? q.el)).map((q) => ends.get(q.el) ?? 0);
      const delay = Math.max(0, Math.max(0, ...onIt) - 350);
      const duration = 700;
      last = Math.max(last, delay + duration);
      p.el.style.transformOrigin = "center";
      return p.el.animate(
        [
          { opacity: 1, transform: "translate(0px, 0px) scale(1)" },
          { opacity: 0, transform: `translate(${(at.x - p.c.x) * 0.08}px, ${(at.y - p.c.y) * 0.08}px) scale(0.96)` },
        ],
        { delay, duration, easing: FALL_IN, fill: "forwards" }
      );
    });
    runs.current = [...first, ...second];
    setReveal(last + FLOOD_MS + 150);
    // The canvas sizes the black as the hole's horizon; it swells past the screen once the last piece is in.
    plan.el = black.current;
    plan.floodAt = performance.now() + last;
    return () => {
      for (const r of runs.current) r.cancel();
      for (const u of undoRef.current) u();
      undoRef.current = [];
      plan.el = null;
      plan.floodAt = 0;
    };
  }, [at, plan]);
  // Beyond the horizon the keyboard lives here: the page under the black is inert, the way back takes the focus once
  // it shows, and Esc goes back too.
  useEffect(() => {
    const page = [...document.body.children].filter((el) => !el.hasAttribute("data-egg") && !el.querySelector("[data-egg]"));
    for (const el of page) el.setAttribute("inert", "");
    const focus = window.setTimeout(() => go.current?.focus({ preventScroll: true }), reveal + 980);
    return () => {
      clearTimeout(focus);
      for (const el of page) el.removeAttribute("inert");
    };
  }, [reveal]);
  const back = () => {
    // The page returns at once under the black, and the black fades off it.
    for (const r of runs.current) r.cancel();
    runs.current = [];
    for (const u of undoRef.current) u();
    undoRef.current = [];
    const fade = black.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" });
    if (fade) fade.onfinish = onBack;
    else onBack();
  };
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") backRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // By importance, not by a fixed step: the head first and slowest, the lines after it closer together, the way back
  // last — in about a second, not three.
  const STEPS = [0, 0, 120, 300, 560, 640, 720, 0, 980];
  const late = (i: number) => ({ animationDelay: `${reveal + (STEPS[i] ?? 0)}ms` });
  return (
    <div className="fixed inset-0 z-[70] bg-black text-white" data-egg="" ref={black} style={{ clipPath: `circle(0px at ${at.x}px ${at.y}px)` }}>
      <style>{SKY_CSS + BEYOND_CSS}</style>
      <div className="absolute inset-0" style={late(0)}>
        <Sky field rules={FAR_SKY} tone="night" />
      </div>
      {GLINTS.map((g) => (
        <svg aria-hidden className="beyond-glint" key={`${g.x}-${g.y}`} style={{ "--d": `${g.d}s`, "--t": `${g.t}s`, left: `${g.x}%`, top: `${g.y}%` } as React.CSSProperties} viewBox="0 0 18 18">
          <path d={GLINT_PATH} fill="#fff" />
        </svg>
      ))}
      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="beyond-rise text-[11px] font-medium tracking-[0.32em] text-white/55 uppercase" style={late(1)}>
          {labels.eyebrow}
        </p>
        <h2 className={`${serif.className} mt-6 text-5xl leading-[1.05] font-normal tracking-tight text-balance italic sm:text-6xl`}>
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
            <p className="beyond-rise text-balance" key={line} style={late(4 + i)}>
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
            {labels.back}
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
