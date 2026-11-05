/**
 * Unit: an agent as a small desk robot. A big precise head on a swivel neck
 * over a low plinth; its face is a dark screen with two glowing eyes, a
 * speaker on each side, an antenna with a lamp set off-centre, a light strip
 * on the plinth. The eyes lead and the head follows them to the pointer; it
 * blinks now and then; held over its face, its eyes curve into ^ ^. At rest
 * it looks down and to the right, at the field you type in. The slider is
 * how far the head may turn. (Classes past the kernel's — screen, eye, lamp —
 * are hooks for the page's palette: the agent's colour is the light.)
 */
const {
  Cam, clamp, facing, fit, lerp, open, poly, prism, proj, rad, rrect, seg,
  spring, stepS, tset, tval, tween, disposer, mk, place, pointer, put, register, solid,
} = HL;

const FACE = 45, REST = { yaw: -14, x: 0.55, y: -0.6 };
const HX = 22, HY = 17, HR = 8, Z0 = 16, Z1 = 47, SZ = (Z0 + Z1) / 2 + 0.5;
const ring = (x0, y0, x1, y1, r, b) => [rrect(x0, y0, x1, y1, r, 14), rrect(x0 + b, y0 + b, x1 - b, y1 - b, Math.max(0.5, r - b), 14)];

/** A ring turned so its local +y faces yaw degrees. */
const turned = (rg, yaw) => {
  const c = Math.cos(rad(yaw)), s = Math.sin(rad(yaw));
  return rg.map((q) => ({ u: q.u * s + q.v * c, v: -q.u * c + q.v * s, nu: q.nu * s + q.nv * c, nv: -q.nu * c + q.nv * s }));
};

