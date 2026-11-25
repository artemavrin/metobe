import { describe, expect, it } from "vitest";

import { markPaid } from "./billing";
import type { Invoice, OrgBillingState } from "./billing";
import { org } from "./fixtures";
import { MemoryStore, runBilling } from "./run";
import { monthStart } from "./time";

const settled = (period: string, tz: string): Invoice => ({
  billedSeats: { normal: 10 },
  dueAt: monthStart(period, tz),
  issuedAt: new Date(monthStart(period, tz).getTime() - 7 * 86_400_000),
  lines: [],
  net: 0,
  paidAt: monthStart(period, tz),
  period,
  status: "paid",
  total: 0,
  vat: 0,
});

const CAST = [
  { id: "msk-pays", pays: true, tz: "Europe/Moscow" },
  { id: "vvo-pays", pays: true, tz: "Asia/Vladivostok" },
  { id: "nyc-pays", pays: true, tz: "America/New_York" },
  { id: "ber-pays", pays: true, tz: "Europe/Berlin" },
  { id: "ber-never", pays: false, tz: "Europe/Berlin" },
  { id: "nyc-never", pays: false, tz: "America/New_York" },
];

const makeStore = () =>
  new MemoryStore(
    CAST.map((c): OrgBillingState =>
      org({
        invoices: [settled("2026-01", c.tz)],
        lastRollover: "2026-01",
        orgId: c.id,
        timeZone: c.tz,
      })
    )
  );

