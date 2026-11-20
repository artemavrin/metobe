import { randomUUID } from "node:crypto";
import path from "node:path/posix";
import { setTimeout as sleep } from "node:timers/promises";

import type {
  AcquireRequest,
  AcquireResponse,
  ExecResponse,
  SandboxClass,
  SandboxFileEntry,
  SandboxStatus,
} from "@metobe/contracts/sandbox";

import type { Docker } from "./docker";

// Boxes by chat (D47): a box is taken at the first code call of an answer, waits `idleSeconds` after it for the next
// answer in the same chat, then goes. Only busy boxes count against the limits; idle ones go first when room is
// needed — the oldest first, or the person's own idle box in another chat. One service, so the state is here, in
// memory; the containers carry labels, and a restart removes what the last run left.

export const LABEL = "metobe.sandbox";
export const WORKSPACE = "/workspace";

export interface PoolConfig {
  image: string;
  /** The container's command; the image's own when left out (ours copies matplotlib's cache, then sleeps). */
  command?: string[];
  runtime: string;
  total: number;
  perUser: number;
  idleSeconds: number;
  memoryMb: number;
  /** A busy box nobody touched for this long (the app died mid-answer) goes. */
  leaseSeconds: number;
  waitSeconds: Record<SandboxClass, number>;
  /** A task waiting longer than this goes as a chat. */
  agingSeconds: number;
  outputBytes: number;
  fileBytes: number;
  /** A run's time when the caller names none. */
  runSeconds: number;
  /** New boxes reach the internet through Docker's bridge; off — no network at all. */
  network: boolean;
}

export class PoolError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PoolError";
    this.status = status;
  }
}

/** Swallows a failure where the box goes anyway (removal on the way out). */
const ignore = () => null;

interface Box {
  id: string;
  containerId: string;
  key: string;
  userId: string;
  class: SandboxClass;
  busy: boolean;
  createdAt: Date;
  /** Busy: when it goes if nobody touches it; idle: when it goes. */
  until: number;
}

interface Waiter {
  request: AcquireRequest;
  since: number;
  wake: () => void;
}

const MB = 1024 * 1024;

export const containerConfig = (
  config: PoolConfig,
  box: { key: string; userId: string }
) => ({
  ...(config.command ? { Cmd: config.command } : {}),
  HostConfig: {
    CapDrop: ["ALL"],
    Init: true,
    Memory: config.memoryMb * MB,
    MemorySwap: config.memoryMb * MB,
    NanoCpus: 1e9,
    NetworkMode: config.network ? "bridge" : "none",
    PidsLimit: 64,
    ReadonlyRootfs: true,
    Runtime: config.runtime,
    SecurityOpt: ["no-new-privileges"],
    Tmpfs: {
      "/tmp": "rw,nosuid,nodev,size=128m,uid=1000,gid=1000",
      [WORKSPACE]: "rw,nosuid,nodev,size=512m,uid=1000,gid=1000",
    },
  },
  Image: config.image,
  Labels: { [LABEL]: "1", "metobe.sandbox.key": box.key },
  User: "1000:1000",
  WorkingDir: WORKSPACE,
});

/** A path inside the workspace, or null: nothing outside it goes in or out. */
export const inWorkspace = (p: string) => {
  const full = path.normalize(path.isAbsolute(p) ? p : path.join(WORKSPACE, p));
  return full.startsWith(`${WORKSPACE}/`) ? full : null;
};

const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

