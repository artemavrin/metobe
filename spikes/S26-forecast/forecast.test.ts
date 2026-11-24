// `replayLimits` against the calculator's recorded answers (golden.json), with no database and no private file.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { replayLimits, runsFromRows, type Options, type Tariff } from "./forecast.ts";
import { generate } from "./generate.ts";
import { GOLDEN_MODEL, GOLDEN_PARAMS, type GoldenScenario } from "./golden-spec.ts";
import { baseOptions } from "./scenario.ts";

type Golden = (GoldenScenario & {
  tiers: (GoldenScenario["tiers"][number] & { users: number[][] })[];
})[];
const golden: Golden = JSON.parse(
  fs.readFileSync(new URL("./golden.json", import.meta.url), "utf8"),
);

const { seats, runs } = generate(GOLDEN_PARAMS);
const active = [...new Set(runs.map((r) => r.user))].sort((x, y) => x - y);
const idx = new Map(active.map((u, i) => [u, i]));
const first = new Map<number, number>();
for (const r of runs) if (!first.has(r.user)) first.set(r.user, r.t);
const live = active.map((u) => ({
  id: seats[u]!.id,
  tariff: seats[u]!.tariff,
  since: first.get(u)!,
}));
const cols = runsFromRows(
  runs.map((r) => [
    idx.get(r.user)!,
    r.t,
    r.purpose === "chat" ? 1 : 0,
    r.usd,
    0,
    r.tin,
    r.tc,
    r.tout,
  ]),
);

const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

for (const sc of golden) {
  test(`replayLimits equals the calculator: ${sc.name}`, () => {
    const tariffs: Tariff[] = sc.tiers.map((t, k) => ({
      id: String(k),
      name: String(k),
      price: t.price,
      vatPct: sc.state.vat,
      limit5h: t.l5,
      limitWeek: t.lw,
      seatsNext: 0,
    }));
    const base = baseOptions();
    const o: Options = {
      ...base,
      fx: sc.state.fx,
      markup: sc.state.markup,
      platformVat: sc.state.vat,
      model: sc.state.model === "x" ? GOLDEN_MODEL : null,
      growth: sc.state.growth,
      weekMode: sc.state.weekMode,
      infraPerSeat: sc.state.infra,
    };
    const res = replayLimits(cols, live, tariffs, o);
    let n = 0;
    let rejected = 0;
    for (const t of sc.tiers) {
      for (const [i, spent, blocked, stopped, chats, hit5, hitW, weeks, maxW, max5] of t.users as [
        number,
        ...number[],
      ][]) {
        const r = res[i]!;
        const got = [
          r.spent,
          r.blocked,
          r.stopped,
          r.chats,
          r.hit5,
          r.hitW,
          r.weeks,
          r.maxWeekFree,
          r.max5Free,
        ];
        const want = [spent, blocked, stopped, chats, hit5, hitW, weeks, maxW, max5] as number[];
        got.forEach((g, k) =>
          assert.ok(close(g, want[k]!), `${live[i]!.id} field ${k}: ${g} vs ${want[k]}`),
        );
        rejected += r.blocked + r.stopped;
        n++;
      }
    }
    assert.ok(n > 50);
    // The scenarios with limits must actually reject something, otherwise the check proves little.
    if (sc.tiers.some((t) => t.lw !== null)) assert.ok(rejected > 0);
  });
}
