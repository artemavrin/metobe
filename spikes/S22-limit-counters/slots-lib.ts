// The counter of simultaneous answers (ARCH §20.8): at most LIMIT per person, counting tasks, shared by `app` and
// `worker` through Redis. A sorted set per person: member = answer id, score = the moment its lease ends.
// A slot is a lease, not a number: a process that dies stops renewing, and the slot frees itself.
import { createClient } from "redis";

export const PREFIX = "spike:s22:";
export const LIMIT = 2;
export const LEASE_MS = Number(process.env.LEASE_MS ?? 30_000);
export const HEARTBEAT_MS = Number(process.env.HB_MS ?? 10_000);

export const keyOf = (userId: string) => `${PREFIX}inflight:${userId}`;

// Redis TIME inside the script: app and worker may sit on different hosts, their clocks do not matter.
const NOW = `local t = redis.call('TIME'); local now = t[1] * 1000 + math.floor(t[2] / 1000)`;

/** → 1 taken (or already ours), 0 busy. Expired members of dead processes are dropped first. */
const ACQUIRE = `${NOW}
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZSCORE', KEYS[1], ARGV[1]) == false and redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]) * 2)
return 1`;

export const makeSlots = async (url = process.env.REDIS_URL!) => {
  const client = createClient({ url });
  client.on("error", () => {});
  await client.connect();
  const acquireSha = await client.scriptLoad(ACQUIRE);
  const run = (userId: string, id: string) =>
    client.evalSha(acquireSha, {
      keys: [keyOf(userId)],
      arguments: [id, String(LIMIT), String(LEASE_MS)],
    }) as Promise<number>;
  return {
    client,
    /** true — the answer may start. false — «Дождитесь ответа». */
    acquire: async (userId: string, id: string) =>
      (await run(userId, id)) === 1,
    /** Renew the lease. If the slot was lost (lease ran out, Redis was flushed) it is taken again when there is room;
     *  false means "lost and no room": the answer is not killed, the caller only logs it. */
    beat: async (userId: string, id: string) => (await run(userId, id)) === 1,
    release: async (userId: string, id: string) =>
      void (await client.zRem(keyOf(userId), id)),
    count: async (userId: string) => {
      await client.zRemRangeByScore(keyOf(userId), "-inf", Date.now());
      return client.zCard(keyOf(userId));
    },
    quit: () => client.quit(),
  };
};

/** Start of an answer: take a slot and keep it alive. `stop()` releases it (call in `finally`). */
export const hold = async (
  slots: Awaited<ReturnType<typeof makeSlots>>,
  userId: string,
  id: string
) => {
  if (!(await slots.acquire(userId, id))) return null;
  let lost = 0;
  const timer = setInterval(() => {
    slots.beat(userId, id).then(
      (ok) => {
        if (!ok) lost++;
      },
      () => {}
    );
  }, HEARTBEAT_MS);
  return {
    lost: () => lost,
    stop: async () => {
      clearInterval(timer);
      await slots.release(userId, id);
    },
  };
};
