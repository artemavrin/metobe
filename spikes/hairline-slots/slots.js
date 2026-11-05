/**
 * Slots: an agent's dock. A low rounded plate holds four sockets, each its own
 * shape: what (a tall block, two rules on its top), when (a round dial with a
 * hand), with (a square with two pins), where (a long bar with a groove). The
 * filled ones sit in their sockets; the one still missing hangs over its empty
 * socket on dashed guides, bright: that is what the agent will ask for.
 * The plug under the pointer lifts out, its neighbours less, staggered from it.
 * The read-out names the slot. The slider is the lift, in world units.
 */
const {
  Cam, extremes, facing, fit, poly, proj, prism, rings, ringAt, seg,
  tdone, tset, tval, tween, disposer, mk, place, pointer, put, reflect, register, solid,
} = HL;

const N = 4, STEP = 32, BH = 6, PAD = 2.2, HOVER = 30;
const X0 = -18, X1 = (N - 1) * STEP + 18, Y0 = -19, Y1 = 19;
/** Each plug: its footprint's half sizes and corner, its height. */
const PLUGS = [
  { name: "что", hx: 9, hy: 9, r: 3, h: 26 },
  { name: "когда", hx: 10, hy: 10, r: 10, h: 12 },
  { name: "чем", hx: 10, hy: 10, r: 3.5, h: 16 },
  { name: "куда", hx: 5.5, hy: 13, r: 3, h: 9 },
];
const FALL = [1, 0.34, 0.12, 0.05];
const MISSING = 1;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let lift = value;

  // Fitted to the plate with the tallest plug at the highest lift, so nothing leaves the frame in any pose.
  const C = Cam(45, 0.5, 1.98);
  fit(C, [[X0, Y0, 0], [X1, Y1, 0], [X0, Y1, 0], [X1, Y0, 0], [0, 0, BH + 26 + 42], [STEP, 0, BH + 12 + HOVER + 8]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [outer, inner] = rings(X0, Y0, X1, Y1, 9, 1.6);
  reflect(svg, g, P, front, outer, 0, 12);
  put(solid(g), prism(P, front, outer, inner, 0, BH));

  // Sockets: a dim outline on the plate's top, a little wider than the plug it takes.
  PLUGS.forEach((p, i) => {
    const cx = i * STEP;
    const [sock] = rings(cx - p.hx - PAD, -p.hy - PAD, cx + p.hx + PAD, p.hy + PAD, p.r + PAD, 1);
    mk("path", { d: poly(ringAt(P, sock, BH)), class: "nf lo" }, g);
  });
  // A row of four lamps on the plate's near edge: lit for each slot filled.
  PLUGS.forEach((_, i) => place(mk("circle", { r: 1.2, class: "dot " + (i === MISSING ? "off" : "m") }, g), P(X1 - 12 + i * 3.4, Y1 - 3.4, BH)));

  const plugs = PLUGS.map((p, i) => {
    const cx = i * STEP;
    const [ring, inn] = rings(cx - p.hx, -p.hy, cx + p.hx, p.hy, p.r, 1.4);
    const grp = mk("g", {}, g);
    const drops = mk("path", { class: "nf dash" }, grp);
    const sol = solid(grp);
    const marks = mk("path", { class: "nf lo" }, grp);
    const dots = (i === 1 ? [[cx, 0], [cx + 5, -2.5]] : i === 2 ? [[cx - 4, 0], [cx + 4, 0]] : []).map(() => mk("circle", { r: 1.1, class: "dot off" }, grp));
    const rest = i === MISSING ? HOVER : 0;
    return { p, cx, ring, inn, drops, sol, marks, dots, rest, z: tween(rest), last: NaN };
  });

  function draw(pl, z) {
    if (z === pl.last) return;
    pl.last = z;
    const { p, cx } = pl, z0 = BH + z, z1 = z0 + p.h;
    put(pl.sol, prism(P, front, pl.ring, pl.inn, z0, z1));
    const [l, r] = extremes(P, pl.ring);
    pl.drops.setAttribute("d", z > 1.5 ? seg(P(l.u, l.v, BH), P(l.u, l.v, z0)) + seg(P(r.u, r.v, BH), P(r.u, r.v, z0)) : "");
    const top = (u, v) => P(u, v, z1);
    let d = "";
    if (pl === plugs[0]) d = seg(top(cx - 5, -3), top(cx + 5, -3)) + seg(top(cx - 5, 2), top(cx + 5, 2));
    if (pl === plugs[1]) d = seg(top(cx, 0), top(cx + 5, -2.5));
    if (pl === plugs[3]) d = seg(top(cx, -8), top(cx, 8));
    pl.marks.setAttribute("d", d);
    const at = pl === plugs[1] ? [[cx, 0], [cx + 5, -2.5]] : [[cx - 4, 0], [cx + 4, 0]];
    pl.dots.forEach((el, k) => place(el, top(at[k][0], at[k][1])));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    plugs.forEach((pl) => { draw(pl, tval(pl.z, now)); if (!tdone(pl.z, now)) moving = true; });
    return moving;
  });
  bag.add(B.unregister);

  // Hit test on the REST pose: the plug whose resting middle is nearest the pointer across, inside the figure's band.
  const mid = plugs.map((pl) => P(pl.cx, 0, BH + pl.rest + pl.p.h / 2));
  const yTop = Math.min(...mid.map((m) => m[1])) - 46, yBot = P(X1, Y1, 0)[1] + 8;
  function hit([x, y]) {
    if (y < yTop || y > yBot) return -1;
    let best = -1, bd = 26;
    mid.forEach((m, i) => { const dd = Math.abs(m[0] - x); if (dd < bd) { bd = dd; best = i; } });
    return best;
  }

  let act = -1;
  function light(a) {
    const mark = a >= 0 ? a : MISSING;
    plugs.forEach((pl, i) => pl.sol.sil.classList.toggle("hi", i === mark));
  }
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    plugs.forEach((pl, i) => {
      const k = Math.abs(i - from), up = a < 0 ? 0 : lift * FALL[Math.min(k, 3)];
      tset(pl.z, Math.max(pl.rest + (i === a ? 6 : 0), up), now, k * 45);
    });
    light(a);
    read.textContent = a < 0 ? "rest" : PLUGS[a].name;
    B.wake();
  }

  light(-1);
  read.textContent = "rest";
  bag.add(pointer(stage, { move: (pt) => setActive(hit(pt)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { lift = v; if (act >= 0) { const a = act; act = -1; setActive(a); } },
    destroy: bag.dispose,
  };
}

hairline({
  name: "slots",
  means: "An agent's dock: four slots, each its own shape; the one still missing hangs over its socket until it is asked for.",
  rules: [1, 2, 4, 5],
  range: [10, 22, 36],
  mount,
});
