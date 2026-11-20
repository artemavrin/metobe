import { setTimeout as sleep } from "node:timers/promises";

import { createDocker } from "./sandbox/docker";
import { createPool } from "./sandbox/pool";
import type { PoolConfig } from "./sandbox/pool";
import { createSandboxServer } from "./sandbox/server";
import type { Readiness } from "./sandbox/server";

// The sandbox service (D47): the second service with the Docker socket, after the updater. It holds no secrets of the
// app — no database, S3 or model keys, only its own token — and takes no connections from outside the network.
// gVisor (`runsc`) unless the admin set `runc` for development: install.sh turns the sandbox on only with gVisor.

const env = (name: string, fallback: string) => process.env[name] || fallback;
const num = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const token = process.env.SANDBOX_TOKEN ?? "";
if (token.length < 16) {
  console.error("sandbox: SANDBOX_TOKEN is not set (16 characters at least)");
  process.exit(1);
}

const config: PoolConfig = {
  agingSeconds: 60,
  fileBytes: num("SANDBOX_FILE_MB", 25) * 1024 * 1024,
  idleSeconds: num("SANDBOX_IDLE_SECONDS", 300),
  image: env("SANDBOX_IMAGE", "ghcr.io/artemavrin/metobe-sandbox:1"),
  leaseSeconds: 180,
  // Not less: the address-space cap of a run is 3/4 of it, and the image's libraries reserve ~535 MB (pool.ts).
  memoryMb: Math.max(num("SANDBOX_MEMORY_MB", 1024), 1024),
  network: false,
  outputBytes: 40 * 1024,
  perUser: num("SANDBOX_PER_USER", 1),
  runSeconds: 60,
  runtime: env("SANDBOX_RUNTIME", "runsc"),
  total: num("SANDBOX_TOTAL", 4),
  waitSeconds: { chat: 30, task: 300 },
};

const docker = createDocker(env("DOCKER_SOCKET", "/var/run/docker.sock"));
const pool = createPool(docker, config);

let readiness: Readiness = { problem: "docker", ready: false };
let hostMemoryMb: number | undefined;

/** Docker answers, has the runtime, has the image (pulled if missing). Tried again until it holds. */
const prepare = async () => {
  try {
    const info = await docker.info();
    hostMemoryMb = info.MemTotal
      ? Math.round(info.MemTotal / 1024 / 1024)
      : undefined;
    if (!info.Runtimes?.[config.runtime]) {
      readiness = { problem: "runtime", ready: false };
      console.error(
        `sandbox: Docker has no runtime «${config.runtime}» (gVisor: runsc install)`
      );
      return false;
    }
    if (!(await docker.imageExists(config.image))) {
      readiness = { problem: "image", ready: false };
      console.log(`sandbox: pulling ${config.image}`);
      await docker.pull(config.image);
    }
    await pool.clean();
    readiness = { ready: true };
    console.log(`sandbox: ready, ${config.runtime}, ${config.image}`);
    return true;
  } catch (error) {
    console.error("sandbox: not ready", error);
    return false;
  }
};

const server = createSandboxServer({
  config,
  hostMemoryMb: () => hostMemoryMb,
  pool,
  readiness: () => readiness,
  token,
});
server.listen(num("SANDBOX_PORT", 8090), () => {
  console.log(`sandbox: listening on ${num("SANDBOX_PORT", 8090)}`);
});

const sweeper = setInterval(async () => {
  try {
    await pool.sweep();
  } catch (error) {
    console.error("sandbox: sweep", error);
  }
}, 10_000);

const stop = async () => {
  clearInterval(sweeper);
  server.close();
  await pool.close();
  process.exit(0);
};
// PID 1 gets no default signal handling: compose's stop must still end it, with the boxes removed.
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

// Ready once Docker answers with the runtime and the image; asked again every half minute until then.
// oxlint-disable-next-line no-await-in-loop -- one try at a time, by design
while (!(await prepare())) {
  // oxlint-disable-next-line no-await-in-loop -- one try at a time, by design
  await sleep(30_000);
}
