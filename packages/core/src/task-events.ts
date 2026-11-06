import "server-only";
import { createClient } from "redis";
import { z } from "zod";

// `tasks:changed` (ARCH §16.5): something about an owner's tasks moved — a run queued, going, stopped for the person
// or ended, a result seen. The worker says it, the app's stream (`/api/notifications/stream`) hears it and tells the
// owner's open tabs, which read again. The word carries no data: nothing to leak, nothing to keep in step. Redis
// pub/sub carries it between processes and forgets what nobody heard, so the pages also look now and then.
// Without REDIS_URL only this process hears — and there is no worker either.

const CHANNEL = "tasks:changed";
const messageSchema = z.object({ ownerId: z.string().min(1) });

type Handler = (ownerId: string) => void;
const handlers = new Set<Handler>();

const notify = (ownerId: string) => {
  for (const handler of handlers) {
    handler(ownerId);
  }
};

/** A message from Redis; one it cannot read is not for anyone. */
export const receive = (message: string) => {
  let value: unknown;
  try {
    value = JSON.parse(message);
  } catch {
    return;
  }
  const parsed = messageSchema.safeParse(value);
  if (parsed.success) {
    notify(parsed.data.ownerId);
  }
};

let listening = false;

const connect = async () => {
  const url = z.url().optional().safeParse(process.env.REDIS_URL);
  if (!url.success || !url.data) {
    return null;
  }
  try {
    const client = await createClient({ url: url.data })
      .on("error", (error) => console.error("task-events: redis", error))
      .connect();
    client.unref();
    return client;
  } catch (error) {
    console.error("task-events: redis is not reachable", error);
    // eslint-disable-next-line no-use-before-define -- the next call tries again
    connection = undefined;
    return null;
  }
};

// One connection to publish, a duplicate to listen (only once someone asks to hear); neither keeps a process alive.
let connection: ReturnType<typeof connect> | undefined;
const redis = () => {
  connection ??= connect();
  return connection;
};

const listen = async () => {
  if (listening) {
    return;
  }
  listening = true;
  const client = await redis();
  if (!client) {
    return;
  }
  try {
    const listener = client.duplicate();
    listener.on("error", (error) => console.error("task-events: redis", error));
    await listener.connect();
    listener.unref();
    await listener.subscribe(CHANNEL, receive);
  } catch (error) {
    console.error("task-events: could not listen", error);
    listening = false;
  }
};

/** Hears every owner's change (the caller keeps its own); the answer stops hearing. */
export const onTasksChanged = (handler: Handler) => {
  handlers.add(handler);
  void listen();
  return () => {
    handlers.delete(handler);
  };
};

/**
 * Says that an owner's tasks moved. With Redis the word goes out and comes back to every process, this one too; without
 * it only this process hears. Never throws: a word that did not go out costs the pages a minute, not a run.
 */
export const announceTasks = async (ownerId: string) => {
  const client = await redis();
  if (!client) {
    notify(ownerId);
    return;
  }
  try {
    await client.publish(CHANNEL, JSON.stringify({ ownerId }));
  } catch (error) {
    console.error("task-events: could not announce", error);
  }
};
