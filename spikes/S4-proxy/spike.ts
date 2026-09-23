// S4: per-provider proxy routing in one process, SOCKS5, pinned-IP tunnels, SMTP through proxies.
// Needs `docker compose up -d --wait` from this folder. Run: pnpm spike
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isStepCount, streamText, tool } from "ai";
import nodemailer from "nodemailer";
import { SocksClient } from "socks";
import { Agent, buildConnector, Client, type Dispatcher, fetch as undiciFetch, ProxyAgent } from "undici";
import { z } from "zod";
// @ts-expect-error plain JS module
import { startMock } from "./mock.mjs";

const HTTP_PROXY = "http://spike:secret@127.0.0.1:13128";
const SOCKS = { host: "127.0.0.1", port: 11080, type: 5 as const, userId: "spike", password: "secret" };

// --- dispatchers ---------------------------------------------------------------------------------

type Connector = buildConnector.connector;
type Validate = (ip: string) => boolean;

const fetchWith = (dispatcher: Dispatcher) =>
  ((input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(input as never, { ...(init as object), dispatcher })) as unknown as typeof fetch;

const portOf = (protocol: string, port: string) => (port ? Number(port) : protocol === "https:" ? 443 : 80);

// Resolve the name ourselves and check the address before any byte leaves: the tunnel is opened to the IP,
// the name only goes into Host and TLS SNI.
async function pin(hostname: string, validate?: Validate) {
  if (!validate) return hostname;
  const address = isIP(hostname) ? hostname : (await lookup(hostname)).address;
  if (!validate(address)) throw new Error(`blocked address ${address} for ${hostname}`);
  return address;
}

/** SOCKS5. Without `validate` the name goes to the proxy (socks5h); with it, the tunnel targets a checked IP. */
function socksConnector(validate?: Validate): Connector {
  const tls = buildConnector({});
  return async (opts, cb) => {
    try {
      const host = await pin(opts.hostname, validate);
      const { socket } = await SocksClient.createConnection({
        proxy: SOCKS,
        command: "connect",
        destination: { host, port: portOf(opts.protocol, opts.port) },
      });
      if (opts.protocol !== "https:") return cb(null, socket);
      tls({ ...opts, httpSocket: socket }, cb); // servername = opts.hostname
    } catch (error) {
      cb(error as Error, null);
    }
  };
}

/** HTTP CONNECT to a checked IP. Plain providers use ProxyAgent instead. */
function pinnedHttpConnector(proxyUrl: string, validate: Validate): Connector {
  const tls = buildConnector({});
  const url = new URL(proxyUrl);
  const auth = `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString("base64")}`;
  return async (opts, cb) => {
    try {
      const ip = await pin(opts.hostname, validate);
      const client = new Client(url.origin);
      const { socket, statusCode } = await client.connect({
        path: `${isIP(ip) === 6 ? `[${ip}]` : ip}:${portOf(opts.protocol, opts.port)}`,
        headers: { "proxy-authorization": auth },
      });
      if (statusCode !== 200) throw new Error(`proxy CONNECT answered ${statusCode}`);
      if (opts.protocol !== "https:") return cb(null, socket as never);
      tls({ ...opts, httpSocket: socket as never }, cb);
    } catch (error) {
      cb(error as Error, null);
    }
  };
}

const isPublic: Validate = (ip) =>
  !/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|f[cd]|fe80)/i.test(ip);

const direct = new Agent(); // explicit: "direct" must not pick up HTTPS_PROXY from the environment
const viaHttp = new ProxyAgent(HTTP_PROXY);
const viaSocks = new Agent({ connect: socksConnector() });

// --- checks --------------------------------------------------------------------------------------

const results: [string, string][] = [];
async function check(name: string, run: () => Promise<string>) {
  try {
    results.push([name, `ok   ${await run()}`]);
  } catch (error) {
    results.push([name, `FAIL ${(error as Error).cause ?? (error as Error).message}`]);
  }
}
async function checkBlocked(name: string, run: () => Promise<string>) {
  try {
    results.push([name, `FAIL went through: ${await run()}`]);
  } catch (error) {
    const reason = String((error as Error).cause ?? (error as Error).message);
    results.push([name, reason.includes("blocked address") ? `ok   ${reason}` : `FAIL ${reason}`]);
  }
}

