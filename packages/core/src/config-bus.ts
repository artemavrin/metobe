import "server-only";
import { createClient } from "redis";
import { z } from "zod";

// `config:changed` (ARCH §7.1): a change to a source, its key or a proxy drops the cached providers and routes in
// every process that holds them — app and worker, and every module copy of them (the dev server bundles route
// handlers apart from server actions, so a copy never hears the other's in-memory reset). Redis pub/sub carries
// it; without REDIS_URL only this process hears. The process that made the change drops its caches at once.

/** What changed: one source, or — without an id — everything (routes, proxies). */
export interface ConfigChange {
  sourceId?: string;
}

const CHANNEL = "config:changed";
const changeSchema = z.object({ sourceId: z.uuid().optional() });

type Handler = (change: ConfigChange) => void;
const handlers = new Set<Handler>();

const notify = (change: ConfigChange) => {
  for (const handler of handlers) {
    handler(change);
  }
};

/** A message from another process; one it cannot read drops everything — a spare reset costs a rebuild only. */
export const receive = (message: string) => {
  let value: unknown;
  try {
    value = JSON.parse(message);
  } catch {
    value = null;
  }
  const parsed = changeSchema.safeParse(value);
  notify(parsed.success ? parsed.data : {});
};

/** All the bus asks of its Redis connection. */
interface Publisher {
  publish: (channel: string, message: string) => Promise<unknown>;
}
let connection: Promise<Publisher | null> | undefined;

// One connection to publish, a duplicate to listen; neither keeps a process alive (a CLI command must end).
const connect = () => {
  connection ??= (async () => {
    const url = z.url().optional().safeParse(process.env.REDIS_URL);
    if (!url.success || !url.data) {
      return null;
    }
    try {
      const client = await createClient({ url: url.data })
        .on("error", (error) => console.error("config: redis", error))
        .connect();
      client.unref();
      const listener = client.duplicate();
      listener.on("error", (error) => console.error("config: redis", error));
      await listener.connect();
      listener.unref();
      await listener.subscribe(CHANNEL, receive);
      return client;
    } catch (error) {
      console.error(
        "config: redis is not reachable, changes stay local",
        error
      );
      connection = undefined;
      return null;
    }
  })();
  return connection;
};

/** Registers a cache to drop on a change, and starts listening to other processes. */
export const onConfigChange = (handler: Handler) => {
  handlers.add(handler);
  void connect();
};

/** A change was made: this process drops its caches now, the others when Redis brings the word. */
export const configChanged = async (change: ConfigChange = {}) => {
  notify(change);
  const client = await connect();
  if (!client) {
    return;
  }
  try {
    await client.publish(CHANNEL, JSON.stringify(change));
  } catch (error) {
    console.error("config: could not announce a change", error);
  }
};
