import { once } from "node:events";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { directAgent, fetchWith } from "./net-transport";
import { classifyFailure, probeSource } from "./sources-probe";

// An OpenAI-compatible server whose path picks the behaviour.
let server: Server;
let base: string;
const fetch = fetchWith(directAgent());

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? "";
    if (path.startsWith("/ok/")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "llama3" }, { id: "qwen3" }] }));
    } else if (path.startsWith("/key/")) {
      res.statusCode = req.headers.authorization === "Bearer right" ? 200 : 401;
      res.end(JSON.stringify({ data: [] }));
    } else if (path.startsWith("/html/")) {
      res.setHeader("content-type", "text/html");
      res.end("<html>not an API</html>");
    } else if (path.startsWith("/stall/")) {
      // DPI: status and headers arrive, the body stops after a first chunk and never ends.
      res.setHeader("content-type", "application/json");
      res.write('{"data":[{"id":"llama3"},');
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const compatible = (path: string) => ({
  baseUrl: `${base}${path}`,
  kind: "openai-compatible" as const,
  options: { kind: "openai-compatible" as const },
});

describe("probing a source", () => {
  it("reads the model list to the end", async () => {
    const result = await probeSource(compatible("/ok/v1"), null, fetch);
    expect(result.ok && result.models.map((m) => m.modelId)).toEqual([
      "llama3",
      "qwen3",
    ]);
  });

  it("tells a rejected key from a wrong address", async () => {
    expect(
      await probeSource(compatible("/key/v1"), "wrong", fetch)
    ).toMatchObject({ ok: false, reason: "auth", status: 401 });
    const right = await probeSource(compatible("/key/v1"), "right", fetch);
    expect(right.ok).toBe(true);
    expect(
      await probeSource(compatible("/nothing/v1"), null, fetch)
    ).toMatchObject({ ok: false, reason: "not-found", status: 404 });
  });

  it("treats a page that is not an API as invalid", async () => {
    expect(
      await probeSource(compatible("/html/v1"), null, fetch)
    ).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("counts a body that stalls after the headers as unreachable", async () => {
    expect(
      await probeSource(compatible("/stall/v1"), null, fetch, {
        timeoutMs: 300,
      })
    ).toMatchObject({ ok: false, reason: "unreachable" });
  });

  it("counts a closed port as unreachable", async () => {
    const closed = createServer();
    closed.listen(0, "127.0.0.1");
    await once(closed, "listening");
    const { port } = closed.address() as AddressInfo;
    closed.close();
    const result = await probeSource(
      { ...compatible(""), baseUrl: `http://127.0.0.1:${port}/v1` },
      null,
      fetch
    );
    expect(result).toMatchObject({ ok: false, reason: "unreachable" });
  });
});

describe("classifying failures", () => {
  it("reads undici socket errors as a network failure", () => {
    const error = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect"), { code: "ECONNRESET" }),
    });
    expect(classifyFailure(error)).toEqual({
      message: "ECONNRESET",
      reason: "unreachable",
    });
  });
});
