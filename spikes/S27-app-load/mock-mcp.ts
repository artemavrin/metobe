import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

// A minimal MCP server over Streamable HTTP, legacy protocol (2025-06-18), as most servers in use speak it:
// POST initialize / notifications / tools/list / tools/call, and a standing GET SSE stream per session, kept alive with
// a comment every 25 s. `server/discover` (the new stateless protocol) answers «method not found», so the client falls
// back to `initialize`, as it does with an old server.
const PORT = Number(process.env.MCP_PORT ?? 3429);
const TOOLS = Number(process.env.MCP_TOOLS ?? 15);

const tools = Array.from({ length: TOOLS }, (_, i) => ({
  description: `Look up records of kind ${i} in the mock service by free-text query, with optional filters and paging.`,
  inputSchema: {
    properties: {
      cursor: { description: "Opaque paging cursor from the previous call.", type: "string" },
      filter: {
        description: "Narrow the search.",
        properties: {
          from: { description: "ISO date, inclusive.", type: "string" },
          owner: { description: "Owner id or email.", type: "string" },
          status: { enum: ["open", "closed", "any"], type: "string" },
          to: { description: "ISO date, exclusive.", type: "string" },
        },
        type: "object",
      },
      limit: { description: "Page size, 1-100.", maximum: 100, minimum: 1, type: "integer" },
      query: { description: "Free-text query.", type: "string" },
    },
    required: ["query"],
    type: "object",
  },
  name: `search_kind_${i}`,
  title: `Search kind ${i}`,
}));

const streams = new Set<ServerResponse>();
let posts = 0;
let peak = 0;

setInterval(() => {
  for (const s of streams) s.write(": ping\n\n");
}, 25_000).unref();

const rpc = (res: ServerResponse, id: unknown, result: unknown, session?: string) => {
  res.writeHead(200, {
    "content-type": "application/json",
    ...(session ? { "mcp-session-id": session } : {}),
  });
  res.end(JSON.stringify({ id, jsonrpc: "2.0", result }));
};

createServer((req, res) => {
  if (req.url === "/stats") {
    res.end(JSON.stringify({ peak, posts, streams: streams.size }));
    return;
  }
  if (req.method === "GET") {
    res.writeHead(200, { "cache-control": "no-cache", "content-type": "text/event-stream" });
    res.write(": open\n\n");
    streams.add(res);
    peak = Math.max(peak, streams.size);
    req.on("close", () => streams.delete(res));
    return;
  }
  if (req.method === "DELETE") {
    res.writeHead(200).end();
    return;
  }
  const body: Buffer[] = [];
  req.on("data", (c: Buffer) => body.push(c));
  req.on("end", () => {
    posts += 1;
    const msg = JSON.parse(Buffer.concat(body).toString()) as { id?: unknown; method: string; params?: { name?: string } };
    const session = (req.headers["mcp-session-id"] as string | undefined) ?? randomUUID();
    switch (msg.method) {
      case "server/discover":
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: -32601, message: "Method not found" }, id: msg.id, jsonrpc: "2.0" }));
        return;
      case "initialize":
        rpc(res, msg.id, {
          capabilities: { tools: { listChanged: false } },
          protocolVersion: "2025-06-18",
          serverInfo: { name: "s27-mock", version: "1.0.0" },
        }, session);
        return;
      case "tools/list":
        rpc(res, msg.id, { tools });
        return;
      case "tools/call":
        rpc(res, msg.id, { content: [{ text: `result of ${msg.params?.name}`, type: "text" }] });
        return;
      default:
        res.writeHead(msg.id === undefined ? 202 : 200).end();
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`mcp mock on :${PORT}`));
