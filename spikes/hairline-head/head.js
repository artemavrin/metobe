/**
 * Head: an agent's head on a neck and a small plinth. A rounded helmet with a
 * visor across its face, two eyes behind the visor, a bolt on each side and an
 * antenna with a ball. The head turns toward the pointer and the eyes look up
 * or down after it, on springs; the antenna lags a little behind the turn. At
 * rest it looks down and to the right, at the field you type in. The slider
 * is how far it may turn, in degrees.
 */
const {
  Cam, facing, fit, poly, proj, prism, rings, rrect, seg, clamp, rad,
  spring, stepS, disposer, mk, place, pointer, put, reflect, register, solid,
} = HL;

const FACE = 45, REST_YAW = -16, REST_PITCH = -0.75;
const HX = 19, HY = 16, HR = 8.5, Z0 = 15, Z1 = 45, ANT = 13;

/** The footprint, turned so its front (local +y) faces yaw degrees. */
function turned(ring, yaw) {
  const c = Math.cos(rad(yaw)), s = Math.sin(rad(yaw));
  // local (a, b) → a·l + b·f, with f = (c, s) forward and l = (s, −c) to the side
  return ring.map((q) => ({ u: q.u * s + q.v * c, v: -q.u * c + q.v * s, nu: q.nu * s + q.nv * c, nv: -q.nu * c + q.nv * s }));
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let reach = value;

  const C = Cam(45, 0.5, 2.9);
  fit(C, [[-26, -26, 0], [26, 26, 0], [-26, 26, 0], [26, -26, 0], [0, 0, Z1 + ANT + 4]], 200, 172);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [plate, plateIn] = rings(-24, -22, 24, 22, 10, 1.6);
  reflect(svg, g, P, front, plate, 0, 12);
  put(solid(g), prism(P, front, plate, plateIn, 0, 5));
  const [neck, neckIn] = rings(-7, -7, 7, 7, 7, 1);
  put(solid(g), prism(P, front, neck, neckIn, 5, Z0));

  const head = solid(g);
  const ears = [mk("path", { class: "nf lo" }, g), mk("path", { class: "nf lo" }, g)];
  const visor = mk("path", { class: "nf hi" }, g), glass = mk("path", { class: "nf lo" }, g);
  const eyes = [mk("circle", { r: 1.6, class: "dot" }, g), mk("circle", { r: 1.6, class: "dot" }, g)];
  const stem = mk("path", { class: "nf" }, g), ball = mk("circle", { r: 1.9, class: "dot m" }, g);

  const [foot, footIn] = rings(-HX, -HY, HX, HY, HR, 1.6);
  const VIS = rrect(-10.5, Z0 + 10, 10.5, Z0 + 23, 6, 6), GLASS = rrect(-8.9, Z0 + 11.6, 8.9, Z0 + 21.4, 4.6, 6);
  const yaw = spring(REST_YAW), pitch = spring(REST_PITCH), lag = spring(REST_YAW, { k: 60, c: 9 });
  let last = "";

  function draw() {
    const key = `${yaw.x.toFixed(2)} ${pitch.x.toFixed(3)} ${lag.x.toFixed(2)}`;
    if (key === last) return;
    last = key;
    const th = FACE + yaw.x, f = [Math.cos(rad(th)), Math.sin(rad(th))], l = [f[1], -f[0]];
    const at = (a, b, z) => P(a * l[0] + b * f[0], a * l[1] + b * f[1], z);
    put(head, prism(P, front, turned(foot, th), turned(footIn, th), Z0, Z1));
    // A bolt on each side, drawn only where that side faces the camera.
    ears.forEach((el, k) => {
      const side = k ? 1 : -1, shows = front({ u: 0, v: 0, nu: side * l[0], nv: side * l[1] });
      const ring = [];
      for (let t = 0; t < 12; t++) ring.push(at(side * (HX + 0.2), 3.5 * Math.cos((t / 12) * 2 * Math.PI), Z0 + 15 + 3.5 * Math.sin((t / 12) * 2 * Math.PI)));
      el.setAttribute("d", shows ? poly(ring) : "");
    });
    // The visor on the front face, and the eyes behind it, looking up or down.
    const onFace = (ring) => ring.map((q) => at(q.u, HY + 0.3, q.v));
    visor.setAttribute("d", poly(onFace(VIS)));
    glass.setAttribute("d", poly(onFace(GLASS)));
    const ez = Z0 + 16.5 + pitch.x * 3.2;
    place(eyes[0], at(-4.4, HY + 0.4, ez));
    place(eyes[1], at(4.4, HY + 0.4, ez));
    // The antenna leans after the head, a beat behind it.
    const lt = FACE + lag.x, lf = [Math.cos(rad(lt)), Math.sin(rad(lt))], sway = (lag.x - yaw.x) * 0.12;
    const tip = P(lf[1] * sway + lf[0] * 1.5, -lf[0] * sway + lf[1] * 1.5, Z1 + ANT);
    stem.setAttribute("d", seg(P(0, 0, Z1), tip));
    place(ball, tip);
  }

  const B = register(stage, (dt) => {
    const a = stepS(yaw, dt), b = stepS(pitch, dt), c = stepS(lag, dt);
    draw();
    return a || b || c;
  });
  bag.add(B.unregister);

  // Where it looks comes from the pointer's place on screen against the head's resting middle, which never moves.
  const mid = P(0, 0, (Z0 + Z1) / 2);
  const words = (y, p) => (p > 0.5 ? "вверх" : p < -0.5 ? "вниз" : y > 12 ? "влево" : y < -12 ? "вправо" : "прямо");
  function look([sx, sy]) {
    yaw.t = clamp((mid[0] - sx) / 120, -1, 1) * reach;
    pitch.t = clamp((mid[1] - sy) / 90, -1, 1);
    lag.t = yaw.t;
    read.textContent = words(yaw.t, pitch.t);
    B.wake();
  }
  function rest() {
    yaw.t = REST_YAW; pitch.t = REST_PITCH; lag.t = REST_YAW;
    read.textContent = "rest";
    B.wake();
  }

  draw();
  read.textContent = "rest";
  bag.add(pointer(stage, { move: look, leave: rest }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { reach = v; },
    destroy: bag.dispose,
  };
}

hairline({
  name: "head",
  means: "An agent's head: it turns to the pointer and its eyes follow; at rest it looks down at the field you type in.",
  rules: [1, 3, 4, 5, 8],
  range: [25, 45, 65],
  mount,
});
