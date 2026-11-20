import { once } from "node:events";
import { request } from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

// The few Docker Engine API calls the sandbox needs, over the unix socket. Not dockerode: it brings native builds
// (ssh2, cpu-features), and the app image has none (D34). Spike S11: files go through `exec` stdin and stdout, since
// the archive API refuses a read-only root.

const API = "/v1.44";

export class DockerError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DockerError";
    this.status = status;
  }
}

const readAll = async (stream: IncomingMessage | Duplex) => {
  const parts: Buffer[] = [];
  for await (const chunk of stream) {
    parts.push(chunk as Buffer);
  }
  return Buffer.concat(parts);
};

export interface ExecOutput {
  exitCode: number | null;
  stdout: Buffer;
  stderr: Buffer;
  /** More came than `limit`: the start and the end are kept. */
  truncated: boolean;
}

/** Keeps the first and the last `limit / 2` bytes of a stream: a traceback is at the end. */
const keeper = (limit: number) => {
  const half = Math.floor(limit / 2);
  const head: Buffer[] = [];
  let headSize = 0;
  let tail = Buffer.alloc(0);
  let total = 0;
  return {
    bytes: () => Buffer.concat([...head, tail]),
    cut: () => total > headSize + tail.length,
    push: (chunk: Buffer) => {
      total += chunk.length;
      const take = chunk.subarray(0, Math.max(0, half - headSize));
      if (take.length > 0) {
        head.push(take);
        headSize += take.length;
      }
      const rest = chunk.subarray(take.length);
      if (rest.length > 0) {
        tail = Buffer.concat([tail, rest]);
        if (tail.length > half) {
          tail = tail.subarray(tail.length - half);
        }
      }
    },
  };
};

/** Splits Docker's frames (1 stdout, 2 stderr, then a 4-byte size) into the two keepers. */
const demux = (
  socket: Duplex,
  out: ReturnType<typeof keeper>,
  err: ReturnType<typeof keeper>
) => {
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 8) {
      const size = pending.readUInt32BE(4);
      if (pending.length < 8 + size) {
        break;
      }
      (pending[0] === 2 ? err : out).push(pending.subarray(8, 8 + size));
      pending = pending.subarray(8 + size);
    }
  });
};

export const createDocker = (socketPath: string) => {
  const call = async (method: string, path: string, body?: unknown) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      headers: payload
        ? {
            "content-length": Buffer.byteLength(payload),
            "content-type": "application/json",
          }
        : {},
      method,
      path: API + path,
      socketPath,
    });
    req.end(payload);
    const [res] = (await once(req, "response")) as [IncomingMessage];
    return { body: await readAll(res), status: res.statusCode ?? 0 };
  };

  const json = async <T>(method: string, path: string, body?: unknown) => {
    const res = await call(method, path, body);
    if (res.status >= 400) {
      let message = res.body.toString();
      try {
        message =
          (JSON.parse(message) as { message?: string }).message ?? message;
      } catch {
        // Not JSON: the text as it is.
      }
      throw new DockerError(res.status, message);
    }
    return (res.body.length > 0 ? JSON.parse(res.body.toString()) : null) as T;
  };

  /** Starts an exec and hands over the raw stream (Docker's 8-byte frames). */
  const hijack = async (execId: string) => {
    const payload = JSON.stringify({ Detach: false, Tty: false });
    const req = request({
      headers: {
        connection: "Upgrade",
        "content-length": Buffer.byteLength(payload),
        "content-type": "application/json",
        upgrade: "tcp",
      },
      method: "POST",
      path: `${API}/exec/${execId}/start`,
      socketPath,
    });
    req.end(payload);
    const upgraded = (async () => {
      const [, socket] = await once(req, "upgrade");
      return { socket: socket as Duplex } as const;
    })();
    const refused = (async () => {
      const [res] = await once(req, "response");
      return { res: res as IncomingMessage } as const;
    })();
    const first = await Promise.race([upgraded, refused]);
    if ("res" in first) {
      const data = await readAll(first.res);
      throw new DockerError(first.res.statusCode ?? 0, data.toString());
    }
    return first.socket;
  };

  return {
    create: (config: Record<string, unknown>) =>
      json<{ Id: string }>("POST", "/containers/create", config),

    /**
     * Runs argv in the container: stdin (if any) is written and closed, the output is collected up to `limit` bytes
     * per stream. `deadlineMs` is a last resort on our side (the command has its own `timeout` inside).
     */
    exec: async (
      id: string,
      argv: string[],
      options: { stdin?: Buffer; limit: number; deadlineMs: number }
    ): Promise<ExecOutput> => {
      const { Id } = await json<{ Id: string }>(
        "POST",
        `/containers/${id}/exec`,
        {
          AttachStderr: true,
          AttachStdin: options.stdin !== undefined,
          AttachStdout: true,
          Cmd: argv,
        }
      );
      const socket = await hijack(Id);
      const out = keeper(options.limit);
      const err = keeper(options.limit);
      demux(socket, out, err);
      const closed = once(socket, "close", {
        signal: AbortSignal.timeout(options.deadlineMs),
      });
      if (options.stdin === undefined) {
        // Nothing to send: our side is done at once, the output still comes.
        socket.end();
      } else {
        socket.end(options.stdin);
      }
      try {
        await closed;
      } catch {
        socket.destroy();
        throw new DockerError(504, "exec did not end in time");
      }
      const state = await json<{ ExitCode: number | null; Running: boolean }>(
        "GET",
        `/exec/${Id}/json`
      );
      return {
        exitCode: state.Running ? null : state.ExitCode,
        stderr: err.bytes(),
        stdout: out.bytes(),
        truncated: out.cut() || err.cut(),
      };
    },

    imageExists: async (image: string) => {
      const res = await call(
        "GET",
        `/images/${encodeURIComponent(image)}/json`
      );
      return res.status === 200;
    },

    info: () =>
      json<{
        MemTotal?: number;
        Runtimes?: Record<string, unknown>;
        ServerVersion?: string;
      }>("GET", "/info"),

    inspect: (id: string) =>
      json<{ State: { Running: boolean; OOMKilled: boolean } }>(
        "GET",
        `/containers/${id}/json`
      ),

    listByLabel: (label: string) =>
      json<{ Id: string; Labels: Record<string, string> }[]>(
        "GET",
        `/containers/json?all=true&filters=${encodeURIComponent(JSON.stringify({ label: [label] }))}`
      ),

    pull: async (image: string) => {
      const colon = image.lastIndexOf(":");
      const [name, tag] =
        colon > image.lastIndexOf("/")
          ? [image.slice(0, colon), image.slice(colon + 1)]
          : [image, "latest"];
      const res = await call(
        "POST",
        `/images/create?fromImage=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`
      );
      if (res.status >= 400) {
        throw new DockerError(res.status, res.body.toString());
      }
      // The progress stream ends with an error line when the pull failed.
      const last = res.body.toString().trim().split("\n").at(-1) ?? "";
      if (last.includes('"error"')) {
        throw new DockerError(500, last);
      }
    },

    remove: async (id: string) => {
      const res = await call("DELETE", `/containers/${id}?force=true`);
      if (res.status >= 400 && res.status !== 404) {
        throw new DockerError(res.status, res.body.toString());
      }
    },

    start: (id: string) => json<null>("POST", `/containers/${id}/start`),
  };
};

export type Docker = ReturnType<typeof createDocker>;