const START = Date.UTC(2026, 0, 1, 0, 0);
const END = Date.UTC(2027, 2, 1, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The superuser marks an invoice paid a day after it was issued, for organizations that pay. */
const payers = async (store: MemoryStore, now: Date) => {
  for (const c of CAST.filter((x) => x.pays)) {
    const s = await store.load(c.id);
    for (const inv of s.invoices) {
      if (
        inv.status === "issued" &&
        inv.issuedAt.getTime() + DAY <= now.getTime()
      ) {
        for (const a of markPaid(s, inv.period, now)) {
          await store.commit(c.id, a);
        }
      }
    }
  }
};

const summary = (store: MemoryStore) =>
  Object.fromEntries(
    [...store.orgs.values()].map((s) => [
      s.orgId,
      {
        // the last one is issued a few days before the end of the window: its payment depends on the schedule
        invoices: s.invoices
          .filter((i) => i.period < "2027-03")
          .map((i) => [i.period, i.total, i.status]),
        status: s.status,
      },
    ])
  );

/** Tiny seeded generator, so a failing schedule can be replayed. */
const rng = (seed: number) => () => {
  seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return seed / 4_294_967_296;
};

const play = async (times: number[]) => {
  const store = makeStore();
  const reports = [];
  for (const t of times) {
    const now = new Date(t);
    await payers(store, now);
    reports.push(await runBilling(store, now));
  }
  return { reports, store };
};

describe("fourteen months, six organizations", () => {
  const hourly: number[] = [];
  for (let t = START; t < END; t += HOUR) {
    hourly.push(t);
  }

  it("hourly job: payers are never disabled, non-payers are disabled once, at the first due date", async () => {
    const { store, reports } = await play(hourly);
    const sum = summary(store);
    for (const c of CAST.filter((x) => x.pays)) {
      const s = sum[c.id]!;
      expect(s.status).toBe("active");
      // 2026-01 settled (given) + invoices for 2026-02 … 2027-02, one each (2027-03 is outside the summary)
      expect(s.invoices).toHaveLength(14);
      expect(new Set(s.invoices.map((i) => i[0])).size).toBe(14);
      expect(s.invoices.every((i) => i[2] === "paid")).toBe(true);
      // every new one is 10 seats + 22 % VAT
      expect(s.invoices.slice(1).every((i) => i[1] === 1_220_000)).toBe(true);
    }
    for (const id of ["ber-never", "nyc-never"]) {
      expect(sum[id]).toEqual({
        invoices: [
          ["2026-01", 0, "paid"],
          ["2026-02", 1_220_000, "overdue"],
        ],
        status: "disabled",
      });
    }
    // The disable moment: the job ran hourly, so it came within the hour of 00:00 local on 1 Feb.
    const all = reports.flatMap((r) => r.applied);
    const disables = all.filter((a) => a.kind === "disableOrg");
    expect(disables.map((a) => a.orgId).sort()).toEqual([
      "ber-never",
      "nyc-never",
    ]);
    const ber = disables.find((a) => a.orgId === "ber-never")!;
    expect(ber.kind === "disableOrg" && ber.effectiveAt.toISOString()).toBe(
      "2026-01-31T23:00:00.000Z"
    );
    // every action once: keys are unique across the whole year
    const keys = all.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    // nobody was reminded after paying, nobody twice
    expect(reports.every((r) => r.duplicates === 0)).toBe(true);
  }, 60_000);

  it("a job that skips days gives the same invoices and the same disabled organizations as the hourly one", async () => {
    const hourlyResult = summary((await play(hourly)).store);
    for (const seed of [1, 2, 3, 4, 5]) {
      const rand = rng(seed);
      const times: number[] = [];
      let skipped = 0;
      for (let day = START; day < END; day += DAY) {
        // never more than two days in a row without a run
        if (skipped < 2 && rand() < 0.4) {
          skipped += 1;
          continue;
        }
        skipped = 0;
        times.push(
          day +
            Math.floor(rand() * 24) * HOUR +
            Math.floor(rand() * 60) * 60_000
        );
      }
      const sparse = await play(times);
      expect(summary(sparse.store), `seed ${seed}`).toEqual(hourlyResult);
    }
  }, 120_000);

  it("the same schedule twice over, every run doubled: the same result and no extra actions", async () => {
    const times = hourly.filter((_, i) => i % 6 === 0);
    const once = await play(times);
    const store = makeStore();
    let applied = 0;
    for (const t of times) {
      const now = new Date(t);
      await payers(store, now);
      applied += (await runBilling(store, now)).applied.length;
      const again = await runBilling(store, now); // the repeat
      expect(again.applied).toEqual([]);
    }
    expect(summary(store)).toEqual(summary(once.store));
    expect(applied).toBe(
      once.reports.reduce((n, r) => n + r.applied.length, 0)
    );
  }, 120_000);
});

describe("workers that overlap", () => {
  const T = new Date("2026-02-25T00:00:00Z");

  it("two runs at once: each action is applied once, the other run sees «duplicate»", async () => {
    const solo = makeStore();
    const soloReport = await runBilling(solo, T);
    const store = makeStore();
    const [a, b] = await Promise.all([
      runBilling(store, T),
      runBilling(store, T),
    ]);
    expect(a.applied.length + b.applied.length).toBe(soloReport.applied.length);
    expect(a.duplicates + b.duplicates).toBe(soloReport.applied.length);
    expect(summary(store)).toEqual(summary(solo));
    expect(store.keys.size).toBe(solo.keys.size);
  });

  it("one organization failing does not stop the rest, and the next run finishes the job", async () => {
    const store = makeStore();
    store.fail = (a) => a.orgId === "msk-pays" && a.kind === "issueInvoice";
    const first = await runBilling(store, T);
    expect(first.failed.map((f) => f.orgId)).toEqual(["msk-pays"]);
    expect(first.applied.some((a) => a.orgId === "vvo-pays")).toBe(true);
    store.fail = null;
    const second = await runBilling(store, T);
    expect(second.failed).toEqual([]);
    expect(second.applied.map((a) => `${a.orgId}:${a.kind}`)).toContain(
      "msk-pays:issueInvoice"
    );
    expect(second.applied.filter((a) => a.orgId !== "msk-pays")).toEqual([]);
  });
});

describe("speed", () => {
  it("1000 organizations, a tick each, on a hot day (the 25th)", async () => {
    const states = Array.from({ length: 1000 }, (_, i) =>
      org({
        invoices: [settled("2026-02", "Europe/Berlin")],
        lastRollover: "2026-02",
        orgId: `o${i}`,
        timeZone: [
          "Europe/Moscow",
          "Europe/Berlin",
          "America/New_York",
          "Asia/Vladivostok",
        ][i % 4]!,
      })
    );
    const store = new MemoryStore(states);
    const t0 = performance.now();
    const r = await runBilling(store, new Date("2026-02-25T12:00:00Z"));
    const hot = performance.now() - t0;
    const t1 = performance.now();
    const quiet = await runBilling(store, new Date("2026-02-25T13:00:00Z"));
    const calm = performance.now() - t1;
    console.info(
      `1000 orgs: 25th ${hot.toFixed(0)} ms (${r.applied.length} actions), next hour ${calm.toFixed(0)} ms (${quiet.applied.length} actions)`
    );
    expect(r.applied.length).toBe(1000);
    expect(quiet.applied.length).toBe(0);
    expect(hot).toBeLessThan(5_000);
  });
});
