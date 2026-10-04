/**
 * Inbox: Riffle's tray of eight cards, fed. App icons keep flying in from the frame's edges, growing as they
 * come, and slip into a gap; the cards part round it in turn. The pointer pulls a card as in Riffle, and holds the stream.
 *
 * A Hairline figure, drawn and checked in spikes/hairline-inbox/inbox.js with /hairline-create; this is that file
 * line for line, typed, on the engine beside it. A change is made there, looked at, and carried over here.
 */
import {
  Cam, clamp, facing, fillet, fit, hull, lerp, open, poly, proj, rad, ringAt, rrect, run, seg,
  type Projector, type Ring, type Sample, type Vec2, type Vec3,
} from "./iso";
import { reducedMotion, tdone, tset, tval, tween, type Tween } from "./motion";
import { disposer, mk, place, pointer, reflect, register, type FigureEls, type FigureHandle, type FigureMount } from "./stage";

const N = 8, W = 84, H = 54, G = 13, TW = 22, TH = 7, TABS = [6, 31, 56], TK = 1.4, REST = -12, BACK = -24, FWD = 20, LIFT = 16, PART = 8;
const X0 = -5, X1 = W + 5, Y0 = -9, Y1 = (N - 1) * G + 9, WH = 20, WR = 6, WT = 2.4;
const SZ = 24, IK = 3, ZH = 62, EVERY = 2400;

/** A shape on an icon's face: its points, and whether it closes. */
type Mark = { p: Vec2[]; c: boolean };

/** Shapes on an icon's face, u across and v up, on a 24 grid: an open run, a rounded box, an oval, a rounded polygon. */
const L = (...p: Vec2[]): Mark => ({ p, c: false });
const B = (u0: number, v0: number, u1: number, v1: number, r: number): Mark => ({ p: fillet([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], [r, r, r, r]), c: true });
const O = (cu: number, cv: number, ru: number, rv = ru, n = 12): Mark => ({ p: Array.from({ length: n }, (_, k): Vec2 => [cu + ru * Math.cos((k / n) * 2 * Math.PI), cv + rv * Math.sin((k / n) * 2 * Math.PI)]), c: true });
const F = (pts: Vec2[], r: number): Mark => ({ p: fillet(pts, pts.map(() => r)), c: true });
const TILE = fillet([[0, 0], [SZ, 0], [SZ, SZ], [0, SZ]], [6.5, 6.5, 6.5, 6.5]);

/** Each icon's name for the read-out and its mark: the thing itself, never its letters. */
const ICONS: [string, Mark[]][] = [
  ["1С", [B(5.5, 6, 18.5, 18, 1.5), L([5.5, 14], [18.5, 14]), L([5.5, 10], [18.5, 10]), L([10.5, 6], [10.5, 18])]],
  ["почта", [B(5, 7.5, 19, 16.5, 1.5), L([5.8, 15.6], [12, 11.2], [18.2, 15.6])]],
  ["Битрикс24", [B(5, 10.5, 8.6, 18, 1.2), B(10.2, 6, 13.8, 18, 1.2), B(15.4, 13, 19, 18, 1.2)]],
  ["PDF", [F([[7, 5], [17, 5], [17, 15], [13, 19], [7, 19]], 0.8), L([13, 18.6], [13, 15], [16.6, 15]), L([9.5, 11], [14.5, 11]), L([9.5, 8], [14.5, 8])]],
  ["Word", [L([5, 17], [19, 17]), L([5, 13.5], [19, 13.5]), L([5, 10], [19, 10]), L([5, 6.5], [11.5, 6.5]), L([13.5, 4.8], [13.5, 8.2])]],
  ["аудио", [6, 9, 13, 7, 10, 4].map((h, i) => L([6.5 + i * 2.2, 12 - h / 2], [6.5 + i * 2.2, 12 + h / 2]))],
  ["видео", [B(4.5, 6.5, 19.5, 17.5, 2), F([[10.2, 9], [10.2, 15], [15.2, 12]], 0.8)]],
  ["люди", [O(12, 14.6, 2.8), L(...Array.from({ length: 9 }, (_, k): Vec2 => [12 + 5.5 * Math.cos((k / 8) * Math.PI), 6 + 4.5 * Math.sin((k / 8) * Math.PI)]))]],
  ["заметки", [B(6, 5, 18, 17, 1.5), O(9, 17, 0.9, 1.7, 8), O(12, 17, 0.9, 1.7, 8), O(15, 17, 0.9, 1.7, 8), L([8.5, 13], [15.5, 13]), L([8.5, 10], [15.5, 10]), L([8.5, 7], [13, 7])]],
];
/** The n-th icon sent starts at FROM (a viewBox point near the edge) and slips into gap GAPS (in front of card k), at XS across. */
const FROM: Vec2[] = [[14, 150], [386, 96], [150, 10], [386, 196], [14, 50], [270, 10]];
const GAPS = [3, 0, 5, 2, 6, 1, 4], XS = [42, 24, 58, 34, 50, 20, 64, 30, 54];
const LR = (pts: Vec2[]) => (pts[0][0] <= pts[pts.length - 1][0] ? pts : pts.slice().reverse()); // a run, left to right on screen

