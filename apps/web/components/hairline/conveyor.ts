// @ts-nocheck -- generated from spikes/hairline-agents/conveyor.js by gen.mjs; edit it there and run gen.mjs again.
/* oxlint-disable */
import { HL } from "./hl";

const figure = (() => {
/**
 * Conveyor: a periodic task as a small desk conveyor. A stack of sheets waits
 * on the feeder (the data from the connections); every few seconds the belt
 * makes one step, one run: a sheet slides onto the belt, the one under the
 * arch is read by a scan line, and the one at the end drops onto the stack of
 * results, each marked with a band. The belt rests between steps. Hovering
 * slows the clock so a sheet can be followed, and the station under the
 * pointer is bright. The slider is the hovered rate. `run(false)` stops the
 * belt between runs (a task not yet started); `run(true)` starts it again. (Classes past the
 * kernel's — lamp, done — are hooks for the page's palette: the task's colour
 * is the scanner's light and the band on every result.)
 */
const {
  Cam, EASE_LIFT, clamp, fit, facing, hull, lerp, open, poly, prism, proj, rings, seg,
  spring, stepS, disposer, mk, place, pointer, put, reducedMotion, register, solid,
} = HL;

const ZT = 24, R = 5, L = 100, XS = 44, SW = 11, SH = 13, TH = 0.8, PERIOD = 2600, MOVE = 900;
const IZ = ZT - 3, OZ = 8, GAP = 1.2;
// The five places a sheet passes: the feeder's top, three on the belt (the middle one under the arch), the results' top.
const STATIONS = [[-22, IZ + 2 * GAP], [12, ZT], [XS, ZT], [76, ZT], [119, OZ + 2 * GAP]];

/** Where a sheet is at u (0 … 4): x, z. Between stations it slides; off the feeder it lifts a little, off the belt it drops. */
function along(u) {
  const i = clamp(Math.floor(u), 0, 3), t = u - i, [x0, z0] = STATIONS[i], [x1, z1] = STATIONS[i + 1];
  const x = lerp(x0, x1, t);
  if (i === 3) return [x, lerp(z0, z1, t * t) + 5 * Math.sin(Math.PI * t)];
  return [x, lerp(z0, z1, t) + (i === 0 ? 2 * Math.sin(Math.PI * t) : 0)];
}

/** The belt's bed, a slab whose ends round over the drums: its silhouette, the near edge of its top, the drum axles. */
function bed(P) {
  const prof = [], n = 10, zc = ZT - R;
  for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + (k / n) * Math.PI; prof.push([L - R + R * Math.cos(a), zc + R * Math.sin(a)]); }
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + (k / n) * Math.PI; prof.push([R + R * Math.cos(a), zc + R * Math.sin(a)]); }
  const side = (y) => prof.map(([x, z]) => P(x, y, z));
  const near = prof.filter(([, z]) => z >= zc - 0.01).map(([x, z]) => P(x, SH + 4, z));
  return { sil: poly(hull(side(-SH - 4).concat(side(SH + 4)))), crease: open(near.slice(0, n / 2 + 1).reverse().concat(near.slice(n / 2 + 1).reverse())), axles: [P(R, SH + 4, zc), P(L - R, SH + 4, zc)] };
}

