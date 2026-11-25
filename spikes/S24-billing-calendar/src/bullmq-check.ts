// How a BullMQ job scheduler behaves when the worker is down — the «запуск с опозданием» case of S24.
// Redis keys only under the prefix `spike:s24`, removed at the end.
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { createClient } from "redis";

const url = "redis://127.0.0.1:6380";
// The way core/tasks-queue.ts connects: a node-redis client handed to BullMQ.
const conn = () =>
  createClient({ url }).on("error", (e) =>
    console.error("redis", e)
  ) as unknown as ConnectionOptions;

const prefix = "spike:s24";
const queue = new Queue("billing", { connection: conn(), prefix });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out: Record<string, unknown> = {};

let ran = 0;
const start = () =>
  new Worker(
    "billing",
    async () => {
      ran += 1;
    },
    { concurrency: 1, connection: conn(), prefix }
  );

try {
  // 1. Upserting the same scheduler again changes nothing (what startDispatch() does on each worker start).
  await queue.upsertJobScheduler(
    "billing-tick",
    { every: 500 },
    { name: "tick", data: {} }
  );
  await queue.upsertJobScheduler(
    "billing-tick",
    { every: 500 },
    { name: "tick", data: {} }
  );
  out.schedulers = (await queue.getJobSchedulers()).length;

  // 2. A worker alive for 2.2 s: about 4 runs.
  let worker = start();
  await sleep(2200);
  out.ranWhileAlive = ran;

  // 3. Worker down for 3.5 s (7 intervals), then back.
  await worker.close();
  ran = 0;
  await sleep(3500);
  out.countsAfterDowntime = await queue.getJobCounts(
    "waiting",
    "delayed",
    "active"
  );
  worker = start();
  await sleep(700);
  out.ranInFirst700msAfterRestart = ran;
  await worker.close();

  // 4. Cron with a zone, as the hourly billing tick would be declared.
  await queue.upsertJobScheduler(
    "billing-hourly",
    { pattern: "7 * * * *", tz: "Europe/Moscow" },
    {
      name: "billing",
      data: {},
      opts: { attempts: 3, backoff: { type: "exponential", delay: 60_000 } },
    }
  );
  const sch = await queue.getJobScheduler("billing-hourly");
  out.hourly = {
    pattern: sch?.pattern,
    tz: sch?.tz,
    next: sch?.next ? new Date(sch.next).toISOString() : null,
  };
} finally {
  await queue.obliterate({ force: true });
  await queue.close();
  const c = createClient({ url });
  await c.connect();
  const keys: string[] = [];
  for await (const k of c.scanIterator({ MATCH: `${prefix}:*`, COUNT: 100 })) {
    keys.push(...(Array.isArray(k) ? k : [k]));
  }
  if (keys.length) {
    await c.del(keys);
  }
  out.keysLeftAfterCleanup = (await c.keys(`${prefix}:*`)).length;
  await c.quit();
}
console.log(JSON.stringify(out, null, 2));
process.exit(0);