/** The tray, which never moves: `far` is painted before the cards, `near` after them; each entry is [d, class]. */
function tray(P: Projector, front: (q: Sample) => boolean, outer: Ring, inner: Ring) {
  const far: [string, string][] = [
    [poly(hull(ringAt(P, outer, 0).concat(ringAt(P, outer, WH)))), "sil"],
    [poly(ringAt(P, inner, WH)), "nf"],
    [open(ringAt(P, run(inner, (q) => !front(q)), 2.5)), "nf lo"],
  ];
  const iF = LR(ringAt(P, run(inner, front), WH)), oT = LR(ringAt(P, run(outer, front), WH)), oB = LR(ringAt(P, run(outer, front), 0));
  const hx = (X0 + X1) / 2, onFront = (ring: Ring) => ring.map((q) => P(q.u, Y1, q.v));
  const near: [string, string][] = [
    [poly([...iF, oT[oT.length - 1], ...oB.slice().reverse(), oT[0]]), "fo"],
    [open(oT), "nf lo"], [open(iF), "nf"], [open([oT[0], ...oB, oT[oT.length - 1]]), "nf sil"],
    [poly(onFront(rrect(hx - 11, 6.5, hx + 11, 12.5, 3, 5))), "nf"],
    [poly(onFront(rrect(hx - 9.4, 8, hx + 9.4, 11, 1.5, 5))), "nf lo"],
  ];
  return { far, near };
}

/** Card i leaning th degrees (negative leans back) and lifted by `lift`: its paths, and where its eight punches sit. */
function pose(P: Projector, i: number, t0: number, shape: Vec2[], th: number, lift: number) {
  const yb = i * G, s = Math.sin(rad(th)), c = Math.cos(rad(th));
  const w = (u: number, v: number) => P(u, yb + v * s, v * c + lift), wb = (u: number, v: number) => P(u, yb + v * s - TK * c, v * c + TK * s + lift);
  const punch = Array.from({ length: 8 }, (_, k) => w(t0 + TW / 2 + ((k % 4) - 1.5) * 3.6, H + TH / 2 + (0.5 - Math.floor(k / 4)) * 2.8));
  return {
    back: poly(shape.map((p) => wb(p[0], p[1]))), face: poly(shape.map((p) => w(p[0], p[1]))), head: seg(w(6, H - 11), w(W - 6, H - 11)),
    rules: [H - 18, H - 25, H - 32, H - 39].map((v) => seg(w(6, v), w(W - 6, v))).join(""), punch,
  };
}

/** An icon on floor point (x, y), its foot at height zb, leaning th, turned yaw, at scale sc about its middle, carried by o. */
function ipose(P: Projector, mark: Mark[], x: number, y: number, zb: number, th: number, yaw: number, sc: number, o: Vec3) {
  const s = Math.sin(rad(th)), c = Math.cos(rad(th)), sy = Math.sin(rad(yaw)), cy = Math.cos(rad(yaw));
  const m = ([u, v]: Vec2, k = 0) => {
    const a = (u - SZ / 2) * sc, r = zb / c + SZ / 2 + (v - SZ / 2) * sc, n = r * s - k * c;
    return P(x + a * cy - n * sy + o[0], y + a * sy + n * cy + o[1], r * c + k * s + o[2]);
  };
  return { back: poly(TILE.map((q) => m(q, IK))), face: poly(TILE.map((q) => m(q))), glyph: mark.map((q) => (q.c ? poly : open)(q.p.map((p) => m(p)))).join("") };
}

/** q's named paths into el's elements. */
const put = <K extends string>(el: Record<NoInfer<K>, SVGElement>, q: Record<NoInfer<K>, string>, keys: readonly K[]) => { for (const k of keys) el[k].setAttribute("d", q[k]); };

type Card = {
  n: number; t0: number; shape: Vec2[]; grp: SVGGElement; back: SVGPathElement; face: SVGPathElement; head: SVGPathElement;
  rules: SVGPathElement; punch: SVGCircleElement[]; a: Tween; z: Tween; last: string;
};
type Icon = {
  name: string; mark: Mark[]; grp: SVGGElement; back: SVGPathElement; face: SVGPathElement; glyph: SVGPathElement;
  on: boolean; diving: boolean; last: string; gap: number; x: number; yaw: number; o: Vec3; f: Tween; dv: Tween;
};

