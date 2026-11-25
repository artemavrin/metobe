// Part 2 of S22: five tabs and a task at once, a process that dies, a long answer, a race, latency, a flushed Redis.
// Lease and heartbeat are scaled down for the test (LEASE_MS=3000, HB_MS=1000); production values: 30 s and 10 s.
import { type ChildProcess, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { stats } from "./common.ts";
import {
  HEARTBEAT_MS,
  keyOf,
  LEASE_MS,
  LIMIT,
  makeSlots,
  PREFIX,
} from "./slots-lib.ts";

const slots = await makeSlots();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out: Record<string, unknown> = { LEASE_MS, HEARTBEAT_MS, LIMIT };

type Ev = {
  ev: string;
  role: string;
  pid: number;
  t: number;
  id?: string;
  lost?: number;
};
const spawnHolder = (
  role: string,
  attempts: number,
  user: string,
  holdMs: number
) => {
  const p = spawn(
    process.execPath,
    [
      "--env-file=.env",
      "--import",
      "tsx",
      "holder.ts",
      role,
      String(attempts),
      user,
      String(holdMs),
    ],
    {
      env: {
        ...process.env,
        LEASE_MS: String(LEASE_MS),
        HB_MS: String(HEARTBEAT_MS),
      },
      stdio: ["ignore", "pipe", "inherit"],
    }
  );
  const events: Ev[] = [];
  createInterface({ input: p.stdout! }).on("line", (l) =>
    events.push(JSON.parse(l))
  );
  return { p, events };
};
const waitFor = async (cond: () => boolean, timeoutMs: number) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error("timeout");
    await sleep(20);
  }
};
const killAndWaitExit = (p: ChildProcess, sig: NodeJS.Signals) =>
  new Promise<void>((r) => {
    p.once("exit", () => r());
    p.kill(sig);
  });
/** A tab pressing «send» again every 100 ms until it gets in; → ms from `since`. */
const timeToFree = async (user: string, since: number, id: string) => {
  for (;;) {
    if (await slots.acquire(user, id)) return Date.now() - since;
    await sleep(100);
  }
};

// 1. five tabs (process app) and a task (process worker), one person, at the same moment
{
  const user = "alice";
  await slots.client.del(keyOf(user));
  const app = spawnHolder("app", 5, user, 20_000);
  const worker = spawnHolder("worker", 1, user, 20_000);
  await waitFor(
    () =>
      app.events.some((e) => e.ev === "started") &&
      worker.events.some((e) => e.ev === "started"),
    15_000
  );
  const all = [...app.events, ...worker.events];
  const acquired = all.filter((e) => e.ev === "acquired");
  const busy = all.filter((e) => e.ev === "busy");
  out["1. five tabs + a task"] = {
    attempts: acquired.length + busy.length,
    acquired: acquired.length,
    acquiredByRole: acquired.map((e) => e.role),
    busy: busy.length,
    inRedis: await slots.count(user),
  };
  await killAndWaitExit(app.p, "SIGTERM");
  await killAndWaitExit(worker.p, "SIGTERM");
}

// 2. a process dies (SIGKILL): when the slot frees. 6 trials, a waiting tab polls every 100 ms
{
  const times: number[] = [];
  for (let trial = 0; trial < 6; trial++) {
    const user = `bob${trial}`;
    const a = spawnHolder("app", 1, user, 60_000);
    const b = spawnHolder("worker", 1, user, 60_000);
    await waitFor(
      () =>
        a.events.some((e) => e.ev === "started") &&
        b.events.some((e) => e.ev === "started"),
      15_000
    );
    await sleep(Math.random() * HEARTBEAT_MS); // the kill falls at a random point of the heartbeat period
    const killedAt = Date.now();
    await killAndWaitExit(a.p, "SIGKILL");
    times.push(await timeToFree(user, killedAt, `tab-${trial}`));
    await killAndWaitExit(b.p, "SIGKILL");
    await slots.client.del(keyOf(user));
  }
  out["2. SIGKILL: ms until a waiting tab gets the slot"] = {
    ...stats(times),
    samples: times,
    expected: `${LEASE_MS - HEARTBEAT_MS}..${LEASE_MS} (lease − beat period .. lease)`,
  };
}

// 3. graceful stop (SIGTERM, deploy): released at once
{
  const user = "carol";
  const a = spawnHolder("app", 2, user, 60_000);
  await waitFor(() => a.events.some((e) => e.ev === "started"), 15_000);
  const full = !(await slots.acquire(user, "tab"));
  const t0 = Date.now();
  await killAndWaitExit(a.p, "SIGTERM");
  out["3. SIGTERM: ms until a waiting tab gets the slot"] = {
    wasFull: full,
    ms: await timeToFree(user, t0, "tab"),
  };
  await slots.client.del(keyOf(user));
}