const weather = tool({
  description: "Weather in a city",
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => ({ city, temperature: 21 }),
});

async function streamed(model: Parameters<typeof streamText>[0]["model"], withTool = false) {
  const result = streamText({
    model,
    prompt: "hi",
    ...(withTool ? { tools: { weather }, stopWhen: isStepCount(2) } : {}),
  });
  let text = "";
  for await (const delta of result.textStream) text += delta;
  const steps = await result.steps;
  const calls = steps.flatMap((s) => s.toolCalls.map((c) => `${c.toolName}(${JSON.stringify(c.input)})`));
  return `${JSON.stringify(text)}${calls.length ? ` tools=${calls.join(",")}` : ""}`;
}

const localMock = await startMock(18080, "127.0.0.1");

// 1. Three providers, three routes, one process, concurrently.
const openai = createOpenAI({ apiKey: "sk-test", baseURL: "http://mock:8080/v1", fetch: fetchWith(viaHttp) });
const anthropic = createAnthropic({ apiKey: "sk-test", baseURL: "http://mock:8080/v1", fetch: fetchWith(viaSocks) });
const compatible = createOpenAICompatible({
  name: "local",
  apiKey: "sk-test",
  baseURL: "http://127.0.0.1:18080/v1",
  fetch: fetchWith(direct),
});
await Promise.all([
  check("openai.chat + tool via HTTP proxy", () => streamed(openai.chat("gpt-test"), true)),
  check("anthropic via SOCKS5 (socks5h)", () => streamed(anthropic("claude-test"))),
  check("openai-compatible + tool direct", () => streamed(compatible("local-test"), true)),
]);

// 2. Real HTTPS through both proxies: any HTTP answer means CONNECT/SOCKS + TLS worked.
const status = async (url: string, dispatcher: Dispatcher) => {
  const res = await undiciFetch(url, { dispatcher, signal: AbortSignal.timeout(15_000) });
  return `HTTP ${res.status}`;
};
await Promise.all([
  check("https api.openai.com via HTTP proxy", () => status("https://api.openai.com/v1/models", viaHttp)),
  check("https api.anthropic.com via SOCKS5", () => status("https://api.anthropic.com/v1/models", viaSocks)),
]);

// 3. Pinned IP (SSRF-safe traffic): tunnel to the checked IP, SNI and Host by name.
const pinnedSocks = new Agent({ connect: socksConnector(isPublic) });
const pinnedHttp = new Agent({ connect: pinnedHttpConnector(HTTP_PROXY, isPublic) });
await check("pinned SOCKS5 https example.com", () => status("https://example.com/", pinnedSocks));
await check("pinned HTTP CONNECT https example.com", () => status("https://example.com/", pinnedHttp));
await checkBlocked("pinned SOCKS5 blocks localhost", () => status("http://localhost:18080/", pinnedSocks));
await checkBlocked("pinned HTTP blocks 10.0.0.1", () => status("http://10.0.0.1/", pinnedHttp));

// 4. SMTP to mailpit:1025, which only the proxies can reach.
async function mail(proxy: string, subject: string) {
  const transport = nodemailer.createTransport({ host: "mailpit", port: 1025, secure: false, proxy } as never);
  transport.set("proxy_socks_module", { SocksClient });
  const info = await transport.sendMail({ from: "spike@purr.test", to: "me@purr.test", subject, text: "hi" });
  return info.response;
}
await check("SMTP via SOCKS5", () => mail("socks5://spike:secret@127.0.0.1:11080", "via socks5"));
await check("SMTP via HTTP CONNECT", () => mail(HTTP_PROXY, "via http"));

localMock.close();
for (const [name, outcome] of results) console.log(`${name.padEnd(42)} ${outcome}`);
