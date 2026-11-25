// Criterion S26: on one dataset the figures of `replayLimits` + `forecastNextMonth` equal the calculator's.
// Two datasets: the live install (11 people, loaded from the calculator file into schema `live`, dropped after) and
// the synthetic 1000 seats (fed to the very same calculator code). Randomised scenarios, per tariff.
//
// What is compared: per person — spent, rejected, stopped, requests, 5-hour windows hit, weeks hit, active weeks,
// the most expensive week/window without limits; per tariff — average models per seat, margin, worst-case margin,
// share of person-weeks hit, share rejected. Nothing from the calculator's data is printed except pass/fail counts.
import { openCalculator, type CalcData, type CalcState, type Calculator } from "./calculator.ts";
import { connect, type Sql } from "./db.ts";
import {
  MIN,
  MONTH_DAYS,
  forecastNextMonth,
  replayLimits,
  type Options,
  type Tariff,
} from "./forecast.ts";
import { generate } from "./generate.ts";
import { loadRuns, loadSeats } from "./load.ts";
import { insertRuns } from "./seed.ts";
import { WINDOW_END, WINDOW_START } from "./scenario.ts";

const REL = 1e-9;
const close = (a: number, b: number) =>
  Object.is(a, b) ||
  (Number.isNaN(a) && Number.isNaN(b)) ||
  Math.abs(a - b) <= REL * Math.max(1, Math.abs(a), Math.abs(b));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Dataset = {
  name: string;
  calc: Calculator;
  schema: string;
  org: string;
  /** Seats taken into the comparison (all when absent). */
  activeIds?: Set<string>;
  window: [number, number];
};

type Scenario = {
  calc: CalcState;
  tiers: { price: number; l5: number | null; lw: number | null }[];
};

function scenarios(calc: Calculator, n: number, seed: number): Scenario[] {
  const r = rng(seed);
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const modelKeys = ["actual", ...Object.keys(calc.models)];
  const prices = [3000, 6000, 12000];
  const out: Scenario[] = [];
  for (let i = 0; i < n; i++) {
    const vat = pick([22, 0]);
    const infra = pick([0, 100, 300]);
    const lim = i % 5 === 0 ? "none" : i % 5 === 1 ? "default" : "random";
    const tiers = prices.map((price, k) => {
      const week = Math.floor(((price / (1 + vat / 100) - infra) * 7) / MONTH_DAYS / 10) * 10;
      if (lim === "none") return { price, l5: null, lw: null };
      const f = lim === "default" ? 1 : 0.05 + r() * 1.5;
      const f5 = lim === "default" ? 1 : 0.05 + r() * 1.5;
      return {
        price,
        lw: Math.max(10, Math.round(week * f)),
        l5: k === 2 ? null : Math.max(5, Math.round((week / 3) * f5)),
      };
    });
    out.push({
      calc: {
        ...calc.defaults,
        vat,
        infra,
        fx: pick([75, 90, 100]) + (r() < 0.5 ? 0 : 0.5),
        markup: pick([0, 3, 5, 8]),
        weekMode: pick(["calendar", "rolling"] as const),
        model: pick(modelKeys),
        growth: pick([1, 1, 1.5, 3]),
        memory: r() < 0.5,
        price: 0,
        l5: null,
        lw: null,
      },
      tiers,
    });
  }
  return out;
}