/** One eye's outline, in (across, up) on the screen: a soft rounded block that can close (blink) or arch into ^. */
function eye(cx, cz, w, h, happy, shut) {
  const top = [], bot = [], n = 12;
  for (let k = 0; k <= n; k++) {
    const t = -1 + (2 * k) / n, s = Math.pow(1 - Math.pow(Math.abs(t), 4), 0.25), arch = Math.sqrt(1 - t * t);
    const hh = (h / 2) * (1 - 0.9 * shut);
    top.push([cx + t * (w / 2), cz + lerp(hh * s, h * 0.42 * arch - 0.4, happy)]);
    bot.push([cx + t * (w / 2), cz + lerp(-hh * s, h * 0.42 * arch - 0.4 - 2.1 * (0.35 + 0.65 * s), happy)]);
  }
  return top.concat(bot.reverse());
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let reach = value;
  const C = Cam(45, 0.5, 3.05);
  fit(C, [[-28, -28, 0], [28, 28, 0], [-28, 28, 0], [28, -28, 0], [0, 0, Z1 + 16]], 200, 170);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // The plinth, its light strip on the near-left face, the neck and its collar: they never turn.
  const [pl, plIn] = ring(-27, -24, 27, 24, 12, 1.6);
  put(solid(g), prism(P, front, pl, plIn, 0, 6));
  mk("path", { class: "hi lamp", d: seg(P(-9, 24.05, 3), P(9, 24.05, 3)) }, g);
  const [nk, nkIn] = ring(-8, -8, 8, 8, 8, 1);
  put(solid(g), prism(P, front, nk, nkIn, 6, Z0 - 2));
  const [cl, clIn] = ring(-11, -11, 11, 11, 11, 1.2);
  put(solid(g), prism(P, front, cl, clIn, Z0 - 3, Z0 - 1));

  const head = solid(g);
  const ears = [0, 1].map(() => [mk("path", { class: "nf" }, g), mk("path", { class: "nf lo" }, g)]);
  const bezel = mk("path", { class: "nf" }, g), screen = mk("path", { class: "screen" }, g);
  const eyes = [0, 1].map(() => mk("path", { class: "dot eye" }, g));
  const stem = mk("path", { class: "nf" }, g), bulb = mk("circle", { class: "dot lamp", r: 2.3 }, g);
  const [hd, hdIn] = ring(-HX, -HY, HX, HY, HR, 1.8);
  const BEZ = rrect(-14.2, Z0 + 5, 14.2, Z1 - 5, 6.5, 10), SCR = rrect(-12.6, Z0 + 6.6, 12.6, Z1 - 6.6, 5, 10);

  // The eyes lead (the default spring); the head follows, slower — a beat behind its own gaze.
  const gx = spring(REST.x), gy = spring(REST.y), yaw = spring(REST.yaw, { k: 50, c: 13 }), ant = spring(REST.yaw, { k: 40, c: 6 });
  const joy = tween(0);
  let last = "";

  function draw(now) {
    // A blink every few seconds, 160 ms, its gap set by which blink it is.
    const n = Math.floor(now / 4200), ph = now - n * 4200 - ((n * 977) % 1800);
    const shut = ph > 0 && ph < 160 ? Math.sin((ph / 160) * Math.PI) : 0;
    const j = tval(joy, now);
    const key = [gx.x, gy.x, yaw.x, ant.x, j, shut].map((v) => v.toFixed(3)).join(" ");
    if (key === last) return;
    last = key;
    const th = FACE + yaw.x, f = [Math.cos(rad(th)), Math.sin(rad(th))], l = [f[1], -f[0]];
    const at = (a, b, z) => P(a * l[0] + b * f[0], a * l[1] + b * f[1], z);
    put(head, prism(P, front, turned(hd, th), turned(hdIn, th), Z0, Z1));
    ears.forEach(([cup, grille], k) => {
      const sd = k ? 1 : -1, shows = sd * (l[0] + l[1]) * Math.SQRT1_2 > 0.22;
      const disc = (r) => { const pts = []; for (let t = 0; t < 24; t++) { const q = (t / 24) * 2 * Math.PI; pts.push(at(sd * (HX + 0.25), r * Math.cos(q), SZ + r * Math.sin(q))); } return poly(pts); };
      cup.setAttribute("d", shows ? disc(6.2) : "");
      grille.setAttribute("d", shows ? disc(4) + disc(1.8) : "");
    });
    const onFace = (rg, out) => poly(rg.map((q) => at(q.u, HY + out, q.v)));
    bezel.setAttribute("d", onFace(BEZ, 0.25));
    screen.setAttribute("d", onFace(SCR, 0.4));
    const ex = gx.x * 3.1, ez = SZ + gy.x * 2.6;
    eyes.forEach((el, k) => {
      const w = 5.4 + (k ? 1 : -1) * gx.x * 0.5, h = 9.2 - Math.abs(gy.x) * 1.2;
      el.setAttribute("d", poly(eye((k ? 5.8 : -5.8) + ex, ez, w, h, j, shut).map(([a, z]) => at(a, HY + 0.55, z))));
    });
    // The antenna stands off-centre and sways after the turn.
    const sway = (ant.x - yaw.x) * 0.22, base = at(9, -5, Z1), knee = at(9.6 + sway * 0.3, -5, Z1 + 6);
    const tip = at(11 + sway, -4, Z1 + 12.5);
    stem.setAttribute("d", open([base, knee, tip]));
    place(bulb, tip);
  }

  const B = register(stage, (dt, now) => {
    stepS(gx, dt); stepS(gy, dt); stepS(yaw, dt); stepS(ant, dt);
    draw(now);
    return true; // ambient: it breathes and blinks while it is on screen
  });
  bag.add(B.unregister);

  // Aim from the pointer against the resting face, which never moves (rule 01).
  const face = P(0, 0, SZ), mid = P(0, 0, (Z0 + Z1) / 2);
  function aim([sx, sy]) {
    const x = clamp((mid[0] - sx) / 130, -1, 1), near = Math.hypot(sx - face[0], sy - face[1]) < 34;
    gx.t = -x; gy.t = clamp((face[1] - sy) / 90, -1, 1);
    yaw.t = x * reach; ant.t = yaw.t;
    tset(joy, near ? 1 : 0, performance.now(), 0);
    read.textContent = near ? "рад" : x > 0.15 ? "влево" : x < -0.15 ? "вправо" : "прямо";
  }
  function rest() {
    gx.t = REST.x; gy.t = REST.y; yaw.t = REST.yaw; ant.t = REST.yaw;
    tset(joy, 0, performance.now(), 0);
    read.textContent = "rest";
  }

  read.textContent = "rest";
  bag.add(pointer(stage, { move: aim, leave: rest }));
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { reach = v; }, destroy: bag.dispose };
}

hairline({
  name: "unit",
  means: "An agent as a small desk robot: its eyes lead, its head follows the pointer, it blinks, and smiles ^ ^ when you hover its face.",
  rules: [1, 4, 5, 7, 8],
  range: [20, 38, 56],
  mount,
});