// 4. a long answer: 5 × lease, heartbeat keeps the slot, a third tab is refused all the time
{
  const user = "dave";
  const a = spawnHolder("app", 2, user, LEASE_MS * 5);
  await waitFor(() => a.events.some((e) => e.ev === "started"), 15_000);
  let wrongly = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < LEASE_MS * 4) {
    if (await slots.acquire(user, "intruder")) wrongly++;
    await sleep(250);
  }
  out["4. answer 4 × lease long, third tab let in (must be 0)"] = {
    wrongly,
    inRedis: await slots.count(user),
  };
  await killAndWaitExit(a.p, "SIGKILL");
  await slots.client.del(keyOf(user));
}

// 5. a stalled event loop: heartbeat late by more than the lease → slot lost, a third answer gets in (the cost of a short lease)
{
  const user = "erin";
  await slots.client.del(keyOf(user));
  await slots.acquire(user, "a1");
  await slots.acquire(user, "a2");
  await sleep(LEASE_MS + 200); // neither renewed
  const third = await slots.acquire(user, "a3");
  const beatBack = await slots.beat(user, "a1"); // the old holder wakes up: room for one more (a3 + a1 = 2)
  const beatBack2 = await slots.beat(user, "a2"); // and the other one finds no room
  out["5. loop stalled > lease"] = {
    thirdGotIn: third,
    a1BeatTakesSlotBack: beatBack,
    a2BeatFindsNoRoom: !beatBack2,
    inRedis: await slots.count(user),
  };
  await slots.client.del(keyOf(user));
}

// 6. Redis flushed while answers run: heartbeat restores the slots
{
  const user = "frank";
  await slots.acquire(user, "x1");
  await slots.acquire(user, "x2");
  await slots.client.del(keyOf(user)); // as after a restart without persistence
  const during = await slots.acquire(user, "x3"); // a new answer sees an empty counter: lets in (fails open)
  const b1 = await slots.beat(user, "x1");
  const b2 = await slots.beat(user, "x2");
  out["6. key lost"] = {
    newAnswerLetIn: during,
    beatX1: b1,
    beatX2: b2,
    inRedis: await slots.count(user),
    note: "x3 + x1 fill the limit; x2 finds no room, keeps running, only counted as lost",
  };
  await slots.client.del(keyOf(user));
}

// 7. race: 40 clients, one person, 4000 acquire/hold/release cycles; the held counter must never exceed LIMIT
{
  const user = "grace";
  const heldKey = `${PREFIX}held:${user}`;
  await slots.client.del([keyOf(user), heldKey]);
  const clients = await Promise.all(
    Array.from({ length: 40 }, () => makeSlots())
  );
  let maxHeld = 0;
  let got = 0;
  let refused = 0;
  const lat: number[] = [];
  await Promise.all(
    clients.map(async (c, ci) => {
      for (let i = 0; i < 100; i++) {
        const id = `c${ci}-${i}`;
        const t0 = process.hrtime.bigint();
        const ok = await c.acquire(user, id);
        lat.push(Number(process.hrtime.bigint() - t0) / 1e6);
        if (!ok) {
          refused++;
          continue;
        }
        got++;
        const held = await c.client.incr(heldKey);
        maxHeld = Math.max(maxHeld, held);
        await sleep(Math.random() * 5);
        await c.client.decr(heldKey);
        await c.release(user, id);
      }
    })
  );
  out["7. race, 40 clients × 100 cycles"] = {
    got,
    refused,
    maxHeld,
    limit: LIMIT,
    acquireLatencyMsUnderContention: stats(lat),
  };
  await Promise.all(clients.map((c) => c.quit()));
  await slots.client.del([keyOf(user), heldKey]);
}

// 8. latency of acquire / beat / release, one client, no contention
{
  const user = "heidi";
  const a: number[] = [];
  const r: number[] = [];
  for (let i = 0; i < 3000; i++) {
    const t0 = process.hrtime.bigint();
    await slots.acquire(user, "s");
    a.push(Number(process.hrtime.bigint() - t0) / 1e6);
    const t1 = process.hrtime.bigint();
    await slots.release(user, "s");
    r.push(Number(process.hrtime.bigint() - t1) / 1e6);
  }
  out["8. latency, one client"] = { acquire: stats(a), release: stats(r) };
}

// cleanup: only our prefix
let n = 0;
for await (const keys of slots.client.scanIterator({
  MATCH: `${PREFIX}*`,
  COUNT: 500,
})) {
  for (const k of Array.isArray(keys) ? keys : [keys]) {
    await slots.client.del(k);
    n++;
  }
}
out["cleanup: keys left deleted"] = n;
const left = await slots.client.keys(`${PREFIX}*`);
out["keys after cleanup"] = left.length;
writeFileSync("results/slots.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await slots.quit();