export const createPool = (
  docker: Docker,
  config: PoolConfig,
  now = () => Date.now()
) => {
  const boxes = new Map<string, Box>();
  const byKey = new Map<string, Box>();
  const waiting: Waiter[] = [];

  const busy = () => [...boxes.values()].filter((b) => b.busy);
  const busyOf = (userId: string) =>
    busy().filter((b) => b.userId === userId).length;

  const wakeNext = () => {
    for (const w of waiting) {
      w.wake();
    }
  };

  const drop = async (box: Box) => {
    boxes.delete(box.id);
    if (byKey.get(box.key) === box) {
      byKey.delete(box.key);
    }
    await docker.remove(box.containerId).catch((error: unknown) => {
      console.error("sandbox: could not remove", box.containerId, error);
    });
    wakeNext();
  };

  /** The waiter to serve next: chats first, a task waiting too long counts as a chat; then the oldest. */
  const firstInLine = () => {
    const at = now();
    const rank = (w: Waiter) =>
      w.request.class === "chat" || at - w.since > config.agingSeconds * 1000
        ? 0
        : 1;
    return waiting.toSorted(
      (a, b) => rank(a) - rank(b) || a.since - b.since
    )[0];
  };

  /** Room for one more busy box of this person, making it by dropping idle ones; false — wait. */
  const makeRoom = async (userId: string) => {
    if (busy().length >= config.total || busyOf(userId) >= config.perUser) {
      return false;
    }
    // The person's own idle box in another chat goes: one person, one box at a time.
    const idle = [...boxes.values()]
      .filter((b) => !b.busy)
      .toSorted((a, b) => a.until - b.until);
    await Promise.all(idle.filter((b) => b.userId === userId).map(drop));
    // Then others' idle boxes, the oldest first, as many as the pool is over.
    const over = boxes.size - config.total + 1;
    if (over > 0) {
      await Promise.all(
        idle
          .filter((b) => b.userId !== userId)
          .slice(0, over)
          .map(drop)
      );
    }
    return boxes.size < config.total;
  };

  const create = async (request: AcquireRequest): Promise<Box> => {
    const { Id } = await docker.create(containerConfig(config, request));
    try {
      await docker.start(Id);
    } catch (error) {
      await docker.remove(Id).catch(ignore);
      throw error;
    }
    const box: Box = {
      busy: true,
      class: request.class,
      containerId: Id,
      createdAt: new Date(now()),
      id: randomUUID(),
      key: request.key,
      until: now() + config.leaseSeconds * 1000,
      userId: request.userId,
    };
    boxes.set(box.id, box);
    byKey.set(box.key, box);
    return box;
  };

  const acquire = async (request: AcquireRequest): Promise<AcquireResponse> => {
    const kept = byKey.get(request.key);
    if (kept) {
      if (kept.busy) {
        throw new PoolError(
          409,
          "This chat's box is busy with another answer."
        );
      }
      kept.busy = true;
      kept.until = now() + config.leaseSeconds * 1000;
      return { boxId: kept.id, fresh: false };
    }
    const waiter: Waiter = { request, since: now(), wake: ignore };
    waiting.push(waiter);
    const deadline = now() + config.waitSeconds[request.class] * 1000;
    try {
      // Waits its turn, a second at a time or until something frees up: one at a time by design.
      for (;;) {
        const turn = firstInLine() === waiter;
        // oxlint-disable-next-line eslint/no-await-in-loop
        const room = turn && (await makeRoom(request.userId));
        if (room) {
          break;
        }
        const left = deadline - now();
        if (left <= 0) {
          throw new PoolError(429, "No room in the sandbox right now.");
        }
        const woken = new AbortController();
        waiter.wake = () => woken.abort();
        // oxlint-disable-next-line eslint/no-await-in-loop
        await sleep(Math.min(left, 1000), null, { signal: woken.signal }).catch(
          ignore
        );
      }
    } finally {
      waiting.splice(waiting.indexOf(waiter), 1);
      wakeNext();
    }
    const box = await create(request);
    return { boxId: box.id, fresh: true };
  };

  const boxOf = (id: string) => {
    const box = boxes.get(id);
    if (!box?.busy) {
      throw new PoolError(410, "The box is gone.");
    }
    box.until = now() + config.leaseSeconds * 1000;
    return box;
  };

  /** Whether the box's container still runs; a dead one is dropped. */
  const stillAlive = async (box: Box) => {
    let alive = false;
    try {
      const state = await docker.inspect(box.containerId);
      alive = state.State.Running;
    } catch {
      alive = false;
    }
    if (!alive) {
      await drop(box);
    }
    return alive;
  };

  /** Runs a command; a box that died under it (gVisor: out of memory for all of it) is dropped and said so. */
  const run = async (
    box: Box,
    argv: string[],
    options: { stdin?: Buffer; timeoutSeconds: number; limit: number }
  ) => {
    try {
      return await docker.exec(box.containerId, argv, {
        deadlineMs: (options.timeoutSeconds + 15) * 1000,
        limit: options.limit,
        stdin: options.stdin,
      });
    } catch (error) {
      if (!(await stillAlive(box))) {
        return null;
      }
      throw error;
    }
  };

  // Each run gets an address-space cap below the box's memory, so a large allocation is a MemoryError in the code
  // instead of the whole box going under gVisor (spike S11). Our image's libraries all imported reserve ~535 MB of
  // address space (resident ~140 MB), so the box has 1 GB at least.
  const limited = (timeoutSeconds: number, argv: string[]) => [
    "sh",
    "-c",
    `ulimit -v ${Math.floor((config.memoryMb * 1024 * 3) / 4)}; exec timeout -s KILL ${timeoutSeconds} "$@"`,
    "sh",
    ...argv,
  ];

  return {
    acquire,

    /** At start: removes what an earlier run of the service left. */
    clean: async () => {
      const left = await docker.listByLabel(LABEL);
      await Promise.all(left.map((c) => docker.remove(c.Id).catch(ignore)));
    },

    /** Drops everything, at shutdown. */
    close: async () => {
      await Promise.all([...boxes.values()].map(drop));
    },

    exec: async (
      id: string,
      code: string,
      timeoutSeconds = config.runSeconds
    ): Promise<ExecResponse> => {
      const box = boxOf(id);
      const started = now();
      const result = await run(box, limited(timeoutSeconds, ["python3", "-"]), {
        limit: config.outputBytes,
        stdin: Buffer.from(code),
        timeoutSeconds,
      });
      const lost = result === null || !(await stillAlive(box));
      const stderr = result?.stderr.toString() ?? "";
      // 137 is a KILL: from `timeout` when the time is up, from the kernel when the memory is.
      const timedOut =
        result?.exitCode === 137 &&
        now() - started >= timeoutSeconds * 1000 - 500;
      return {
        boxLost: lost,
        exitCode: result?.exitCode ?? null,
        outOfMemory:
          lost ||
          /\bMemoryError\b/u.test(stderr) ||
          (result?.exitCode === 137 && !timedOut),
        stderr,
        stdout: result?.stdout.toString() ?? "",
        timedOut: !lost && timedOut,
        truncated: result?.truncated ?? false,
      };
    },

    /** Drops the box of a chat, busy or not: the chat was deleted or a message edited. */
    forget: async (key: string) => {
      const box = byKey.get(key);
      if (box) {
        await drop(box);
      }
    },

    getFile: async (id: string, p: string) => {
      const box = boxOf(id);
      const full = inWorkspace(p);
      if (!full) {
        throw new PoolError(400, "Files come only from /workspace.");
      }
      const size = await run(box, ["stat", "-c", "%s %F", full], {
        limit: 4096,
        timeoutSeconds: 10,
      });
      if (size === null) {
        throw new PoolError(410, "The box is gone.");
      }
      const [bytes, ...kind] = size.stdout.toString().trim().split(" ");
      if (size.exitCode !== 0 || !kind.join(" ").startsWith("regular")) {
        throw new PoolError(404, `No file at ${full}.`);
      }
      if (Number(bytes) > config.fileBytes) {
        throw new PoolError(
          413,
          `The file is larger than ${config.fileBytes / MB} MB.`
        );
      }
      const read = await run(box, ["cat", full], {
        limit: config.fileBytes * 2 + 2,
        timeoutSeconds: 60,
      });
      if (read === null) {
        throw new PoolError(410, "The box is gone.");
      }
      return read.stdout;
    },

    heartbeat: (id: string) => {
      boxOf(id);
    },

    /** The limits changed (P35): a higher cap may let a waiter in now. */
    limitsChanged: () => {
      wakeNext();
    },

    list: async (id: string): Promise<SandboxFileEntry[]> => {
      const box = boxOf(id);
      const result = await run(
        box,
        [
          "find",
          WORKSPACE,
          "-type",
          "f",
          "-not",
          "-path",
          "*/.*",
          "-printf",
          "%s %p\\n",
        ],
        { limit: 256 * 1024, timeoutSeconds: 10 }
      );
      if (result === null) {
        throw new PoolError(410, "The box is gone.");
      }
      return result.stdout
        .toString()
        .split("\n")
        .filter(Boolean)
        .slice(0, 500)
        .map((line) => {
          const space = line.indexOf(" ");
          return {
            path: line.slice(space + 1),
            size: Number(line.slice(0, space)),
          };
        });
    },

    putFile: async (id: string, p: string, data: Buffer) => {
      const box = boxOf(id);
      const full = inWorkspace(p);
      if (!full) {
        throw new PoolError(400, "Files go only under /workspace.");
      }
      const result = await run(
        box,
        [
          "sh",
          "-c",
          `mkdir -p ${quote(path.dirname(full))} && cat > ${quote(full)}`,
        ],
        { limit: 4096, stdin: data, timeoutSeconds: 60 }
      );
      if (result === null) {
        throw new PoolError(410, "The box is gone.");
      }
      if (result.exitCode !== 0) {
        throw new PoolError(
          507,
          result.stderr.toString().trim() || "Could not write the file."
        );
      }
    },

    /** The answer ended: the box waits for the next one in its chat, or goes now (an edit, a task's run). */
    release: async (id: string, keep: boolean) => {
      const box = boxes.get(id);
      if (!box) {
        return;
      }
      if (!keep || config.idleSeconds === 0) {
        await drop(box);
        return;
      }
      box.busy = false;
      box.until = now() + config.idleSeconds * 1000;
      wakeNext();
    },

    status: (): Pick<SandboxStatus, "boxes" | "waiting"> => ({
      boxes: [...boxes.values()].map((b) => ({
        busy: b.busy,
        class: b.class,
        createdAt: b.createdAt.toISOString(),
        key: b.key,
        userId: b.userId,
        ...(b.busy ? {} : { idleUntil: new Date(b.until).toISOString() }),
      })),
      waiting: waiting.length,
    }),

    /** Drops idle boxes past their time and busy ones nobody touched. */
    sweep: async () => {
      const at = now();
      await Promise.all(
        [...boxes.values()].filter((box) => box.until <= at).map(drop)
      );
    },
  };
};

export type Pool = ReturnType<typeof createPool>;
