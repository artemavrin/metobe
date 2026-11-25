import { createServer } from "node:http";

// A mock OpenAI-compatible model for S27: POST /v1/chat/completions (stream). No network, no cost.
// The scenario is read from the last user message: `S27 steps=2 tokens=1200 tps=45 ttft=800`
//   steps  — model calls in the answer: steps-1 of them end with a `current_time` call, the last answers in words;
//   tokens — tokens of text over the whole answer, split evenly across the calls;
//   tps    — tokens per second of one stream; ttft — ms before the first token of a call.
// One timer ticks every TICK ms and writes to every stream what is due, so 400 streams cost one timer, not 400.
const PORT = Number(process.env.MOCK_PORT ?? 3428);
const TICK = 20;
const WORDS =
  "the quick report shows that revenue grew while costs stayed flat across regions and the team agreed on next steps for the quarter plan".split(
    " "
  );

interface Spec {
  steps: number;
  tokens: number;
  tps: number;
  ttft: number;
}

const parse = (text: string): Spec => {
  const m = /S27([^\n]*)/u.exec(text)?.[1] ?? "";
  const get = (k: string, d: number) =>
    Number(new RegExp(`${k}=(\\d+)`, "u").exec(m)?.[1] ?? d);
  return {
    steps: get("steps", 1),
    tokens: get("tokens", 300),
    tps: get("tps", 45),
    ttft: get("ttft", 800),
  };
};

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map((p: { text?: string }) => p.text ?? "")
          .join(" ")
      : "";

interface Live {
  res: import("node:http").ServerResponse;
  start: number;
  sent: number;
  total: number;
  tps: number;
  toolCall: boolean;
  promptTokens: number;
  id: string;
}
const live = new Set<Live>();
let started = 0;
let finished = 0;
let peak = 0;

const chunk = (id: string, delta: object, finish: string | null = null) =>
  `data: ${JSON.stringify({
    choices: [{ delta, finish_reason: finish, index: 0 }],
    created: 1_700_000_000,
    id,
    model: "mock-1",
    object: "chat.completion.chunk",
  })}\n\n`;

const finish = (s: Live) => {
  let out = "";
  if (s.toolCall) {
    out += chunk(
      s.id,
      {
        tool_calls: [
          {
            function: { arguments: "", name: "current_time" },
            id: `call_${s.id}`,
            index: 0,
            type: "function",
          },
        ],
      }
    );
    out += chunk(s.id, {
      tool_calls: [{ function: { arguments: "{}" }, index: 0 }],
    });
  }
  out += chunk(s.id, {}, s.toolCall ? "tool_calls" : "stop");
  out += `data: ${JSON.stringify({
    choices: [],
    created: 1_700_000_000,
    id: s.id,
    model: "mock-1",
    object: "chat.completion.chunk",
    usage: {
      completion_tokens: s.total,
      prompt_tokens: s.promptTokens,
      total_tokens: s.promptTokens + s.total,
    },
  })}\n\n`;
  out += "data: [DONE]\n\n";
  s.res.end(out);
  live.delete(s);
  finished += 1;
};

setInterval(() => {
  const now = Date.now();
  for (const s of live) {
    const due = Math.min(
      s.total,
      Math.floor(((now - s.start) * s.tps) / 1000)
    );
    if (due > s.sent) {
      let out = "";
      for (let i = s.sent; i < due; i += 1) {
        out += chunk(s.id, { content: `${WORDS[i % WORDS.length]} ` });
      }
      s.sent = due;
      s.res.write(out);
    }
    if (s.sent >= s.total) {
      finish(s);
    }
  }
}, TICK);

createServer((req, res) => {
  if (req.url === "/stats") {
    res.end(JSON.stringify({ finished, live: live.size, peak, started }));
    return;
  }
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    res.writeHead(404).end();
    return;
  }
  const body: Buffer[] = [];
  req.on("data", (c: Buffer) => body.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(body).toString();
    const json = JSON.parse(raw) as {
      messages: { content: unknown; role: string }[];
    };
    const lastUser = json.messages.findLastIndex((m) => m.role === "user");
    const spec = parse(
      textOf(json.messages[lastUser]?.content ?? "") +
        // the memory brief goes before the text, so look at every user text of the turn
        json.messages.map((m) => textOf(m.content)).join("\n")
    );
    const toolsDone = json.messages
      .slice(lastUser + 1)
      .filter((m) => m.role === "tool").length;
    const toolCall = toolsDone < spec.steps - 1;
    const total = Math.max(1, Math.round(spec.tokens / spec.steps));
    res.writeHead(200, {
      "cache-control": "no-cache",
      "content-type": "text/event-stream",
    });
    const s: Live = {
      id: `chatcmpl-${started}`,
      promptTokens: Math.round(raw.length / 4),
      res,
      sent: 0,
      start: Date.now() + spec.ttft,
      toolCall,
      total,
      tps: spec.tps,
    };
    started += 1;
    // Role chunk first, as real providers do; the tokens follow after the model's own latency.
    res.write(chunk(s.id, { content: "", role: "assistant" }));
    setTimeout(() => {
      if (!res.writableEnded && !res.destroyed) {
        live.add(s);
        peak = Math.max(peak, live.size);
      }
    }, spec.ttft);
    res.on("close", () => live.delete(s));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`mock on :${PORT}`));
