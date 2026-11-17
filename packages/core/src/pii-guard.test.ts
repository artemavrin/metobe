import {
  Output,
  generateText,
  isStepCount,
  simulateReadableStream,
  streamText,
  tool,
  wrapLanguageModel,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  GuardUnavailableError,
  guardSession,
  isGuardUnavailable,
  maskStrings,
  maskingMiddleware,
  toChat,
} from "./pii-guard";

// All people, addresses and numbers are fictional.
const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};
const stop = { raw: undefined, unified: "stop" as const };

// What the fake guard masks, and how each label reads back (one person in two cases).
const MASK: [string, string][] = [
  ["Смирновой Ольги Петровны", "Персоны_Женщины_ab12cd"],
  ["Ольге Петровне", "Персоне_Женщине_ab12cd"],
  ["olga@example.com", "[[EMAIL_e1f2a3]]"],
];
const RESTORE: [string, string][] = [
  ["Персоне_Женщине_ab12cd", "Смирновой Ольге Петровне"],
  ["Персоной_Женщиной_ab12cd", "Смирновой Ольгой Петровной"],
  ["[[EMAIL_e1f2a3]]", "olga@example.com"],
];
const NOTE = "Имена заменены метками Персона_…";
const ORIGINALS = ["Смирнов", "Ольг", "olga@example.com"];

const replaceAll = (text: string, pairs: [string, string][]) => {
  let out = text;
  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
  }
  return out;
};
const mapStrings = (value: unknown, f: (s: string) => string): unknown => {
  if (typeof value === "string") {
    return f(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => mapStrings(v, f));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapStrings(v, f)])
    );
  }
  return value;
};

