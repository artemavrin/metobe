import { createServer } from "node:http";
import { Readable } from "node:stream";

import { MockLanguageModelV4 } from "ai/test";
import {
  consumeStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  tool,
} from "ai";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import postgres from "postgres";
import { createClient } from "redis";
import { z } from "zod";

// The minimal stand for S27: the same AI SDK pipeline as POST /api/chat (streamText → toUIMessageStream →
// createUIMessageStream → tee → in-memory record + client SSE), the model replaced by a mock that makes its tokens in
// this process on one shared timer (no HTTP hop, no JSON parse of a provider's SSE — so this is the SDK's own cost,
// a lower bound for the product route). Per answer it writes to Postgres (the user's message, one row per step, the
// answer) and keeps Redis counters (`spike:s27:*`: in-flight per person and in total, 2 per person at most).
//   COALESCE_MS=0   one text-delta per token (what a provider sends)
//   COALESCE_MS=50  the tokens due in each 50 ms go out as one delta
const PORT = Number(process.env.PORT ?? 3427);
const COALESCE = Number(process.env.COALESCE_MS ?? 0);
const TICK = COALESCE || 20;
const WORDS = "the quick report shows that revenue grew while costs stayed flat across regions".split(" ");

const sql = postgres(process.env.DATABASE_URL as string, { max: 10, onnotice: () => {} });
await sql`create table if not exists s27_messages (id uuid primary key default gen_random_uuid(), chat_id uuid, role text, parts jsonb, created_at timestamptz default now())`;
await sql`create table if not exists s27_steps (id bigserial primary key, chat_id uuid, step int, tokens int, finish text, created_at timestamptz default now())`;
await sql`truncate s27_messages, s27_steps`;
const redis = await createClient({ url: process.env.REDIS_URL }).connect();

interface Spec { steps: number; tokens: number; tps: number; ttft: number }
const parse = (text: string): Spec => {
  const m = /S27([^\n]*)/u.exec(text)?.[1] ?? "";
  const get = (k: string, d: number) => Number(new RegExp(`${k}=(\\d+)`, "u").exec(m)?.[1] ?? d);
  return { steps: get("steps", 1), tokens: get("tokens", 300), tps: get("tps", 45), ttft: get("ttft", 800) };
};

interface Live { start: number; sent: number; total: number; tps: number; push: (n: number) => void; done: () => void }
const live = new Set<Live>();
setInterval(() => {
  const now = Date.now();
  for (const s of live) {
    const due = Math.min(s.total, Math.floor(((now - s.start) * s.tps) / 1000));
    if (due > s.sent) {
      s.push(due - s.sent);
      s.sent = due;
    }
    if (s.sent >= s.total) {
      live.delete(s);
      s.done();
    }
  }
}, TICK);

const mockModel = (spec: Spec) =>
  new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const lastUser = prompt.findLastIndex((m) => m.role === "user");
      const toolsDone = prompt.slice(lastUser + 1).filter((m) => m.role === "tool").length;
      const toolCall = toolsDone < spec.steps - 1;
      const total = Math.max(1, Math.round(spec.tokens / spec.steps));
      let controller!: ReadableStreamDefaultController<LanguageModelV4StreamPart>;
      const stream = new ReadableStream<LanguageModelV4StreamPart>({ start: (c) => (controller = c) });
      controller.enqueue({ type: "stream-start", warnings: [] });
      let i = 0;
      setTimeout(() => {
        controller.enqueue({ id: "t", type: "text-start" });
        live.add({
          done: () => {
            controller.enqueue({ id: "t", type: "text-end" });
            if (toolCall) {
              controller.enqueue({ input: "{}", toolCallId: `c${Math.random()}`, toolName: "current_time", type: "tool-call" });
            }
            controller.enqueue({
              finishReason: { raw: undefined, unified: toolCall ? "tool-calls" : "stop" },
              type: "finish",
              usage: {
                inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 500, total: 500 },
                outputTokens: { reasoning: 0, text: total, total },
              },
            });
            controller.close();
          },
          push: (n) => {
            let delta = "";
            for (let k = 0; k < n; k += 1) delta += `${WORDS[(i++) % WORDS.length]} `;
            if (COALESCE) {
              controller.enqueue({ delta, id: "t", type: "text-delta" });
            } else {
              // one delta per token, as a provider sends them
              for (const w of delta.trim().split(" ")) controller.enqueue({ delta: `${w} `, id: "t", type: "text-delta" });
            }
          },
          sent: 0,
          start: Date.now(),
          total,
          tps: spec.tps,
        });
      }, spec.ttft);
      return { stream };
    },
  });

