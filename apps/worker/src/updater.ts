import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { UPDATE_STEPS } from "@metobe/contracts/updates";
import type {
  UpdateRun,
  UpdateStep,
  UpdateStepKey,
} from "@metobe/contracts/updates";
import { getDb } from "@metobe/core/db";
import { fetchFor } from "@metobe/core/net";
import {
  getUpdateAutomation,
  localUpdateClock,
} from "@metobe/core/update-automation";
import {
  getRollbackCandidate,
  recordUpdate,
} from "@metobe/core/update-history";
import {
  answersInProgress,
  claimUpdateAutomation,
  heartbeat,
  readUpdateRun,
  setDraining,
  takeUpdateRequest,
  writeUpdateRun,
} from "@metobe/core/updater-bus";
import type { UpdateRequest } from "@metobe/core/updater-bus";
import {
  backupsToDrop,
  composeHasUpdater,
  envValue,
  imageRepo,
  pinImage,
} from "@metobe/core/updater-files";
import { fetchReleases } from "@metobe/core/updates";
import type { PublishedRelease } from "@metobe/core/updates";
import { compareVersions } from "@metobe/core/updates-notes";
import { APP_VERSION } from "@metobe/core/version";

// The updater (D35): the one container with docker.sock. It takes no connections — the app asks through Redis
// «update to X», and this checks X is a published release newer than what runs, then: pulls the image while the old
// version works, copies the base, holds new messages while the answers finish, pins X in `.env` and recreates `app`
// and `worker` with the release's compose file, checks the new app is healthy and says X. A failure puts the old
// files back, and the base from the copy when migrations ran. Last, it hands itself over to X's updater.

const exec = promisify(execFile);

/** The installation's folder, mounted at the same path as on the host so compose resolves it the same. */
const DIR = process.env.METOBE_DIR ?? "";
const BACKUPS = "/backups";
const KEEP_BACKUPS = 3;
const APP = "http://app:3000";
const SERVICES = ["app", "worker", "searxng"];
const BACKUP_NAME = /^metobe-\d+\.\d+\.\d+-[\dTZ-]+\.dump$/u;
const VERIFY_SIGNATURES = process.env.METOBE_VERIFY_SIGNATURES !== "0";
const SIGNER =
  "https://github.com/artemavrin/metobe/.github/workflows/ci.yml@refs/heads/main";
const OIDC_ISSUER = "https://token.actions.githubusercontent.com";

const sh = async (cmd: string, args: string[], timeoutMs: number) => {
  try {
    const { stdout } = await exec(cmd, args, {
      cwd: DIR,
      // Compose prefers the process's variables to `.env`, and this process was started with the old METOBE_IMAGE:
      // the file alone must decide.
      env: { HOME: "/root", PATH: process.env.PATH ?? "" },
      maxBuffer: 16 * 1024 * 1024,
      timeout: timeoutMs,
    });
    return stdout.trim();
  } catch (error) {
    // Never the command line: pg_dump's carries the base's password.
    const e = error as { stderr?: string; killed?: boolean; code?: unknown };
    const lines = (e.stderr ?? "").trim().split("\n").filter(Boolean);
    let why = lines.slice(-2).join(" ");
    if (!why) {
      why = e.killed ? "timed out" : `exit ${String(e.code)}`;
    }
    throw new Error(`${cmd}: ${why}`, { cause: error });
  }
};

const compose = (args: string[], timeoutMs = 10 * 60_000) =>
  sh(
    "docker",
    ["compose", "-f", "compose.yml", "--env-file", ".env", ...args],
    timeoutMs
  );

