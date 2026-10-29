import { checkHealth } from "@metobe/core/health";
import { ensureSecretsCanary } from "@metobe/core/secrets";
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

// New releases on GitHub (D35): asked at most every six hours, so the admin's dot appears without anyone looking.
const releases = async () => {
  try {
    await getUpdates();
  } catch (error) {
    console.error("worker: update check", error);
  }
};
const updates = setInterval(releases, 60 * 60_000);

const shutdown = () => {
  clearInterval(keepAlive);
  clearInterval(updates);
  console.log("worker stopping");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

try {
  const health = await checkHealth();
  // The worker decrypts secrets too, so it must not start with a key the installation does not know.
  await ensureSecretsCanary();
  console.log(
    `worker started, db: ${health.services.db}, s3: ${health.services.s3}`
  );
  void releases();
} catch (error) {
  console.error(error);
  process.exit(1);
}
