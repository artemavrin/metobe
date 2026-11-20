import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  acquireRequestSchema,
  execRequestSchema,
} from "@metobe/contracts/sandbox";
import type { SandboxStatus } from "@metobe/contracts/sandbox";

import { PoolError } from "./pool";
import type { Pool, PoolConfig } from "./pool";

// The service's door: the app and the worker, by the internal token; nothing else reaches it (no port out).

const JSON_LIMIT = 1024 * 1024;

const send = (res: ServerResponse, status: number, body?: unknown) => {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" }).end(text);
};

const readBody = async (req: IncomingMessage, limit: number) => {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) {
      throw new PoolError(413, "Too large.");
    }
    parts.push(chunk as Buffer);
  }
  return Buffer.concat(parts);
};

const readJson = async (req: IncomingMessage) => {
  const body = await readBody(req, JSON_LIMIT);
  try {
    return JSON.parse(body.toString() || "{}") as unknown;
  } catch {
    throw new PoolError(400, "Not JSON.");
  }
};

const tokenMatches = (header: string | undefined, token: string) => {
  const given = Buffer.from(header?.replace(/^Bearer /u, "") ?? "");
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
};

export type Readiness = Pick<SandboxStatus, "ready" | "problem">;

export const createSandboxServer = (options: {
  pool: Pool;
  config: PoolConfig;
  token: string;
  readiness: () => Readiness;
}) => {
  const { pool, config, token, readiness } = options;

  /** A box's own door: run code, move files, list them, keep it alive, let it go. */
  const boxRoute = async (
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    url: URL,
    id: string,
    action: string | undefined
  ) => {
    if (method === "POST" && action === "exec") {
      const { code, timeoutSeconds } = execRequestSchema.parse(
        await readJson(req)
      );
      send(res, 200, await pool.exec(id, code, timeoutSeconds));
      return;
    }
    if (action === "files") {
      const p = url.searchParams.get("path") ?? "";
      if (method === "PUT") {
        await pool.putFile(id, p, await readBody(req, config.fileBytes));
        send(res, 204);
        return;
      }
      if (method === "GET") {
        const data = await pool.getFile(id, p);
        res
          .writeHead(200, {
            "content-length": data.length,
            "content-type": "application/octet-stream",
          })
          .end(data);
        return;
      }
    }
    if (method === "GET" && action === "list") {
      send(res, 200, await pool.list(id));
      return;
    }
    if (method === "POST" && action === "heartbeat") {
      pool.heartbeat(id);
      send(res, 204);
      return;
    }
    if (method === "POST" && action === "release") {
      const body = (await readJson(req)) as { keep?: unknown };
      await pool.release(id, body.keep === true);
      send(res, 204);
      return;
    }
    send(res, 404, { error: "Not found." });
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://sandbox");
    const parts = url.pathname.split("/").filter(Boolean);
    const method = req.method ?? "GET";

    if (method === "GET" && url.pathname === "/health") {
      send(res, 200, { ok: true });
      return;
    }
    if (!tokenMatches(req.headers.authorization, token)) {
      send(res, 401, { error: "Unauthorized." });
      return;
    }
    if (method === "GET" && url.pathname === "/status") {
      const status: SandboxStatus = {
        ...readiness(),
        ...pool.status(),
        image: config.image,
        limits: {
          idleSeconds: config.idleSeconds,
          memoryMb: config.memoryMb,
          perUser: config.perUser,
          total: config.total,
        },
        runtime: config.runtime,
      };
      send(res, 200, status);
      return;
    }
    if (method === "POST" && url.pathname === "/boxes") {
      const ready = readiness();
      if (!ready.ready) {
        send(res, 503, {
          error: `The sandbox is not ready: ${ready.problem}.`,
        });
        return;
      }
      const request = acquireRequestSchema.parse(await readJson(req));
      send(res, 201, await pool.acquire(request));
      return;
    }
    if (parts[0] === "chats" && parts[1] && method === "DELETE") {
      await pool.forget(decodeURIComponent(parts[1]));
      send(res, 204);
      return;
    }
    if (parts[0] !== "boxes" || !parts[1]) {
      send(res, 404, { error: "Not found." });
      return;
    }
    await boxRoute(req, res, method, url, parts[1], parts[2]);
  };

  return createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (error) {
      if (error instanceof PoolError) {
        send(res, error.status, { error: error.message });
        return;
      }
      if (error instanceof Error && error.name === "ZodError") {
        send(res, 400, { error: "Bad request." });
        return;
      }
      console.error("sandbox:", req.method, req.url, error);
      if (!res.headersSent) {
        send(res, 500, { error: "The sandbox failed." });
      }
    }
  });
};
