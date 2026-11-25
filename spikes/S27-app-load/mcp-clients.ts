import { execFileSync } from "node:child_process";

import { createMCPClient } from "@ai-sdk/mcp";
import type { MCPClient } from "@ai-sdk/mcp";

// What it costs to hold open MCP clients, built the way core/mcp.ts builds them (`createMCPClient` over the HTTP
// transport, one per server × owner, cached in a Map and never evicted). Run against mock-mcp.ts on :3429.
// Prints per target count: live heap after a full GC, RSS, macOS physical footprint, open TCP sockets of this process,
// the server's standing GET streams, and the connect time; then the cost of `tools()`, which a chat calls on every
// message that mentions the server.
const URL_ = process.env.MCP_URL ?? "http://127.0.0.1:3429/mcp";
const TARGETS = (process.env.TARGETS ?? "0,100,500,1000,2000,4000").split(",").map(Number);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mb = (x: number) => Math.round((x / 1048576) * 10) / 10;

const footprint = () => {
  try {
    const out = execFileSync("footprint", [String(process.pid)], { encoding: "utf8" });
    const m = /Footprint:\s+([\d.]+)\s*(KB|MB|GB)/.exec(out);
    return m ? Number(m[1]) * ({ GB: 1024, KB: 1 / 1024, MB: 1 }[m[2] as "KB"]) : -1;
  } catch {
    return -1;
  }
};
const sockets = () => {
  try {
    const out = execFileSync("lsof", ["-a", "-p", String(process.pid), "-iTCP", "-n", "-P"], { encoding: "utf8" });
    return out.split("\n").filter((l) => l.includes("ESTABLISHED")).length;
  } catch {
    return -1;
  }
};
const serverStats = async () =>
  (await fetch("http://127.0.0.1:3429/stats").then((r) => r.json())) as { streams: number; peak: number };

const open = () =>
  createMCPClient({
    transport: { headers: {}, redirect: "error", type: "http", url: URL_ },
  });

const clients: MCPClient[] = [];
const rows: object[] = [];
const snap = async (k: number, connectMs: number | null) => {
  await sleep(1500);
  globalThis.gc?.();
  await sleep(300);
  globalThis.gc?.();
  const mem = process.memoryUsage();
  rows.push({
    clients: k,
    connect_ms_avg: connectMs === null ? null : Math.round(connectMs * 10) / 10,
    footprint_mb: Math.round(footprint()),
    heap_mb: mb(mem.heapUsed),
    rss_mb: mb(mem.rss),
    sockets: sockets(),
    standing_streams_on_server: (await serverStats()).streams,
  });
  console.log(JSON.stringify(rows.at(-1)));
};

await snap(0, null);
for (const target of TARGETS.filter((t) => t > 0)) {
  const t0 = performance.now();
  const from = clients.length;
  while (clients.length < target) {
    const batch = Math.min(50, target - clients.length);
    clients.push(...(await Promise.all(Array.from({ length: batch }, open))));
  }
  await snap(target, (performance.now() - t0) / (target - from));
}

// Idle: standing streams and keep-alive pings, nothing else.
const cpu0 = process.cpuUsage();
await sleep(30_000);
const idle = process.cpuUsage(cpu0);
console.log(JSON.stringify({ idle_cpu_pct_of_one_core_30s: Math.round(((idle.user + idle.system) / 1000 / 30_000) * 1000) / 10 }));

// tools(): one client, sequentially; then every client at once (as many chats start together).
const one = clients[0];
const c1 = process.cpuUsage();
const t1 = performance.now();
for (let i = 0; i < 500; i += 1) await one.tools();
const d1 = process.cpuUsage(c1);
console.log(JSON.stringify({ tools_call_ms: Math.round(((performance.now() - t1) / 500) * 100) / 100, tools_call_cpu_ms: Math.round(((d1.user + d1.system) / 1000 / 500) * 100) / 100, tools_per_server: 15 }));
const t2 = performance.now();
const c2 = process.cpuUsage();
await Promise.all(clients.slice(0, 400).map((c) => c.tools()));
const d2 = process.cpuUsage(c2);
console.log(JSON.stringify({ tools_400_clients_at_once_ms: Math.round(performance.now() - t2), cpu_ms: Math.round((d2.user + d2.system) / 1000) }));

await Promise.allSettled(clients.map((c) => c.close()));
process.exit(0);
