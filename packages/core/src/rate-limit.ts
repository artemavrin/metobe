import "server-only";
import { setTimeout as sleep } from "node:timers/promises";

import { createClient } from "redis";
import { z } from "zod";

// How often something may be asked (D17): codes for signing in, per address and per IP, so the form cannot be made a
// mail bomb or a probe. Counters live in Redis when REDIS_URL is set — every process counts together — and in this
// process's memory when it is not (one app process, D2).

interface Counter {
  hit: (key: string, windowSeconds: number) => Promise<number>;
}

const memory = new Map<string, { count: number; until: number }>();

const inMemory: Counter = {
  hit: (key, windowSeconds) => {
    const now = Date.now();
    const found = memory.get(key);
    if (!found || found.until <= now) {
      memory.set(key, { count: 1, until: now + windowSeconds * 1000 });
      return Promise.resolve(1);
    }
    found.count += 1;
    return Promise.resolve(found.count);
  },
};

let counter: Promise<Counter> | undefined;

const noAnswer = async () => {
  await sleep(2000, undefined, { ref: false });
  throw new Error("no answer in 2s");
};

const connect = (): Promise<Counter> => {
  counter ??= (async () => {
    const url = z.url().optional().safeParse(process.env.REDIS_URL);
    if (!url.success || !url.data) {
      return inMemory;
    }
    const client = createClient({ url: url.data }).on("error", (error) =>
      console.error("rate-limit: redis", error)
    );
    try {
      // node-redis retries a refused connection for ever; a sign-in must not wait on it.
      await Promise.race([client.connect(), noAnswer()]);
      client.unref();
      return {
        hit: async (key, windowSeconds) => {
          const count = await client.incr(key);
          if (count === 1) {
            await client.expire(key, windowSeconds);
          }
          return count;
        },
      };
    } catch (error) {
      console.error("rate-limit: redis is not reachable, counting here", error);
      client.destroy();
      return inMemory;
    }
  })();
  return counter;
};

/** Counts one more ask under `key`; false once more than `limit` came in `windowSeconds` (a fixed window). */
export const allow = async (
  key: string,
  limit: number,
  windowSeconds: number
) => {
  const { hit } = await connect();
  return (await hit(`rate:${key}`, windowSeconds)) <= limit;
};

const CODE_WINDOW_SECONDS = 10 * 60;
const CODES_PER_ADDRESS = 5;
const CODES_PER_IP = 20;

/**
 * Whether a sign-in code may be sent now. Asked for every request, whether the address is known or not, so the answer
 * says nothing about it. Without an IP (no proxy header) only the address is counted: one shared bucket for
 * everyone would lock them all out together.
 */
export const mayAskForCode = async (email: string, ip: string | null) => {
  const byAddress = await allow(
    `code:email:${email.toLowerCase()}`,
    CODES_PER_ADDRESS,
    CODE_WINDOW_SECONDS
  );
  const byIp = ip
    ? await allow(`code:ip:${ip}`, CODES_PER_IP, CODE_WINDOW_SECONDS)
    : true;
  return byAddress && byIp;
};
