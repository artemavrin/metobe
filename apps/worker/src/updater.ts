import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
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
import { setGuardService } from "@metobe/core/privacy-settings";
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
  readGuardRun,
  readUpdateRun,
  setDraining,
  takeGuardRequest,
  takeUpdateRequest,
  writeGuardRun,
  writeUpdateRun,
} from "@metobe/core/updater-bus";
import type {
  GuardRequest,
  GuardRun,
  UpdateRequest,
} from "@metobe/core/updater-bus";
import {
  backupsToDrop,
  composeHasUpdater,
  envValue,
  imageRepo,
  pinImage,
  profilesOf,
  withGuardKeys,
  withProfile,
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
// It also starts and stops data protection's service (`pii-guard`, profile `pii`) when the admin flips its switch.

const exec = promisify(execFile);

/** The installation's folder, mounted at the same path as on the host so compose resolves it the same. */
const DIR = process.env.METOBE_DIR ?? "";
const BACKUPS = "/backups";
const KEEP_BACKUPS = 3;
/**
 * How long a new version may take to come up, seconds: its migrations run first, and an update over several releases
 * runs all of theirs. Past the app's own start period (10 min in compose.yml), so the health check decides first.
 */
const UP_TIMEOUT = "900";
const APP = "http://app:3000";
const SERVICES = ["app", "worker", "searxng"];
/** Data protection's service and its profile (compose.yml). */
const GUARD = "pii-guard";
const GUARD_PROFILE = "pii";
/** Its model loads in a minute or two; a slow disk or a busy host gets more. */
const GUARD_UP_TIMEOUT = "600";
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
  await getDb().sql.unsafe(
    "create schema public authorization pg_database_owner"
  );
  await getDb().sql.unsafe(
    "grant usage on schema public to public; grant create on schema public to pg_database_owner"
  );
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

/** As install.sh makes them (`openssl rand -hex 24`). */
const guardSecret = () => randomBytes(24).toString("hex");

/** Holds new messages, waits a minute at most for the answers being written, then does `work`; lets them go after. */
const drained = async <T>(work: () => Promise<T>) => {
  await setDraining(true);
  try {
    const until = Date.now() + 60_000;
    // oxlint-disable-next-line no-await-in-loop -- waiting for the answers, a minute at most
    while (Date.now() < until && (await answersInProgress()) > 0) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await sleep(1000);
    }
    return await work();
  } finally {
    await setDraining(false);
  }
};

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
    await compose([
      "up",
      "-d",
      "--wait",
      "--wait-timeout",
      UP_TIMEOUT,
      ...SERVICES,
    ]);
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

/**
 * After an update, data protection's service as the new compose file has it, when it is on. Apart from the update:
 * its failing must not roll the app back. Unchanged, compose leaves it running.
 */
const refreshGuard = async () => {
  try {
    const env = await readFile(path.join(DIR, ".env"), "utf-8");
    if (profilesOf(env).includes(GUARD_PROFILE)) {
      await compose(["up", "-d", "--no-deps", GUARD], 30 * 60_000);
    }
  } catch (error) {
    console.error("updater: data protection after the update", error);
  }
};

/** An image is already on this host: no pull, no network needed. */
const guardImagePresent = async () => {
  const images = await compose(["config", "--images", GUARD], 30_000);
  const image = images.split("\n")[0]?.trim();
  if (!image) {
    return false;
  }
  try {
    await sh("docker", ["image", "inspect", image], 30_000);
    return true;
  } catch {
    return false;
  }
};

/** A start that failed, not left half on: the profile off again, so an update or a hand `up` does not retry it. */
const takeGuardDown = async (envPath: string) => {
  try {
    const env = await readFile(envPath, "utf-8");
    await writeFile(envPath, withProfile(env, GUARD_PROFILE, false));
    await compose(["rm", "--stop", "--force", GUARD]);
  } catch (error) {
    console.error("updater: data protection cleanup", error);
  }
};

/**
 * Data protection's switch: on — the key and token in `.env`, profile `pii` on, the image pulled, the service up with
 * its model loaded, and only then the app told to use it (until then calls go as they did, not refused); the app is
 * recreated when it runs without the token. Off — the app told first, then the service stopped and the profile off.
 */