async function compare(sql: Sql, ds: Dataset, count: number, seed: number) {
  // The calculator counts a seat from its first run; align ours to it so that seat days are the same.
  const seats = (await loadSeats(sql, ds.schema, ds.org))
    .filter((s) => !ds.activeIds || ds.activeIds.has(s.id))
    .map((s, i) => ({ ...s, since: ds.calc.firstAt[i]! }));
  const runs = await loadRuns(sql, ds.schema, ds.org, seats, ds.window[0], ds.window[1]);
  let checks = 0;
  const fails: string[] = [];
  let worst = 0;
  // Coverage: how many person-scenarios actually exercised each branch of the replay.
  const cov = { blocked: 0, stopped: 0, hit5: 0, hitW: 0, rolling: 0, repriced: 0 };
  const eq = (what: string, a: number, b: number) => {
    checks++;
    if (!close(a, b)) {
      if (fails.length < 12) fails.push(`${what}: ts=${a} calc=${b}`);
      else if (fails.length === 12) fails.push("…");
    } else if (Number.isFinite(a) && Number.isFinite(b))
      worst = Math.max(worst, Math.abs(a - b) / Math.max(1, Math.abs(b)));
  };
  const sc = scenarios(ds.calc, count, seed);
  sc.forEach((s, si) => {
    const tariffs: Tariff[] = s.tiers.map((t, k) => ({
      id: String(k),
      name: String(k),
      price: t.price,
      vatPct: s.calc.vat,
      limit5h: t.l5,
      limitWeek: t.lw,
      seatsNext: seats.filter((x) => x.tariff === k).length,
    }));
    const o: Options = {
      fx: s.calc.fx,
      markup: s.calc.markup,
      platformVat: s.calc.vat as 0 | 22,
      model: s.calc.model === "actual" ? null : ds.calc.models[s.calc.model]!,
      memoryUsdPerRequest: s.calc.memory ? ds.calc.memoryUsd : 0,
      growth: s.calc.growth,
      weekMode: s.calc.weekMode,
      tzOffset: 3 * 3600e3,
      infraPerSeat: s.calc.infra,
      windowStart: ds.window[0],
      windowEnd: ds.window[1],
    };
    const users = replayLimits(runs, seats, tariffs, o);
    const fc = forecastNextMonth(users, seats, tariffs, o);
    s.tiers.forEach((t, k) => {
      const cs: CalcState = { ...s.calc, price: t.price, l5: t.l5, lw: t.lw };
      const lim = ds.calc.replay(cs, true).users;
      const free = ds.calc.replay(cs, false).users;
      const idx = seats.map((x, i) => (x.tariff === k ? i : -1)).filter((i) => i >= 0);
      const tag = `#${si} t${k}`;
      for (const i of idx) {
        const a = users[i]!;
        const l = lim[i]!;
        const f = free[i]!;
        cov.blocked += l.blocked > 0 ? 1 : 0;
        cov.stopped += l.stopped > 0 ? 1 : 0;
        cov.hit5 += l.hit5 > 0 ? 1 : 0;
        cov.hitW += l.hitW > 0 ? 1 : 0;
        cov.rolling += s.calc.weekMode === "rolling" ? 1 : 0;
        cov.repriced += s.calc.model === "actual" ? 0 : 1;
        eq(`${tag} u${i} spent`, a.spent, l.spent);
        eq(`${tag} u${i} blocked`, a.blocked, l.blocked);
        eq(`${tag} u${i} stopped`, a.stopped, l.stopped);
        eq(`${tag} u${i} chats`, a.chats, l.chats);
        eq(`${tag} u${i} hit5`, a.hit5, l.hit5);
        eq(`${tag} u${i} hitW`, a.hitW, l.hitW);
        eq(`${tag} u${i} weeks`, a.weeks, l.weeks);
        eq(`${tag} u${i} maxWeekFree`, a.maxWeekFree, f.maxW);
        eq(`${tag} u${i} max5Free`, a.max5Free, f.max5);
      }
      // Tariff level, by the calculator's own formulas (its `render()` over the tariff's people).
      const seatMonths = idx.reduce((s2, i) => s2 + ds.calc.tenureDays[i]!, 0) / MONTH_DAYS;
      const avg = idx.reduce((s2, i) => s2 + lim[i]!.spent, 0) / seatMonths;
      const net = t.price / (1 + s.calc.vat / 100);
      const worst = t.lw === null ? Number.NaN : (t.lw * MONTH_DAYS) / 7;
      const pw = idx.reduce((s2, i) => s2 + lim[i]!.weeks, 0);
      const pwHit = idx.reduce((s2, i) => s2 + lim[i]!.hitW, 0);
      const chats = idx.reduce((s2, i) => s2 + lim[i]!.chats, 0);
      const blocked = idx.reduce((s2, i) => s2 + lim[i]!.blocked, 0);
      const f = fc.tariffs[k]!;
      eq(`${tag} avg`, f.perSeat.models, avg);
      eq(`${tag} margin`, f.perSeat.margin, net - avg - s.calc.infra);
      eq(`${tag} worstMargin`, f.perSeat.worstMargin, net - worst - s.calc.infra);
      eq(`${tag} shareWeeksHit`, f.shareWeeksHit, pw ? pwHit / pw : 0);
      eq(`${tag} shareRejected`, f.shareRejected, chats ? blocked / chats : 0);
      eq(`${tag} usersHit5`, f.usersHit5, idx.filter((i) => lim[i]!.hit5 > 0).length);
      eq(
        `${tag} stopped`,
        f.stopped,
        idx.reduce((s2, i) => s2 + lim[i]!.stopped, 0),
      );
      eq(
        `${tag} nearLimit`,
        f.nearLimit,
        t.lw === null ? 0 : idx.filter((i) => free[i]!.maxW >= 0.8 * t.lw!).length,
      );
      eq(`${tag} month.models`, f.month.models, tariffs[k]!.seatsNext * avg);
    });
  });
  const ok = fails.length === 0;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${ds.name}: ${seats.length} seats, ${runs.length} runs, ${sc.length} scenarios, ` +
      `${checks} comparisons, max relative difference ${worst.toExponential(1)}`,
  );
  console.log(
    `     person-scenarios with: ${Object.entries(cov)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
  fails.forEach((f) => console.log("   ", f));
  return ok;
}

const sql = connect();
let ok = true;

// 1. Live set: from the calculator file into schema `live`.
{
  const calc = openCalculator();
  const tiers = calc.users.map((_, i) => (i < 6 ? 0 : i < 9 ? 1 : 2));
  const both = calc.events.filter((e) => e[3] > 0 && e[4] > 0).length;
  if (both)
    console.log(
      `note: ${both} live runs have both a dollar and a ruble cost; they cannot be one \`cost\`+\`currency\``,
    );
  await insertRuns(
    sql,
    "live",
    "live",
    calc.users.map((id, i) => ({ id, tariff: tiers[i]!, since: calc.firstAt[i]! })),
    calc.events.map((e) => ({
      user: e[0],
      t: e[1],
      purpose: e[2] ? "chat" : "memory",
      usd: e[3],
      rub: e[4],
      tin: e[5],
      tc: e[6],
      tout: e[7],
    })),
  );
  ok =
    (await compare(
      sql,
      {
        name: "live (11 people)",
        calc,
        schema: "live",
        org: "live",
        window: [calc.start, calc.end],
      },
      300,
      1,
    )) && ok;
  await sql.unsafe("drop schema live cascade");
}

// 2. Synthetic set (already in `public`, see seed.ts), fed to the same calculator code. The calculator cannot hold
// a person without a single run, so seats that never wrote are left out of this comparison on both sides.
{
  const { seats, runs } = generate();
  const active = [...new Set(runs.map((r) => r.user))].sort((x, y) => x - y);
  const calcIdx = new Map(active.map((u, i) => [u, i]));
  const data: CalcData = {
    start: new Date(WINDOW_START).toISOString(),
    end: new Date(WINDOW_END).toISOString(),
    users: active.map((u) => seats[u]!.id),
    ev: runs.map((r) => [
      calcIdx.get(r.user)!,
      (r.t - WINDOW_START) / MIN,
      r.purpose === "chat" ? 1 : 0,
      r.usd,
      0,
      r.tin,
      r.tc,
      r.tout,
    ]),
  };
  const calc = openCalculator(data);
  const ds: Dataset = {
    name: "synthetic (1000 seats, active ones)",
    calc,
    schema: "public",
    org: "org1",
    activeIds: new Set(data.users),
    window: [WINDOW_START, WINDOW_END],
  };
  ok = (await compare(sql, ds, 12, 2)) && ok;
}

await sql.end();
process.exit(ok ? 0 : 1);
