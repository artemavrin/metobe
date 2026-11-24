import { monitorEventLoopDelay } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";

// One load-driver process: runs `count` slots of a closed loop against /api/chat. A slot is one open answer at a time:
// it starts an answer, reads its UI message stream to the end, thinks 0-1 s, starts the next, until the deadline.
// Several of these run side by side so the driver itself is not the bottleneck (its own event-loop delay is reported).
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3427";
const { modelId, people } = JSON.parse(
  readFileSync(new URL("cookies.json", import.meta.url), "utf8")
) as { modelId: string; people: { cookie: string }[] };

const cfg = JSON.parse(process.env.WORKER_CFG ?? "{}") as {
  slots: number[];
  total: number;
  rampMs: number;
  deadline: number;
  usersPer: number;
  mix: { minSec: number; maxSec: number; minTps: number; maxTps: number };
};

export interface Record {
  slot: number;
  status: number;
  ok: boolean;
  error?: string;
  steps: number;
  tokens: number;
  tps: number;
  mockTtft: number;
  startedAt: number;
  headersMs: number | null;
  ttftMs: number | null;
  totalMs: number;
  deltas: number;
  expectedDeltas: number;
  bytes: number;
  /** Gaps between text deltas inside one step: counts per bucket (<=25, 50, 100, 250, 500, 1000, 2500, more) and the max. */
  gaps: number[];
  gapMax: number;
}
const BUCKETS = [25, 50, 100, 250, 500, 1000, 2500];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const count = (hay: string, needle: string) => {
  let n = 0;
  let at = hay.indexOf(needle);
  while (at !== -1) {
    n += 1;
    at = hay.indexOf(needle, at + needle.length);
  }
  return n;
};

const answer = async (slot: number): Promise<Record> => {
  const { minSec, maxSec, minTps, maxTps } = cfg.mix;
  const tps = Math.round(rand(minTps, maxTps));
  const steps = 1 + Math.ceil(Math.random() * 3); // 1-3 tool steps + the answering call
  const tokens = Math.round(rand(minSec, maxSec) * tps);
  const mockTtft = Math.round(rand(300, 1500));
  const per = Math.max(1, Math.round(tokens / steps));
  const text = `${process.env.MENTION ?? ""} Summarise the quarter. S27 steps=${steps} tokens=${tokens} tps=${tps} ttft=${mockTtft}`;
  const person = people[(slot % cfg.total) % Math.ceil(cfg.total / cfg.usersPer)];
  const rec: Record = {
    bytes: 0,
    deltas: 0,
    expectedDeltas: per * steps,
    gapMax: 0,
    gaps: Array(BUCKETS.length + 1).fill(0),
    headersMs: null,
    mockTtft,
    ok: false,
    slot,
    startedAt: Date.now(),
    status: 0,
    steps,
    tokens,
    totalMs: 0,
    tps,
    ttftMs: null,
  };
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      body: JSON.stringify({
        id: crypto.randomUUID(),
        message: {
          id: crypto.randomUUID(),
          parts: [{ text, type: "text" }],
          role: "user",
        },
        modelId,
      }),
      headers: {
        "content-type": "application/json",
        cookie: person.cookie.replace(
          "better-auth.session_token",
          process.env.COOKIE_NAME ?? "better-auth.session_token"
        ),
        origin: BASE,
      },
      method: "POST",
    });
    rec.status = res.status;
    rec.headersMs = performance.now() - t0;
    if (!res.ok || !res.body) {
      rec.error = (await res.text().catch(() => "")).slice(0, 120);
      return rec;
    }
    let last: number | null = null;
    let tail = "";
    for await (const buf of res.body as unknown as AsyncIterable<Uint8Array>) {
      const now = performance.now();
      const chunk = Buffer.from(buf).toString("latin1");
      rec.bytes += buf.byteLength;
      const n = count(chunk, '"type":"text-delta"');
      if (n > 0) {
        rec.deltas += n;
        rec.ttftMs ??= now - t0;
        if (last !== null) {
          const gap = now - last;
          rec.gapMax = Math.max(rec.gapMax, gap);
          const b = BUCKETS.findIndex((x) => gap <= x);
          rec.gaps[b === -1 ? BUCKETS.length : b] += 1;
        }
        last = now;
      }
      if (chunk.includes('"finish-step"') || chunk.includes('"start-step"')) {
        last = null;
      }
      if (chunk.includes('"type":"error"')) {
        rec.error ??= "error chunk";
      }
      tail = (tail + chunk).slice(-40);
    }
    rec.ok = tail.includes("[DONE]") && !rec.error;
  } catch (error) {
    rec.error = `${(error as Error).name}: ${(error as Error).message}`.slice(0, 120);
  } finally {
    rec.totalMs = performance.now() - t0;
  }
  return rec;
};

const records: Record[] = [];
const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();

await Promise.all(
  cfg.slots.map(async (slot) => {
    await sleep((slot / cfg.total) * cfg.rampMs);
    while (process.env.WARMUP ? records.length < 1 : Date.now() < cfg.deadline) {
      records.push(await answer(slot));
      await sleep(rand(0, 1000));
    }
  })
);
// A file, not process.send: the exit below would cut a large IPC message short.
writeFileSync(
  process.env.WORKER_OUT as string,
  JSON.stringify({
    driverLagMax: histogram.max / 1e6,
    driverLagP99: histogram.percentile(99) / 1e6,
    records,
  })
);
process.exit(0);
