import { checkHealth } from "@metobe/core/health";
import { sendDueDigests } from "@metobe/core/memory-digest";
import { startMemoryWorker } from "@metobe/core/memory-queue";
import { ensureSecretsCanary } from "@metobe/core/secrets";
import { startTasksWorker } from "@metobe/core/tasks-worker";
import { startTelegramWorker } from "@metobe/core/telegram-bot";
import { getUpdates } from "@metobe/core/updates";

// Periodic DB check keeps the process alive until BullMQ workers hold the event loop.
const keepAlive = setInterval(async () => {
  const health = await checkHealth();
  if (health.status !== "ok") {
    console.error(
      `worker: unhealthy — db ${health.services.db}, s3 ${health.services.s3}`
    );
  }
}, 60_000);

// New releases on GitHub (D35): asked at most every hour, so the admin's dot appears without anyone looking.
const releases = async () => {
  try {
    await getUpdates();
  } catch (error) {
    console.error("worker: update check", error);
  }
};
const updates = setInterval(releases, 60 * 60_000);

// The morning digests (D43): each minute, whoever's chosen time has come. One run at a time.
let digesting = false;
const digests = setInterval(async () => {
  if (digesting) {
    return;
  }
  digesting = true;
  try {
    await sendDueDigests();
  } finally {
    digesting = false;
  }
}, 60_000);

// Periodic tasks (ARCH §16): the minute tick and the runs, through BullMQ on REDIS_URL.
let stopTasks: (() => Promise<void>) | null = null;
// The memory's silent writer (ARCH §19.4), on the same Redis; it reads nothing while no model holds the job.
let stopMemory: (() => Promise<void>) | null = null;
// The bot that binds users' Telegram chats (D43): reads its updates while the installation has a token.
let stopTelegram: (() => void) | null = null;

const shutdown = async () => {
  clearInterval(keepAlive);
  clearInterval(updates);
  clearInterval(digests);
  console.log("worker stopping");
  // A run in progress is let go: its job comes back to the queue and runs again on the next start.
  stopTelegram?.();
  await stopTasks?.().catch((error: unknown) =>
    console.error("worker: tasks stop", error)
  );
  await stopMemory?.().catch((error: unknown) =>
    console.error("worker: memory stop", error)
  );
  process.exit(0);
};

process.on("SIGTERM", async () => {
  try {
    await shutdown();
  } catch (error) {
    console.error(error);
  }
});
process.on("SIGINT", async () => {
  try {
    await shutdown();
  } catch (error) {
    console.error(error);
  }
});

try {
  const health = await checkHealth();
  // The worker decrypts secrets too, so it must not start with a key the installation does not know.
  await ensureSecretsCanary();
  console.log(
    `worker started, db: ${health.services.db}, s3: ${health.services.s3}`
  );
  void releases();
  stopTelegram = startTelegramWorker();
  if (stopTelegram) {
    console.log("worker: telegram bot on");
  }
  if (process.env.REDIS_URL) {
    stopTasks = await startTasksWorker();
    stopMemory = startMemoryWorker();
    console.log("worker: tasks and memory on");
  } else {
    console.log("worker: tasks and memory off — no REDIS_URL");
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