const health = async () => {
  try {
    const res = await fetch(`${APP}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return (await res.json()) as { status?: string; version?: string };
  } catch {
    return null;
  }
};

/** Migrations applied to the base; null when it cannot be asked. */
const countMigrations = async () => {
  try {
    const [row] = await getDb().sql<{ n: number }[]>`
      select count(*)::int as n from drizzle.__drizzle_migrations`;
    return row?.n ?? null;
  } catch {
    return null;
  }
};

const databaseUrl = () => process.env.DATABASE_URL ?? "";

/**
 * X as a release: published, newer than what runs, and with a compose file that keeps an updater. A refusal's message
 * is a word the page knows (`not-a-release`, `not-newer`, `no-updater`).
 */
const resolveTarget = async (to: string, current: string) => {
  const releases = await fetchReleases();
  const release = releases.find((r) => r.version === to);
  if (!release) {
    throw new Error("not-a-release");
  }
  if (compareVersions(to, current) <= 0) {
    throw new Error("not-newer");
  }
  if (!release.compose) {
    throw new Error("no-updater");
  }
  const fetchIt = await fetchFor(null, release.compose);
  const res = await fetchIt(release.compose, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`compose.yml: HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!composeHasUpdater(text)) {
    throw new Error("no-updater");
  }
  return text;
};

const pruneBackups = async (protect?: string) => {
  const names = await readdir(BACKUPS);
  const files = await Promise.all(
    names.map(async (name) => {
      const { mtimeMs } = await stat(path.join(BACKUPS, name));
      return { mtimeMs, name };
    })
  );
  await Promise.all(
    backupsToDrop(files, KEEP_BACKUPS)
      .filter((name) => name !== protect)
      .map((name) => rm(path.join(BACKUPS, name), { force: true }))
  );
};

/** The base as it was in the copy: its schemas dropped whole, so tables a migration added go too. */
const restoreBase = async (file: string) => {
  await getDb().sql.unsafe("drop schema if exists drizzle cascade");
  await getDb().sql.unsafe("drop schema if exists public cascade");
  await sh(
    "pg_restore",
    [
      "--no-owner",
      "--exit-on-error",
      `--dbname=${databaseUrl()}`,
      path.join(BACKUPS, file),
    ],
    30 * 60_000
  );
};

const waitForApp = async (version: string) => {
  let last: Awaited<ReturnType<typeof health>> = null;
  for (let i = 0; i < 30; i += 1) {
    // oxlint-disable-next-line no-await-in-loop -- asking again until it answers, a minute at most
    last = await health();
    if (last?.status === "ok" && last.version === version) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- as above
    await sleep(2000);
  }
  throw new Error(
    last
      ? `/api/health: ${last.status ?? "?"}, version ${last.version ?? "?"}`
      : "/api/health does not answer"
  );
};

const stamp = () => new Date().toISOString().replaceAll(/[:.]/gu, "-");

/** The old files back, the base from the copy when the new version migrated it, and the old app up again. */
const rollback = async (
  envBefore: string,
  composeBefore: string,
  migrationsBefore: number | null,
  run: UpdateRun,
  restoreDatabase = false
): Promise<UpdateRun["restored"]> => {
  try {
    await writeFile(path.join(DIR, "compose.yml"), composeBefore);
    await writeFile(path.join(DIR, ".env"), envBefore);
    const after = await countMigrations();
    const migrated = after === null || after !== migrationsBefore;
    if ((migrated || restoreDatabase) && run.backup) {
      await compose(["stop", "app", "worker"]);
      await restoreBase(run.backup.file);
    }
    await compose(["up", "-d", "--wait", "--wait-timeout", "300", ...SERVICES]);
    return (migrated || restoreDatabase) && run.backup ? "image+db" : "image";
  } catch (error) {
    console.error("updater: rollback failed", error);
    run.error = `${run.error ?? ""} · rollback: ${error instanceof Error ? error.message : String(error)}`;
    return null;
  }
};

/**
 * X's updater takes over: a one-off container of the updater service (already X's image by `.env`) recreates the
 * service, this container with it. Run from here, compose would stop itself halfway.
 */
const handOver = async () => {
  try {
    await compose(
      [
        "run",
        "--detach",
        "--rm",
        "--no-deps",
        "--entrypoint",
        "docker",
        "updater",
        "compose",
        "-f",
        "compose.yml",
        "--env-file",
        ".env",
        "up",
        "--detach",
        "--no-deps",
        "updater",
      ],
      2 * 60_000
    );
  } catch (error) {
    // This updater keeps working; the next update tries again.
    console.error("updater: hand-over failed", error);
  }
};

const update = async (ask: UpdateRequest) => {
  const running = await health();
  const current = running?.version ?? APP_VERSION;
  const run: UpdateRun = {
    backup: null,
    byUserId: ask.byUserId,
    error: null,
    finishedAt: null,
    from: current,
    id: randomUUID(),
    operation: ask.operation,
    restored: null,
    rollbackBackup: null,
    startedAt: new Date().toISOString(),
    status: "running",
    steps: UPDATE_STEPS.map(() => ({ note: {}, status: "waiting" as const })),
    to: ask.to ?? current,
    trigger: ask.trigger,
  };
  const save = () => writeUpdateRun(run);
  let at = 0;
  const step = async <T>(
    key: UpdateStepKey,
    work: (note: UpdateStep["note"]) => Promise<T>
  ) => {
    at = UPDATE_STEPS.indexOf(key);
    const s = run.steps[at] as UpdateStep;
    s.status = "running";
    await save();
    console.log(`updater: ${key}…`);
    const result = await work(s.note);
    s.status = "done";
    await save();
    return result;
  };

  const envPath = path.join(DIR, ".env");
  const composePath = path.join(DIR, "compose.yml");
  let envBefore = "";
  let composeBefore = "";
  let migrationsBefore: number | null = null;
  let touched = false;
  console.log(
    `updater: ${current} → ${run.to} (${run.operation}/${run.trigger})`
  );
  try {
    envBefore = await readFile(envPath, "utf-8");
    composeBefore = await readFile(composePath, "utf-8");
    let rollbackTarget: Awaited<ReturnType<typeof getRollbackCandidate>> = null;
    if (ask.operation === "rollback") {
      rollbackTarget = ask.rollbackRunId
        ? await getRollbackCandidate(ask.rollbackRunId, current)
        : null;
      if (!rollbackTarget || !BACKUP_NAME.test(rollbackTarget.backup.file)) {
        throw new Error("rollback-unavailable");
      }
      const targetFile = path.join(BACKUPS, rollbackTarget.backup.file);
      if (
        !(await stat(targetFile)
          .then((info) => info.isFile())
          .catch(() => false))
      ) {
        throw new Error("rollback-unavailable");
      }
      run.to = rollbackTarget.from;
      run.rollbackBackup = rollbackTarget.backup;
    } else if (!ask.to) {
      throw new Error("not-a-release");
    }

    const repo = imageRepo(
      envValue(envBefore, "METOBE_IMAGE") ?? "ghcr.io/artemavrin/metobe"
    );
    const image = `${repo}:${run.to}`;
    const updaterImage = `${repo}:${current}`;
    const composeNext = await step("pull", async (note) => {
      const text =
        ask.operation === "rollback"
          ? composeBefore
          : await resolveTarget(run.to, current);
      // Versions are immutable: a cached tag is the same artifact as the one previously installed.
      const cached = await sh("docker", ["image", "inspect", image], 30_000)
        .then(() => true)
        .catch(() => false);
      if (!cached) {
        await sh("docker", ["pull", "--quiet", image], 30 * 60_000);
      }
      if (VERIFY_SIGNATURES) {
        try {
          await sh(
            "cosign",
            [
              "verify",
              "--certificate-identity",
              SIGNER,
              "--certificate-oidc-issuer",
              OIDC_ISSUER,
              image,
            ],
            5 * 60_000
          );
        } catch (error) {
          // A cached image recorded as the prior successful install may predate signing.
          // New installs and uncached rollback targets always require a valid signature.
          if (ask.operation !== "rollback" || !cached) {
            throw new Error("bad-signature", { cause: error });
          }
          console.warn(
            `updater: allowing cached legacy rollback image ${image}`
          );
        }
      }
      note.cached = cached;
      note.size =
        Number(
          await sh(
            "docker",
            ["image", "inspect", "--format", "{{.Size}}", image],
            30_000
          )
        ) || undefined;
      return text;
    });
    await step("backup", async (note) => {
      migrationsBefore = await countMigrations();
      const file = `metobe-${current}-${stamp()}.dump`;
      await sh(
        "pg_dump",
        [
          "--format=custom",
          `--file=${path.join(BACKUPS, file)}`,
          `--dbname=${databaseUrl()}`,
        ],
        30 * 60_000
      );
      await chmod(path.join(BACKUPS, file), 0o644);
      const { size } = await stat(path.join(BACKUPS, file));
      note.file = file;
      note.size = size;
      run.backup = { file, size };
      await pruneBackups(rollbackTarget?.backup.file);
    });
    await step("drain", async (note) => {
      await setDraining(true);
      note.answers = await answersInProgress();
      const until = Date.now() + 60_000;
      // oxlint-disable-next-line no-await-in-loop -- waiting for the answers, a minute at most
      while (Date.now() < until && (await answersInProgress()) > 0) {
        // oxlint-disable-next-line no-await-in-loop -- as above
        await sleep(1000);
      }
    });
    await step("restart", async (note) => {
      touched = true;
      if (ask.operation === "rollback" && rollbackTarget) {
        await compose(["stop", "app", "worker"]);
        await restoreBase(rollbackTarget.backup.file);
        await writeFile(envPath, pinImage(envBefore, image, updaterImage));
      } else {
        await writeFile(composePath, composeNext);
        await writeFile(envPath, pinImage(envBefore, image, image));
      }
      await compose([
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "300",
        ...SERVICES,
      ]);
      const after = await countMigrations();
      if (
        ask.operation !== "rollback" &&
        after !== null &&
        migrationsBefore !== null
      ) {
        note.migrations = after - migrationsBefore;
      }
    });
    await step("check", () => waitForApp(run.to));
    run.status = "done";
  } catch (error) {
    console.error("updater: failed", error);
    (run.steps[at] as UpdateStep).status = "failed";
    run.status = "failed";
    run.error = error instanceof Error ? error.message : String(error);
    if (touched) {
      run.restored = await rollback(
        envBefore,
        composeBefore,
        migrationsBefore,
        run,
        ask.operation === "rollback"
      );
    }
  } finally {
    await setDraining(false);
    run.finishedAt = new Date().toISOString();
    await save();
    await recordUpdate(run).catch((error: unknown) =>
      console.error("updater: history", error)
    );
  }
  console.log(`updater: ${run.status}`);
  if (run.status === "done") {
    await pruneBackups().catch((error: unknown) =>
      console.error("updater: backup cleanup", error)
    );
    await handOver();
  }
};

/** A run cut short — the host went down, the container was killed: it failed, and messages go through again. */
const closeInterrupted = async () => {
  const last = await readUpdateRun();
  if (last?.status !== "running") {
    return;
  }
  const run: UpdateRun = {
    ...last,
    error: "interrupted",
    finishedAt: new Date().toISOString(),
    status: "failed",
    steps: last.steps.map((s) =>
      s.status === "running" ? { ...s, status: "failed" } : s
    ),
  };
  await setDraining(false);
  await writeUpdateRun(run);
  await recordUpdate(run).catch((error: unknown) =>
    console.error("updater: history", error)
  );
};

const beat = async () => {
  try {
    await heartbeat(APP_VERSION);
  } catch (error) {
    console.error("updater: heartbeat", error);
  }
};

const AUTOMATION_CHECK_MS = 60_000;
const RELEASE_CACHE_MS = 15 * 60_000;
let automationCheckAt = 0;
let releaseCheckAt = 0;
let releaseCache: PublishedRelease[] = [];

const releasesForAutomation = async () => {
  if (Date.now() < releaseCheckAt) {
    return releaseCache;
  }
  releaseCheckAt = Date.now() + RELEASE_CACHE_MS;
  try {
    releaseCache = await fetchReleases();
    return releaseCache;
  } catch (error) {
    releaseCache = [];
    console.error("updater: scheduled release check", error);
    return null;
  }
};

/** Checks the saved opt-in schedule once a minute and makes at most one automatic request per release/date. */
const runScheduledUpdate = async () => {
  if (Date.now() < automationCheckAt) {
    return;
  }
  automationCheckAt = Date.now() + AUTOMATION_CHECK_MS;
  const settings = await getUpdateAutomation();
  if (!settings.autoPatches && settings.nightlyAt === null) {
    return;
  }
  const lastRun = await readUpdateRun();
  if (lastRun?.status === "running") {
    return;
  }
  const appHealth = await health();
  const current = appHealth?.version;
  if (!current) {
    return;
  }
  const fetched = await releasesForAutomation();
  if (!fetched) {
    return;
  }
  const newer = fetched.filter(
    (release) =>
      release.compose &&
      /^\d+\.\d+\.\d+$/u.test(release.version) &&
      compareVersions(release.version, current) > 0
  );
  if (settings.autoPatches) {
    const [major, minor] = current.split(".");
    const patch = newer.find((release) => {
      const [releaseMajor, releaseMinor] = release.version.split(".");
      return releaseMajor === major && releaseMinor === minor;
    });
    if (
      patch &&
      (await claimUpdateAutomation(`patch:${patch.version}`, 24 * 60 * 60))
    ) {
      await update({
        at: new Date().toISOString(),
        byUserId: null,
        operation: "install",
        to: patch.version,
        trigger: "patch",
      });
      return;
    }
  }

  if (settings.nightlyAt !== null) {
    const local = localUpdateClock(new Date(), settings.timeZone);
    if (local.time >= settings.nightlyAt) {
      const [nightly] = newer;
      if (
        nightly &&
        (await claimUpdateAutomation(
          `nightly:${settings.timeZone}:${local.date}`,
          48 * 60 * 60
        ))
      ) {
        await update({
          at: new Date().toISOString(),
          byUserId: null,
          operation: "install",
          to: nightly.version,
          trigger: "nightly",
        });
      }
    }
  }
};

const main = async () => {
  if (!DIR || !existsSync(path.join(DIR, "compose.yml"))) {
    console.error(
      `updater: no compose.yml in METOBE_DIR (${DIR || "not set"}) — rerun install.sh`
    );
    process.exit(1);
  }
  await closeInterrupted();
  await beat();
  setInterval(beat, 20_000);
  console.log(`updater ${APP_VERSION} ready, ${DIR}`);
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- one ask at a time, by design
    const ask = await takeUpdateRequest().catch(() => null);
    if (ask) {
      // oxlint-disable-next-line no-await-in-loop -- one update at a time
      await update(ask);
    } else {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one update at a time; the schedule is rate limited to a minute
        await runScheduledUpdate();
      } catch (error) {
        console.error("updater: scheduled update", error);
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- as above
    await sleep(2000);
  }
};

// PID 1 gets no default signal handling: compose's stop must still end it.
process.on("SIGTERM", () => process.exit(0));

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