/** One sheet lying at (x, z): its plate, its rows of text, and the band a result carries near its leading edge. */
function sheet(P, front, x, z) {
  const [o, i] = rings(x - SW, -SH, x + SW, SH, 1.6, 1);
  const rows = [[-6, -9, 9], [-3, -9, 5], [0, -9, 8]].map(([dx, a, b]) => seg(P(x + dx, a, z + TH), P(x + dx, b, z + TH))).join("");
  return { plate: prism(P, front, o, i, z, z + TH), rows, band: seg(P(x + 6.5, -9, z + TH), P(x + 6.5, 1, z + TH)) };
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let slow = value;
  const C = Cam(45, 0.5, 1.9);
  fit(C, [[-38, -17, 0], [134, 17, 0], [-38, 17, 0], [134, -17, 0], [XS, -23, ZT + 26]], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);
  const block = (x0, y0, x1, y1, r, b, z0, z1, parent = g) => { const s = solid(parent); put(s, prism(P, front, ...rings(x0, y0, x1, y1, r, b), z0, z1)); return s; };

  // The feeder and its stack: the inputs, waiting.
  const feeder = block(-38, -16, -6, 16, 4, 1.4, 0, IZ);
  const inTop = [0, 1, 2].map((k) => { const s = solid(g), q = sheet(P, front, -22, IZ + k * GAP); put(s, q.plate); return [s, q]; }).pop();
  mk("path", { class: "nf lo", d: inTop[1].rows }, g);

  // Legs, the far post of the arch, the bed and its belt.
  [16, 84].forEach((x) => block(x - 4, -12, x + 4, 12, 2, 1, 0, ZT - 2 * R));
  const farPost = block(XS - 3, -23, XS + 3, -17, 2, 0.8, ZT - 2 * R + 2, ZT + 18);
  const b = bed(P), bs = solid(g);
  put(bs, { sil: b.sil, crease: b.crease });
  b.axles.forEach((p) => place(mk("circle", { class: "dot off", r: 1.2 }, g), p));
  const cleats = mk("path", { class: "nf lo" }, g);

  // The results: a pedestal past the belt's end, its stack, the top one banded.
  const shelf = block(104, -16, 134, 16, 4, 1.4, 0, OZ);
  const outTop = [0, 1, 2].map((k) => { const s = solid(g), q = sheet(P, front, 119, OZ + k * GAP); put(s, q.plate); return [s, q]; }).pop();
  mk("path", { class: "nf lo", d: outTop[1].rows }, g);
  mk("path", { class: "nf done", d: outTop[1].band }, g);

  // Sheets on the move: those short of the arch are painted before it, those past it after.
  const pre = mk("g", {}, g), arch = mk("g", {}, g), post = mk("g", {}, g);
  const scan = mk("path", { class: "nf hi lamp" }, arch);
  const nearPost = block(XS - 3, 17, XS + 3, 23, 2, 0.8, ZT - 2 * R + 2, ZT + 18, arch);
  const bar = block(XS - 4.5, -24, XS + 4.5, 24, 3, 1, ZT + 17, ZT + 22, arch);
  const beacon = mk("circle", { class: "dot lamp", r: 2.4 }, arch);
  place(beacon, P(XS, -15, ZT + 24.6));
  const items = [0, 1, 2, 3].map(() => {
    const it = { g: mk("g", {}, pre), s: null, rows: null, band: null, side: "" };
    it.s = solid(it.g); it.rows = mk("path", { class: "nf lo" }, it.g); it.band = mk("path", { class: "nf done" }, it.g);
    return it;
  });

  // The figure's own clock: it runs at `rate`, a step every PERIOD, and starts mid-scan, the thumbnail.
  let clock = MOVE + 0.45 * (PERIOD - MOVE), last = "", running = true;
  const rate = spring(1);
  function draw() {
    const n = Math.floor(clock / PERIOD), ph = clock - n * PERIOD, m = EASE_LIFT(clamp(ph / MOVE, 0, 1));
    const sweep = ph < MOVE ? -1 : (ph - MOVE) / ((PERIOD - MOVE) * 0.7);
    const key = `${m.toFixed(4)} ${sweep.toFixed(3)}`;
    if (key === last) return;
    last = key;
    const shift = (n * 32 + m * 32) % 8, cl = [];
    for (let x = R + 2 + shift; x < L - R; x += 8) cl.push(seg(P(x, -SH - 2, ZT), P(x, SH + 2, ZT)));
    cleats.setAttribute("d", cl.join(""));
    const scanning = sweep >= 0 && sweep <= 1;
    scan.setAttribute("d", scanning ? seg(P(XS - SW + 2 * SW * sweep, -12, ZT + TH + 0.1), P(XS - SW + 2 * SW * sweep, 12, ZT + TH + 0.1)) : "");
    items.forEach((it, k) => {
      const u = k + m, [x, z] = along(u), q = sheet(P, front, x, z);
      put(it.s, q.plate);
      it.rows.setAttribute("d", q.rows);
      const done = u > 2.001 || (k === 2 && sweep > (6.5 + SW) / (2 * SW));
      it.band.setAttribute("d", done ? q.band : "");
      const side = x < XS + 16 ? "pre" : "post";
      if (side !== it.side) { it.side = side; (side === "pre" ? pre : post).appendChild(it.g); }
    });
    // Keep each group far to near.
    items.filter((it) => it.side === "pre").forEach((it) => pre.appendChild(it.g));
    items.filter((it) => it.side === "post").forEach((it) => post.appendChild(it.g));
  }

  const B = register(stage, (dt) => {
    stepS(rate, dt);
    if (running && !reducedMotion()) clock += dt * 1000 * rate.x;
    draw();
    return true; // ambient: the belt keeps its schedule while it is on screen
  });
  bag.add(B.unregister);

  // Which station: the nearest resting centre by screen x (rule 01) — the feeder, the arch, the results.
  const at = [P(-22, 0, IZ), P(XS, 0, ZT + 10), P(119, 0, OZ)].map((p) => p[0]);
  const NAMES = ["вход", "разбор", "итог"];
  let act = -1;
  function pick(a) {
    if (a === act) return;
    act = a;
    [feeder.sil, inTop[0].sil].forEach((el) => el.classList.toggle("hi", a === 0));
    [bar.sil, nearPost.sil, farPost.sil].forEach((el) => el.classList.toggle("hi", a === 1));
    [shelf.sil, outTop[0].sil].forEach((el) => el.classList.toggle("hi", a === 2));
    beacon.setAttribute("class", a < 0 || a === 1 ? "dot lamp" : "dot m lamp");
    scan.classList.toggle("hi", a < 0 || a === 1);
    read.textContent = a < 0 ? "rest" : NAMES[a];
  }
  function move([sx]) {
    let a = 0;
    at.forEach((x, i) => { if (Math.abs(x - sx) < Math.abs(at[a] - sx)) a = i; });
    rate.t = slow;
    pick(a);
  }

  read.textContent = "rest";
  bag.add(pointer(stage, { move, leave: () => { rate.t = 1; pick(-1); } }));
  bag.add(() => svg.replaceChildren());
  // Stopped, it waits at the end of a hold, nothing under the scanner's light; started, the next step comes at once.
  const run = (on) => { running = on; if (!on) clock = Math.floor(clock / PERIOD) * PERIOD + PERIOD - 1; };
  return { set: (v) => { slow = v; if (act >= 0) rate.t = v; }, run, destroy: bag.dispose };
}

return ({
  name: "conveyor",
  means: "A periodic task as a conveyor: every step is a run, inputs ride under the scanner and drop onto the stack of results.",
  rules: [1, 5, 6, 7, 10],
  range: [0.5, 0.25, 0.08],
  mount,
});

})();

export default figure;
