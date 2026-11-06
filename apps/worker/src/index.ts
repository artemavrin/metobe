import { checkHealth } from "@metobe/core/health";
import { ensureSecretsCanary } from "@metobe/core/secrets";
import { startTasksWorker } from "@metobe/core/tasks-worker";
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

// Periodic tasks (ARCH §16): the minute tick and the runs, through BullMQ on REDIS_URL.
let stopTasks: (() => Promise<void>) | null = null;

const shutdown = async () => {
  clearInterval(keepAlive);
  clearInterval(updates);
  console.log("worker stopping");
  // A run in progress is let go: its job comes back to the queue and runs again on the next start.
  await stopTasks?.().catch((error: unknown) =>
    console.error("worker: tasks stop", error)
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
  if (process.env.REDIS_URL) {
    stopTasks = await startTasksWorker();
    console.log("worker: tasks on");
  } else {
    console.log("worker: tasks off — no REDIS_URL");
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