function mount({ stage, svg, read }: FigureEls, value: number): FigureHandle {
  const bag = disposer();
  let stag = value;
  // fitted to the tray with a card lifted and an icon over the back and front gaps, so no pose leaves the frame
  const C = Cam(45, 0.5, 1.5);
  fit(C, [[X0, Y0, 0], [X1, Y1, -8], [X1, Y0, 0], [X0, Y1, 0], [X0, Y0, H + TH], [X1, Y0, H + TH + LIFT], [8, -12, ZH + SZ], [76, 64, ZH + SZ]], 200, 166);
  const P = proj(C), front = facing(C);
  const outer = rrect(X0, Y0, X1, Y1, WR, 6), inner = rrect(X0 + WT, Y0 + WT, X1 - WT, Y1 - WT, WR - WT, 6);
  const paths = tray(P, front, outer, inner);
  const p0 = P(0, 0, 0), axis = (q: Vec2): Vec2 => [q[0] - p0[0], q[1] - p0[1]], ex = axis(P(1, 0, 0)), ey = axis(P(0, 1, 0)), ez = axis(P(0, 0, 1));

  const g = mk("g", {}, svg);
  reflect(svg, g, P, front, outer, 0, 14);
  for (const [d, cls] of paths.far) mk("path", { d, class: cls }, g);
  const cards: Card[] = [];
  for (let i = 0; i < N; i++) {
    // card i, back to front: its number (8 at the back), which of three tab positions it takes, and its filleted outline
    const n = N - i, t0 = TABS[(N - 1 - i) % 3], grp = mk("g", {}, g);
    const shape = fillet([[0, 0], [W, 0], [W, H], [t0 + TW, H], [t0 + TW, H + TH], [t0, H + TH], [t0, H], [0, H]], [1, 1, 3.2, 1.8, 2.4, 2.4, 1.8, 3.2]);
    const back = mk("path", { class: "lo" }, grp), face = mk("path", { class: "sil" }, grp);
    const head = mk("path", { class: "nf" }, grp), rules = mk("path", { class: "nf lo" }, grp);
    const punch = Array.from({ length: 8 }, (_, k) => mk("circle", { r: 1.05, class: "dot " + (k === n - 1 ? "m" : "off") }, grp));
    cards.push({ n, t0, shape, grp, back, face, head, rules, punch, a: tween(REST), z: tween(0), last: "" });
  }
  for (const [d, cls] of paths.near) mk("path", { d, class: cls }, g);

  // icons are made once and kept out of the svg until sent: one is in the drawing only while it flies
  const icons = ICONS.map(([name, mark]): Icon => {
    const grp = mk("g", {}, g);
    const ic: Icon = {
      name, mark, grp, back: mk("path", { class: "lo" }, grp), face: mk("path", { class: "sil" }, grp), glyph: mk("path", { class: "nf" }, grp),
      on: false, diving: false, last: "", gap: 0, x: 0, yaw: 0, o: [0, 0, 0], f: tween(0, 1400), dv: tween(0),
    };
    return grp.remove(), ic;
  });

  // hit bands: oblique strips along the RESTING top edges. They never move, and nothing draws them.
  const top = (i: number) => P(W / 2, i * G + H * Math.sin(rad(REST)), H * Math.cos(rad(REST)));
  const c0 = top(0), c1 = top(1), d = [c1[0] - c0[0], c1[1] - c0[1]], HALF = W / 2 + 6, det = d[0] * ex[1] - d[1] * ex[0];
  /** The card whose band holds the point, in the band's own (s, r) coordinates; -1 outside. */
  function hit([x, y]: Vec2) {
    const qx = x - c0[0], qy = y - c0[1], s = (qx * ex[1] - qy * ex[0]) / det, r = (d[0] * qy - d[1] * qx) / det;
    return Math.abs(r) > HALF || s < -0.5 || s > N + 1 ? -1 : clamp(Math.round(s), 0, N - 1);
  }

  let act = -1, sent = 0, nextAt = performance.now() + 300;
  const alive: Icon[] = []; // the icons in the air, first the next to slip in
  /** The one bright mark at rest is the icon still on its way in, the oldest first; a pulled card takes it. */
  const bright = () => { const lead = alive.find((ic) => !ic.diving) ?? alive[0]; icons.forEach((ic) => { for (const k of ["face", "glyph"] as const) ic[k].classList.toggle("hi", act < 0 && ic === lead); }); };

  /** Parts the cards round gap k, or closes them, staggered outwards from the gap. Held while a card is pulled. */
  function part(k: number, now: number, opening: boolean) {
    if (act >= 0) return;
    cards.forEach((cd, j) => { const dj = j <= k ? k - j : j - k - 1; tset(cd.a, opening ? REST + (j <= k ? -PART : PART) * 0.5 ** dj : REST, now, dj * stag); });
  }

  /** Sends the next icon: from a point near the frame's edge it heads for the spot over its gap. */
  function send(now: number) {
    const ic = icons[sent % icons.length], T = FROM[sent % FROM.length], oz = 24;
    ic.gap = GAPS[sent % GAPS.length]; ic.x = XS[sent % XS.length]; ic.yaw = sent % 2 ? -40 : -26; // turned towards the viewer, so its mark reads in flight
    const rc = ZH / Math.cos(rad(REST)) + SZ / 2, hs = P(ic.x, ic.gap * G + 8 + rc * Math.sin(rad(REST)), rc * Math.cos(rad(REST)));
    // the carry that puts the icon's middle on T: a rise of oz, and the ground offset that makes up the rest
    const r0 = T[0] - hs[0] - oz * ez[0], r1 = T[1] - hs[1] - oz * ez[1], dt = ex[0] * ey[1] - ex[1] * ey[0];
    ic.o = [(r0 * ey[1] - r1 * ey[0]) / dt, (ex[0] * r1 - ex[1] * r0) / dt, oz];
    // the flight crosses the frame, many times a card's lift: twice the lift's time, or it reads as a jump
    ic.f = tween(0, 1400); ic.dv = tween(0); tset(ic.f, 1, now, 0);
    ic.on = true; ic.diving = false; ic.last = ""; alive.push(ic); sent++;
    g.append(ic.grp); bright();
  }

  /** One icon's frame: flying in (sideways first, then down, growing), then slipping into its gap between the leaning cards. */
  function fly(ic: Icon, now: number) {
    // over the cards it is above everything and painted last; in its gap it goes between card k and card k + 1
    const e = tval(ic.f, now), q = 1 - e * e; // it grows at once, and sets off slower than it grows
    // it slips in once it has all but arrived; the rest of the flight plays out inside the dive, so nothing jumps
    if (!ic.diving && e > 0.97) { ic.diving = true; tset(ic.dv, 1, now, 0); cards[ic.gap].grp.after(ic.grp); part(ic.gap, now, true); bright(); }
    if (ic.diving && tdone(ic.dv, now)) { ic.on = false; ic.grp.remove(); alive.shift(); bright(); part(ic.gap, now, false); return; }
    const dv = tval(ic.dv, now), th = (ic.diving ? (tval(cards[ic.gap].a, now) + tval(cards[ic.gap + 1].a, now)) / 2 : REST) + ic.yaw * 0.4 * q;
    if (ic.last === (ic.last = [e, dv, th].join("|"))) return;
    put(ic, ipose(P, ic.mark, ic.x, ic.gap * G + 8, lerp(ZH, 2, dv), th, ic.yaw * q, e, [ic.o[0] * q * q, ic.o[1] * q * q, ic.o[2] * q]), ["back", "face", "glyph"]);
  }

  const R = register(stage, (_dt, now) => {
    const live = act < 0 && !reducedMotion();
    if (live && now >= nextAt) { send(now); nextAt = now + EVERY; }
    let moving = false;
    cards.forEach((cd, i) => {
      const th = tval(cd.a, now), z = tval(cd.z, now);
      if (cd.last !== (cd.last = th + "|" + z)) { const q = pose(P, i, cd.t0, cd.shape, th, z); put(cd, q, ["back", "face", "head", "rules"]); cd.punch.forEach((el, k) => place(el, q.punch[k])); }
      if (!tdone(cd.a, now) || !tdone(cd.z, now)) moving = true;
    });
    icons.forEach((ic) => { if (ic.on) { fly(ic, now); moving = true; } });
    return live || moving;
  });
  bag.add(R.unregister);

  const caption = (a: number) => (a < 0 ? "rest" : String(N - a).padStart(2, "0"));
  /** Pulls card a (-1 puts them all back). The stagger spreads out from the card pulled, or the one let go. */
  function setActive(a: number) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    cards.forEach((cd, i) => {
      const delay = Math.abs(i - from) * stag;
      tset(cd.a, a < 0 ? REST : i < a ? BACK : i > a ? FWD : 0, now, delay); tset(cd.z, a === i ? LIFT : 0, now, delay);
      cd.face.classList.toggle("hi", i === a); cd.head.classList.toggle("hi", i === a); cd.punch[cd.n - 1].classList.toggle("m", i !== a);
    });
    if (a < 0) nextAt = Math.max(nextAt, now + 400);
    bright();
    read.textContent = caption(a);
    R.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { stag = v; }, destroy: bag.dispose };
}

/** The figure's engine. Its value is the ripple's stagger between neighbouring cards, in ms: 0, 40 or 90 on the bench. */
export const inbox: FigureMount = mount;
