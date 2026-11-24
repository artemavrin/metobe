// Synthetic answers of N seats over 8 weeks. Heavy tail: most people write a little, a few write a lot, and the
// heavy ones also run longer (tool-heavy) answers. Shape parameters (spreads, ratios) follow the live install and
// are rounded; `calibrate.ts` checks the shape. No absolute figures of the live install are kept here.
import { DAY, MIN } from "./forecast.ts";
import { SYNTH_PRICE, TARIFF_SHARE, WINDOW_END, WINDOW_START } from "./scenario.ts";

export type SynthRun = {
  user: number;
  t: number;
  purpose: "chat" | "title" | "memory" | "decide";
  usd: number;
  tin: number;
  tc: number;
  tout: number;
};

export type SynthSeat = { id: string; tariff: number; since: number };

export type GenParams = {
  seats: number;
  seed: number;
  /** Median answers per active person-week and its log-sigma (the tail). */
  weeklyMedian: number;
  weeklySigma: number;
  /** Seats that never write. */
  dormant: number;
  /** Seats that join during the window. */
  joiners: number;
  /** Multiplier of all volumes, for stress runs. */
  volume: number;
};

export const DEFAULTS: GenParams = {
  seats: 1000,
  seed: 26,
  weeklyMedian: 12,
  weeklySigma: 0.7,
  dormant: 0.08,
  joiners: 0.15,
  volume: 1,
};

function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  return { u, normal };
}

const sig = (x: number, d = 4) => Number(x.toPrecision(d));

export function generate(p: GenParams = DEFAULTS): { seats: SynthSeat[]; runs: SynthRun[] } {
  const { u, normal } = rng(p.seed);
  const poisson = (l: number) => {
    if (l > 40) return Math.max(0, Math.round(l + Math.sqrt(l) * normal()));
    const L = Math.exp(-l);
    let k = 0;
    let pr = 1;
    do {
      k++;
      pr *= u();
    } while (pr > L);
    return k - 1;
  };

  // Person traits: how much they write, how heavy their answers are.
  const traits = Array.from({ length: p.seats }, () => {
    const z = normal();
    return {
      z,
      dormant: u() < p.dormant,
      heavy: Math.exp(0.6 * (0.6 * z + 0.8 * normal())),
      since: u() < p.joiners ? WINDOW_START + Math.floor(u() * 50) * DAY : WINDOW_START,
      score: 0.5 * z + Math.sqrt(0.75) * normal(),
    };
  });
  // Tariffs: the busier people are more likely to be on the higher ones, but not strictly.
  const order = traits.map((_, i) => i).sort((a, b) => traits[b]!.score - traits[a]!.score);
  const tariffOf = new Array<number>(p.seats).fill(0);
  const nMax = Math.round(p.seats * TARIFF_SHARE[2]);
  const nPro = Math.round(p.seats * TARIFF_SHARE[1]);
  order.forEach((idx, rank) => {
    tariffOf[idx] = rank < nMax ? 2 : rank < nMax + nPro ? 1 : 0;
  });

  const seats: SynthSeat[] = traits.map((t, i) => ({
    id: `u${String(i).padStart(5, "0")}`,
    tariff: tariffOf[i]!,
    since: t.since,
  }));

  const runs: SynthRun[] = [];
  const dayWeight = [1, 1, 1, 1, 1, 0.12, 0.12]; // Monday first
  const dayCum = dayWeight.reduce<number[]>((a, w) => [...a, (a.at(-1) ?? 0) + w], []);

  for (let i = 0; i < p.seats; i++) {
    const tr = traits[i]!;
    if (tr.dormant) continue;
    for (let w = 0; w < 8; w++) {
      const weekStart = WINDOW_START + w * 7 * DAY;
      const rate =
        p.weeklyMedian * Math.exp(p.weeklySigma * tr.z) * Math.exp(0.5 * normal() - 0.125);
      let n = poisson(rate * p.volume);
      while (n > 0) {
        const size = Math.min(n, 1 + Math.floor(-Math.log(1 - u()) * 4.5));
        n -= size;
        // Day by weight, hour around the middle of the working day with a small night share.
        const r = u() * dayCum[6]!;
        const day = dayCum.findIndex((c) => r < c);
        const hour = u() < 0.06 ? u() * 24 : Math.min(23.9, Math.max(7, 13.5 + 3 * normal()));
        // `weekStart` is Monday 00:00 local, so the offset within the day is local time.
        let t = weekStart + day * DAY + Math.floor(hour * 60) * MIN;
        for (let k = 0; k < size; k++) {
          if (t < tr.since || t >= WINDOW_END) {
            t += Math.max(1, Math.round(4 * Math.exp(0.9 * normal()))) * MIN;
            continue;
          }
          const z1 = normal();
          const z2 = normal();
          const z3 = normal();
          const tin = Math.round(Math.min(600e3, 30e3 * Math.exp(1.6 * z1)));
          const tc = Math.round(
            Math.min(4e6, 300e3 * tr.heavy * Math.exp(1.45 * (0.8 * z1 + 0.6 * z2))),
          );
          const tout = Math.round(Math.min(60e3, 5e3 * Math.exp(1.0 * (0.5 * z1 + 0.87 * z3))));
          const usd = sig(
            (tin * SYNTH_PRICE.in +
              tc * (SYNTH_PRICE.cache ?? SYNTH_PRICE.in) +
              tout * SYNTH_PRICE.out) /
              1e6,
          );
          runs.push({ user: i, t, purpose: "chat", usd, tin, tc, tout });
          // Service runs of this answer: title (first in a session), memory, decision.
          const svc = (purpose: SynthRun["purpose"], dt: number) =>
            runs.push({
              user: i,
              t: t + dt,
              purpose,
              usd: sig(6e-6 * Math.exp(normal())),
              tin: Math.round(300 + u() * 3500),
              tc: 0,
              tout: Math.round(5 + u() * 100),
            });
          if (k === 0) svc("title", 0);
          if (u() < 0.6) svc("memory", 0);
          if (u() < 0.55) svc("decide", 0);
          t += Math.max(1, Math.round(4 * Math.exp(0.9 * normal()))) * MIN;
        }
      }
    }
  }
  runs.sort((a, b) => a.user - b.user || a.t - b.t);
  return { seats, runs };
}

/** `--seats=500 --volume=2` style overrides of the defaults. */
export function paramsFromArgv(argv: string[]): GenParams {
  const p: GenParams = { ...DEFAULTS };
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, "").split("=");
    if (k && k in p) (p as Record<string, number>)[k] = Number(v);
  }
  return p;
}