const current_time = tool({
  description: "Current time",
  execute: async () => ({ utc: new Date().toISOString() }),
  inputSchema: z.object({}),
});

// The record a reloaded page would join (lib/resume-stream.ts): every chunk kept in memory, 120 s after the end.
const records = new Map<string, unknown[]>();

createServer(async (req, res) => {
  if (req.url?.startsWith("/api/auth/get-session")) {
    res.setHeader("content-type", "application/json").end("null");
    return;
  }
  if (req.method !== "POST" || req.url !== "/api/chat") {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = JSON.parse(Buffer.concat(chunks).toString()) as { id: string; message: { id: string; parts: { text: string }[] } };
  const text = body.message.parts[0].text;
  const spec = parse(text);
  const user = /better-auth\.session_token=([^;.]{0,12})/u.exec(req.headers.cookie ?? "")?.[1] ?? "anon";

  // Redis: the in-flight counters (ARCH §20: at most two answers per person).
  const mine = await redis.incr(`spike:s27:inflight:${user}`);
  await redis.expire(`spike:s27:inflight:${user}`, 600);
  if (mine > 2) {
    await redis.decr(`spike:s27:inflight:${user}`);
    res.writeHead(429).end();
    return;
  }
  await redis.incr("spike:s27:inflight");
  await redis.incr("spike:s27:started");
  const release = async () => {
    await redis.decr(`spike:s27:inflight:${user}`);
    await redis.decr("spike:s27:inflight");
  };

  await sql`insert into s27_messages (chat_id, role, parts) values (${body.id}, 'user', ${sql.json([{ text, type: "text" }])})`;
  const abort = new AbortController();
  let step = 0;
  const result = streamText({
    abortSignal: abort.signal,
    messages: [{ content: text, role: "user" }],
    model: mockModel(spec),
    onEnd: async () => {
      await release();
    },
    onStepEnd: ({ finishReason, usage }: { finishReason: string; usage: { outputTokens?: number } }) => {
      step += 1;
      void sql`insert into s27_steps (chat_id, step, tokens, finish) values (${body.id}, ${step}, ${usage.outputTokens ?? 0}, ${finishReason})`.catch(() => {});
    },
    stopWhen: isStepCount(6),
    tools: { current_time },
  } as never);
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ data: Date.now(), transient: true, type: "data-clock" } as never);
      writer.merge(result.toUIMessageStream({ messageMetadata: ({ part }) => (part.type === "start" ? { createdAt: new Date().toISOString() } : undefined) }));
    },
    onEnd: async ({ messages }) => {
      await sql`insert into s27_messages (chat_id, role, parts) values (${body.id}, 'assistant', ${sql.json(messages.at(-1)?.parts ?? [])})`;
      await sql`insert into s27_steps (chat_id, step, tokens, finish) values (${body.id}, 0, 0, 'saved')`;
    },
  });
  const [toClient, toRecord] = stream.tee();
  const kept: unknown[] = [];
  records.set(body.id, kept);
  void toRecord.pipeTo(new WritableStream({ write: (c) => void kept.push(c) })).finally(() => setTimeout(() => records.delete(body.id), 120_000).unref());
  void result.consumeStream();
  const response = createUIMessageStreamResponse({ consumeSseStream: consumeStream, stream: toClient });
  res.writeHead(200, Object.fromEntries(response.headers));
  Readable.fromWeb(response.body as never).pipe(res);
  res.on("close", () => abort.signal.aborted || undefined);
}).listen(PORT, "127.0.0.1", () => console.log(`standalone on :${PORT} coalesce=${COALESCE}`));
