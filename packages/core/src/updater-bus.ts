import "server-only";
import { updateRunSchema } from "@metobe/contracts/updates";
import type { UpdateRun } from "@metobe/contracts/updates";
import { createClient } from "redis";
import { z } from "zod";

// The app and the updater (D35) talk through Redis only: the updater takes no connections. The app asks «update to
// X» and reads how it goes; the updater says it is alive, takes the ask, writes its steps, and holds new messages
// while the answers being written finish — the app tells it how many there are. Without REDIS_URL there is no
// updater to talk to: nothing is alive, nothing is held.

const KEYS = {
  /** The updater's heartbeat: its version, for a minute. */
  alive: "metobe:updater:alive",
  /** Answers being written in the app, as it last said. */
  answers: "metobe:answers",
  /** Atomic claims prevent a schedule from being triggered twice after a worker restart. */
  automation: "metobe:update:auto:",
  /** Set while the updater waits for the answers and restarts: the app takes no new messages. */
  drain: "metobe:update:drain",
  /** «Update to X», waiting for the updater to take it. */
  request: "metobe:update:request",
  /** The current or the last run. */
  run: "metobe:update:run",
};

const requestSchema = z.object({
  at: z.string(),
  byUserId: z.string().nullable(),
  operation: z.enum(["install", "rollback"]).default("install"),
  rollbackRunId: z.string().uuid().optional(),
  to: z.string().nullable().default(null),
  trigger: z.enum(["manual", "patch", "nightly", "rollback"]).default("manual"),
});
export type UpdateRequest = z.infer<typeof requestSchema>;

const connect = async () => {
  const url = z.url().optional().safeParse(process.env.REDIS_URL);
  if (!url.success || !url.data) {
    return null;
  }
  try {
    const client = createClient({ url: url.data }).on("error", (error) =>
      console.error("updater-bus: redis", error)
    );
    await client.connect();
    client.unref();
    return client;
  } catch (error) {
    console.error("updater-bus: redis is not reachable", error);
    // eslint-disable-next-line no-use-before-define -- the next call tries again
    connection = undefined;
    return null;
  }
};

// One connection per process, never keeping it alive (a CLI command must end).
let connection: ReturnType<typeof connect> | undefined;
const redis = () => {
  connection ??= connect();
  return connection;
};

const get = async (key: string) => {
  const client = await redis();
  return client ? client.get(key) : null;
};

const set = async (key: string, value: string, seconds?: number) => {
  const client = await redis();
  await client?.set(key, value, seconds ? { EX: seconds } : undefined);
};

const setIfAbsent = async (key: string, value: string, seconds: number) => {
  const client = await redis();
  return (await client?.set(key, value, { EX: seconds, NX: true })) === "OK";
};

const parse = <T>(raw: string | null | undefined, schema: z.ZodType<T>) => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

// --- the app's side ------------------------------------------------------------------------------

/** The updater's version when it is running; null — no updater on this server, or it is down. */
export const updaterAlive = async () => {
  const alive = parse(await get(KEYS.alive), z.object({ version: z.string() }));
  return alive?.version ?? null;
};

export const readUpdateRun = async () =>
  parse(await get(KEYS.run), updateRunSchema);

/** Asks the updater to put X on; false when a run is going already or there is no updater to ask. */
export const requestUpdate = async (
  to: string,
  byUserId: string | null,
  trigger: UpdateRequest["trigger"] = "manual"
) => {
  const run = await readUpdateRun();
  if (run?.status === "running" || !(await updaterAlive())) {
    return false;
  }
  const ask: UpdateRequest = {
    at: new Date().toISOString(),
    byUserId,
    operation: "install",
    to,
    trigger,
  };
  // Not taken in two minutes — the updater is gone; the ask goes too, so it does not fire much later.
  return setIfAbsent(KEYS.request, JSON.stringify(ask), 120);
};

export const requestRollback = async (
  rollbackRunId: string,
  byUserId: string
) => {
  const run = await readUpdateRun();
  if (run?.status === "running" || !(await updaterAlive())) {
    return false;
  }
  const ask: UpdateRequest = {
    at: new Date().toISOString(),
    byUserId,
    operation: "rollback",
    rollbackRunId,
    to: null,
    trigger: "rollback",
  };
  return setIfAbsent(KEYS.request, JSON.stringify(ask), 120);
};

/** Whether new messages wait: the updater is finishing the answers and restarting the app. */
export const isDraining = async () => (await get(KEYS.drain)) !== null;

/** How many answers this app is writing, for the updater's wait. */
export const reportAnswers = (count: number) =>
  set(KEYS.answers, String(count), 600);

// --- the updater's side --------------------------------------------------------------------------

/** «I am here»: the app shows the update button while this lasts. */
export const heartbeat = (version: string) =>
  set(KEYS.alive, JSON.stringify({ version }), 60);

/** The waiting ask, taken: no other updater gets it. */
export const takeUpdateRequest = async () => {
  const client = await redis();
  return parse(
    client ? await client.getDel(KEYS.request) : null,
    requestSchema
  );
};

export const writeUpdateRun = (run: UpdateRun) =>
  set(KEYS.run, JSON.stringify(run));

/** Holds new messages; it lapses by itself in 15 minutes should the updater die holding it. */
export const setDraining = async (on: boolean) => {
  if (on) {
    await set(KEYS.drain, "1", 900);
    return;
  }
  const client = await redis();
  await client?.del(KEYS.drain);
};

export const answersInProgress = async () =>
  Number(await get(KEYS.answers)) || 0;

/** Claims an automatic update once across updater restarts. */
export const claimUpdateAutomation = async (key: string, seconds: number) => {
  const client = await redis();
  if (!client) {
    return false;
  }
  return (
    (await client.set(`${KEYS.automation}${key}`, "1", {
      EX: seconds,
      NX: true,
    })) === "OK"
  );
};
