import { checkHealth } from "@metobe/core/health";
import { ensureSecretsCanary } from "@metobe/core/secrets";

// Periodic DB check keeps the process alive until BullMQ workers hold the event loop.
const keepAlive = setInterval(async () => {
  const health = await checkHealth();
  if (health.status !== "ok") {
    console.error("worker: database is unreachable");
  }
}, 60_000);

const shutdown = () => {
  clearInterval(keepAlive);
  console.log("worker stopping");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

try {
  const health = await checkHealth();
  // The worker decrypts secrets too, so it must not start with a key the installation does not know.
  await ensureSecretsCanary();
  console.log(`worker started, db: ${health.services.db}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