/** A fake PII Guard: masks the values above, adds its note, restores labels, holds split ones. */
const fakeGuard = (opts: { down?: boolean } = {}) => {
  const requests: {
    path: string;
    body: { messages?: unknown[]; items?: unknown[] };
  }[] = [];
  const answer = (input: unknown, init?: RequestInit): Response => {
    const path = String(input).split("/v1/chat/")[1] ?? "";
    const body = JSON.parse(String(init?.body));
    requests.push({ body, path });
    if (path === "mask") {
      const messages = mapStrings(body.messages, (s) =>
        replaceAll(s, MASK)
      ) as unknown[];
      return Response.json({
        body: { messages: [{ content: NOTE, role: "system" }, ...messages] },
        entities: [
          {
            placeholder: "Персона_Женщина_ab12cd",
            type: "PERSON",
            value: "Смирнова Ольга Петровна",
          },
        ],
        ms: 1,
      });
    }
    const items = (
      body.items as { kind: string; text: string; final?: boolean }[]
    ).map((item) => {
      let { text } = item;
      let held = "";
      const tail = /Перс[А-ЯЁа-яё_0-9a-f]*$|\[\[[A-Z_0-9a-f]*\]?$/u.exec(text);
      if (item.kind === "stream" && !item.final && tail) {
        [held] = tail;
        text = text.slice(0, tail.index);
      }
      return { held, text: replaceAll(text, RESTORE) };
    });
    return Response.json({ items });
  };
  const fetch: typeof globalThis.fetch = (input, init) =>
    opts.down
      ? Promise.reject(new TypeError("fetch failed"))
      : Promise.resolve(answer(input, init));
  return { fetch, requests };
};

const sentToModel = (model: MockLanguageModelV4) =>
  JSON.stringify(
    [...model.doGenerateCalls, ...model.doStreamCalls].map((c) => c.prompt)
  );

describe("guardSession", () => {
  it("keeps what the guard accepts and pads a short id", () => {
    expect(guardSession("8c1e2a4b-1f00-4d1e-9c11-2a3b4c5d6e7f")).toBe(
      "8c1e2a4b-1f00-4d1e-9c11-2a3b4c5d6e7f"
    );
    expect(guardSession("task:42/run 7")).toBe("task-42-run-7");
    expect(guardSession("a")).toMatch(/^[A-Za-z0-9_-]{3}$/u);
  });
});

describe("isGuardUnavailable", () => {
  it("finds the guard's error inside what AI SDK wraps it in", () => {
    const wrapped = new Error("stream failed", {
      cause: new Error("call failed", { cause: new GuardUnavailableError() }),
    });
    expect(isGuardUnavailable(wrapped)).toBe(true);
    expect(isGuardUnavailable(new Error("timeout"))).toBe(false);
    expect(isGuardUnavailable(null)).toBe(false);
  });
});

describe("maskStrings", () => {
  it("masks every string of a decision state in one call and keeps its shape", async () => {
    const guard = fakeGuard();
    const state = {
      context: [{ role: "user", text: "Напиши Ольге Петровне" }],
      message: "почта olga@example.com",
      today: "17 November 2026",
    };
    const masked = await maskStrings(state, {
      fetch: guard.fetch,
      session: "chat-5",
      url: "http://guard",
    });
    expect(masked.context[0]?.text).toBe("Напиши Персоне_Женщине_ab12cd");
    expect(masked.message).toBe("почта [[EMAIL_e1f2a3]]");
    expect(masked.today).toBe("17 November 2026");
    expect(guard.requests).toHaveLength(1);
  });
});

describe("toChat", () => {
  it("writes masked texts back and keeps files, provider options and tool pairing", () => {
    const prompt = [
      { content: "Ты помощник.", role: "system" as const },
      {
        content: [
          { text: "Напиши Ольге Петровне", type: "text" as const },
          { data: "aGk=", mediaType: "image/png", type: "file" as const },
        ],
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        role: "user" as const,
      },
      {
        content: [
          { text: "думаю про olga@example.com", type: "reasoning" as const },
          {
            input: { to: "olga@example.com" },
            toolCallId: "x9",
            toolName: "send",
            type: "tool-call" as const,
          },
        ],
        role: "assistant" as const,
      },
      {
        content: [
          {
            output: {
              type: "json" as const,
              value: { from: "olga@example.com" },
            },
            toolCallId: "x9",
            toolName: "send",
            type: "tool-result" as const,
          },
        ],
        role: "tool" as const,
      },
    ];
    const { messages, writers } = toChat(prompt as never);
    expect(messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    expect(messages[2]?.tool_calls?.[0]?.id).toBe(messages[3]?.tool_call_id);
    const masked = mapStrings(messages, (s) =>
      s.split("olga@example.com").join("[[EMAIL_x1]]")
    ) as typeof messages;
    const out = [...prompt] as never[];
    for (const write of writers) {
      write(masked, out);
    }
    const text = JSON.stringify(out);
    expect(text).not.toContain("olga@example.com");
    expect(text).toContain('"type":"file"');
    expect(text).toContain("cacheControl");
    expect(text).toContain('"toolCallId":"x9"');
  });
});

describe("maskingMiddleware", () => {
  it("masks the prompt and restores a generated answer", async () => {
    const guard = fakeGuard();
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [
          { text: "Письмо отправлено Персоне_Женщине_ab12cd.", type: "text" },
        ],
        finishReason: stop,
        usage,
        warnings: [],
      },
    });
    const seen: unknown[] = [];
    const result = await generateText({
      model: wrapLanguageModel({
        middleware: maskingMiddleware({
          fetch: guard.fetch,
          onMasked: (call) => seen.push(call),
          session: "chat-1",
          url: "http://guard",
        }),
        model,
      }),
      prompt: "Напиши Ольге Петровне на olga@example.com",
    });
    for (const original of ORIGINALS) {
      expect(sentToModel(model)).not.toContain(original);
    }
    expect(sentToModel(model)).toContain(NOTE);
    expect(result.text).toBe("Письмо отправлено Смирновой Ольге Петровне.");
    expect(seen).toHaveLength(1);
  });

  it("restores a label split across stream deltas and gives the tool real values", async () => {
    const guard = fakeGuard();
    const sent: string[] = [];
    let step = 0;
    const model = new MockLanguageModelV4({
      doStream: () => {
        step += 1;
        const chunks =
          step === 1
            ? [
                {
                  id: "t",
                  toolName: "send",
                  type: "tool-input-start" as const,
                },
                {
                  delta: '{"to":"[[EMA',
                  id: "t",
                  type: "tool-input-delta" as const,
                },
                { id: "t", type: "tool-input-end" as const },
                {
                  input: '{"to":"[[EMAIL_e1f2a3]]"}',
                  toolCallId: "t",
                  toolName: "send",
                  type: "tool-call" as const,
                },
                {
                  finishReason: {
                    raw: undefined,
                    unified: "tool-calls" as const,
                  },
                  type: "finish" as const,
                  usage,
                },
              ]
            : [
                { id: "a", type: "text-start" as const },
                {
                  delta: "Готово, написал Персоне_Жен",
                  id: "a",
                  type: "text-delta" as const,
                },
                {
                  delta: "щине_ab12cd, с ",
                  id: "a",
                  type: "text-delta" as const,
                },
                {
                  delta: "Персоной_Женщиной_ab12cd всё ок.",
                  id: "a",
                  type: "text-delta" as const,
                },
                { id: "a", type: "text-end" as const },
                { finishReason: stop, type: "finish" as const, usage },
              ];
        // Two steps' parts are of different kinds; the mock takes any stream part.
        return Promise.resolve({
          stream: simulateReadableStream({ chunks: chunks as never[] }),
        });
      },
    });
    const result = streamText({
      model: wrapLanguageModel({
        middleware: maskingMiddleware({
          fetch: guard.fetch,
          session: "chat-2",
          url: "http://guard",
        }),
        model,
      }),
      prompt: "Напиши Ольге Петровне на olga@example.com",
      stopWhen: isStepCount(3),
      tools: {
        send: tool({
          execute: ({ to }) => {
            sent.push(to);
            return { ok: true };
          },
          inputSchema: z.object({ to: z.string() }),
        }),
      },
    });
    let text = "";
    for await (const delta of result.textStream) {
      text += delta;
    }
    expect(sent).toEqual(["olga@example.com"]);
    expect(text).toBe(
      "Готово, написал Смирновой Ольге Петровне, с Смирновой Ольгой Петровной всё ок."
    );
    for (const original of ORIGINALS) {
      expect(sentToModel(model)).not.toContain(original);
    }
  });

  it("passes plain deltas on without asking the guard", async () => {
    const guard = fakeGuard();
    const model = new MockLanguageModelV4({
      doStream: () =>
        Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              { id: "a", type: "text-start" as const },
              { delta: "Погода ", id: "a", type: "text-delta" as const },
              { delta: "хорошая.", id: "a", type: "text-delta" as const },
              { id: "a", type: "text-end" as const },
              { finishReason: stop, type: "finish" as const, usage },
            ],
          }),
        }),
    });
    const result = streamText({
      model: wrapLanguageModel({
        middleware: maskingMiddleware({
          fetch: guard.fetch,
          session: "chat-3",
          url: "http://guard",
        }),
        model,
      }),
      prompt: "Какая погода?",
    });
    expect(await result.text).toBe("Погода хорошая.");
    expect(guard.requests.filter((r) => r.path === "restore")).toHaveLength(0);
  });

  it("restores a structured (JSON) answer escaped", async () => {
    const guard = fakeGuard();
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ text: '{"to":"Персоне_Женщине_ab12cd"}', type: "text" }],
        finishReason: stop,
        usage,
        warnings: [],
      },
    });
    await generateText({
      model: wrapLanguageModel({
        middleware: maskingMiddleware({
          fetch: guard.fetch,
          session: "chat-6",
          url: "http://guard",
        }),
        model,
      }),
      output: Output.object({ schema: z.object({ to: z.string() }) }),
      prompt: "Кому писать?",
    });
    const kinds = guard.requests
      .filter((r) => r.path === "restore")
      .flatMap((r) => (r.body.items as { kind: string }[]).map((i) => i.kind));
    expect(kinds).toEqual(["arguments"]);
  });

  it("does not call the model when the guard is down", async () => {
    const guard = fakeGuard({ down: true });
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ text: "x", type: "text" }],
        finishReason: stop,
        usage,
        warnings: [],
      },
    });
    await expect(
      generateText({
        maxRetries: 0,
        model: wrapLanguageModel({
          middleware: maskingMiddleware({
            fetch: guard.fetch,
            session: "chat-4",
            url: "http://guard",
          }),
          model,
        }),
        prompt: "Напиши Ольге Петровне",
      })
    ).rejects.toBeInstanceOf(GuardUnavailableError);
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
