// The black hole of the easter egg, drawn per pixel in WebGL (after the look of Gargantua): a shadow of absolute
// black; a thin, very bright photon ring hugging it; the far side of the accretion disk bent by gravity into a band
// arching over the shadow (and a thinner one under it); the disk itself, almost edge-on, of turbulent hot plasma whose
// inner parts turn faster than the outer ones (Kepler), so its streaks shear and wind by themselves; the side coming
// at us brighter (Doppler); a warm bloom. Colour by temperature: deep red, orange, white. Output is premultiplied: the
// shadow is opaque black, the light lies over the page with its own alpha — on a white page as on a dark one.

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;      // canvas size, device px
uniform vec2 uC;        // centre, device px from the top left
uniform float uR;       // shadow radius, device px
uniform float uT;       // seconds
uniform float uSpin;    // how fast the disk turns
uniform float uGlow;    // overall brightness
uniform float uTilt;    // radians
uniform float uRatio;   // how flat the disk looks (edge-on → 0)
uniform float uFlash;   // the burst's white flash, 0…1
uniform float uShockR;  // the shock wave's radius, device px
uniform float uShockA;  // its strength
uniform float uFade;    // the hole's own light (disk, bent light, rings, bloom): 1, gone in the burst

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
// 0 → deep red, 0.5 → orange, 1 → white-hot.
vec3 heat(float t) {
  vec3 red = vec3(0.6, 0.1, 0.02);
  vec3 orange = vec3(1.0, 0.5, 0.12);
  vec3 white = vec3(1.0, 0.94, 0.84);
  return mix(mix(red, orange, smoothstep(0.0, 0.5, t)), white, smoothstep(0.5, 1.0, t));
}

void main() {
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 q = (fc - uC) / uR;
  float c = cos(-uTilt);
  float s = sin(-uTilt);
  vec2 p = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  float b = length(p);
  // Far from the hole there is nothing of it (its bloom is under 1% there): skip the noise, unless a burst is on.
  if (b > 5.5 && uFlash < 0.001 && uShockA < 0.001) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float shadow = 1.0 - smoothstep(0.985, 1.0, b);

  // The disk, seen nearly edge-on: its own radius and angle.
  vec2 d = vec2(p.x, p.y / uRatio);
  float rd = length(d);
  float ang = atan(d.y, d.x);
  float inner = 1.55;
  float outer = 4.6;
  // Kepler: angular speed ~ r^-1.5 — the inner plasma laps the outer.
  float turn = ang + uT * uSpin * pow(inner / max(rd, inner), 1.5);
  float band = smoothstep(inner, inner + 0.22, rd) * (1.0 - smoothstep(outer * 0.55, outer, rd));
  float streaks = fbm(vec2(rd * 2.6, turn * 2.2)) * 0.7 + fbm(vec2(rd * 9.0, turn * 5.0)) * 0.45;
  float temp = clamp(1.15 - (rd - inner) / (outer - inner) * 1.3, 0.0, 1.0);
  float doppler = 1.0 + 0.65 * (-d.x / max(rd, 0.001));
  float disk = band * (0.35 + streaks) * doppler;
  float front = step(0.0, p.y);
  vec3 light = heat(temp) * disk * (front + (1.0 - front) * (1.0 - shadow)) * 1.25;

  // The far disk bent over the top and under the bottom of the shadow.
  float la = atan(p.y, p.x);
  float lensTurn = la + uT * uSpin * 0.55;
  float over = exp(-pow((b - 1.2) / 0.13, 2.0)) * smoothstep(-0.15, 0.7, -p.y / max(b, 0.001)) * 2.2;
  float under = exp(-pow((b - 1.1) / 0.06, 2.0)) * smoothstep(0.0, 0.8, p.y / max(b, 0.001)) * 1.1;
  float lens = (over + under) * (0.55 + 0.7 * fbm(vec2(b * 6.0, lensTurn * 3.0))) * (1.0 + 0.5 * (-p.x / max(b, 0.001)));
  light += heat(0.78) * lens * (1.0 - shadow) * 1.3;

  // The photon ring, and a warm bloom round it all.
  light += vec3(1.0, 0.95, 0.88) * exp(-pow((b - 1.025) / 0.022, 2.0)) * 1.6 * (1.0 - shadow);
  light += heat(0.55) * exp(-(b - 1.0) * 1.3) * 0.22 * step(1.0, b);

  light *= uGlow * uFade;
  // The burst: a shock wave running ahead of the horizon, and a white flash from the centre.
  float px = length(fc - uC);
  light += vec3(1.0, 0.86, 0.62) * uShockA * exp(-pow((px - uShockR) / (uR * 0.08 + 10.0), 2.0));
  light += vec3(1.0, 0.95, 0.88) * uFlash * 2.5 * exp(-max(b - 1.0, 0.0) * 0.08);
  // Filmic: bright stays bright without clipping to flat white.
  vec3 col = 1.0 - exp(-light * 1.5);
  float glowA = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  float a = max(shadow, glowA);
  // Premultiplied: over the shadow the light is laid on black; elsewhere it carries its own alpha.
  gl_FragColor = vec4(col, a);
}
`;

export interface HoleFrame {
  /** The burst: its flash (0…1), its shock wave's radius (CSS px) and strength. */
  flash?: number;
  shockR?: number;
  shockA?: number;
  /** The hole's own light, 0…1 (gone in the burst, so no ring hangs at the screen's edge). */
  fade?: number;
  /** Centre in CSS px. */
  x: number;
  y: number;
  /** Shadow radius in CSS px. */
  r: number;
  t: number;
  spin: number;
  glow: number;
}

const compile = (gl: WebGLRenderingContext, type: number, src: string) => {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("hole-gl:", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
};

/** A renderer on its own canvas (full screen); null where WebGL is not to be had. */
export const createHoleRenderer = (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("hole-gl:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  // One triangle over the whole screen.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const loc = { c: u("uC"), fade: u("uFade"), flash: u("uFlash"), glow: u("uGlow"), r: u("uR"), ratio: u("uRatio"), res: u("uRes"), shockA: u("uShockA"), shockR: u("uShockR"), spin: u("uSpin"), t: u("uT"), tilt: u("uTilt") };
  let dpr = 1;
  const size = () => {
    // The shader runs per pixel over the whole screen: capped at 1.5×, and at 1× on a big screen, to keep it light.
    dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth * window.innerHeight > 1_600_000 ? 1 : 1.5);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  size();
  let drawn = false;
  return {
    clear: () => {
      if (!drawn) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawn = false;
    },
    dispose: () => {
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
    draw: (f: HoleFrame) => {
      gl.uniform2f(loc.res, canvas.width, canvas.height);
      gl.uniform2f(loc.c, f.x * dpr, f.y * dpr);
      gl.uniform1f(loc.r, Math.max(1, f.r * dpr));
      gl.uniform1f(loc.t, f.t);
      gl.uniform1f(loc.spin, f.spin);
      gl.uniform1f(loc.glow, f.glow);
      gl.uniform1f(loc.tilt, -0.1);
      gl.uniform1f(loc.ratio, 0.16);
      gl.uniform1f(loc.flash, f.flash ?? 0);
      gl.uniform1f(loc.fade, f.fade ?? 1);
      gl.uniform1f(loc.shockR, (f.shockR ?? 0) * dpr);
      gl.uniform1f(loc.shockA, f.shockA ?? 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawn = true;
    },
    size,
  };
};