const setGuard = async (ask: GuardRequest) => {
  const run: GuardRun = {
    error: null,
    finishedAt: null,
    on: ask.on,
    startedAt: new Date().toISOString(),
    status: "running",
    step: null,
  };
  const at = async (step: GuardRun["step"]) => {
    run.step = step;
    await writeGuardRun(run);
    console.log(`updater: data protection, ${step}…`);
  };
  const envPath = path.join(DIR, ".env");
  console.log(`updater: data protection ${ask.on ? "on" : "off"}`);
  try {
    const env = await readFile(envPath, "utf-8");
    if (ask.on) {
      await writeFile(
        envPath,
        withProfile(withGuardKeys(env, guardSecret), GUARD_PROFILE, true)
      );
      if (!(await guardImagePresent())) {
        await at("pull");
        await compose(["pull", "--quiet", GUARD], 30 * 60_000);
      }
      await at("start");
      await compose(
        [
          "up",
          "-d",
          "--no-deps",
          "--wait",
          "--wait-timeout",
          GUARD_UP_TIMEOUT,
          GUARD,
        ],
        12 * 60_000
      );
      if (ask.restartApp) {
        await at("restart");
        await drained(() =>
          compose([
            "up",
            "-d",
            "--no-deps",
            "--wait",
            "--wait-timeout",
            UP_TIMEOUT,
            "app",
            "worker",
          ])
        );
      }
      await setGuardService((s) => ({ ...s, bundled: true }));
    } else {
      await at("stop");
      await setGuardService((s) => ({ ...s, bundled: false }));
      await writeFile(envPath, withProfile(env, GUARD_PROFILE, false));
      await compose(["rm", "--stop", "--force", GUARD]);
    }
    run.status = "done";
  } catch (error) {
    console.error("updater: data protection failed", error);
    run.status = "failed";
    run.error = error instanceof Error ? error.message : String(error);
    if (ask.on) {
      await takeGuardDown(envPath);
    }
  } finally {
    run.finishedAt = new Date().toISOString();
    await writeGuardRun(run);
  }
};

/**
 * A start cut short by a restart of the updater: it failed, and the switch can be flipped again. One with no step yet
 * is the app's ask still waiting: this updater takes it next.
 */
const closeInterruptedGuard = async () => {
  const last = await readGuardRun();
  if (last?.status === "running" && last.step !== null) {
    await writeGuardRun({
      ...last,
      error: "interrupted",
      finishedAt: new Date().toISOString(),
      status: "failed",
    });
  }
};

/** An install from before data protection: its key and token, so the switch has them when flipped. */
const addGuardKeys = async () => {
  const envPath = path.join(DIR, ".env");
  try {
    const env = await readFile(envPath, "utf-8");
    const next = withGuardKeys(env, guardSecret);
    if (next !== env) {
      await writeFile(envPath, next);
      console.log("updater: data protection's key and token added to .env");
    }
  } catch (error) {
    console.error("updater: data protection keys", error);
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
        // An install from before data protection gets its key and token here, so the app starts with them.
        await writeFile(
          envPath,
          withGuardKeys(pinImage(envBefore, image, image), guardSecret)
        );
      }
      await compose([
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        UP_TIMEOUT,
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
    await refreshGuard();
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
  // First: the Redis connection is unref'd, so until a timer holds the process, Node may end it mid-request.
  setInterval(beat, 20_000);
  await closeInterrupted();
  await closeInterruptedGuard();
  await addGuardKeys();
  await beat();
  console.log(`updater ${APP_VERSION} ready, ${DIR}`);
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- one ask at a time, by design
    const ask = await takeUpdateRequest().catch(() => null);
    // oxlint-disable-next-line no-await-in-loop -- as above
    const guard = ask ? null : await takeGuardRequest().catch(() => null);
    if (ask) {
      // oxlint-disable-next-line no-await-in-loop -- one update at a time
      await update(ask);
    } else if (guard) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await setGuard(guard);
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
