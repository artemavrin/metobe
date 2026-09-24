import { generateText } from "ai";
import { describe, expect, it } from "vitest";

import { buildProvider, yandexModelUri } from "./ai-build";

/** Records requests and answers like an OpenAI-compatible chat endpoint. */
const recorder = () => {
  const calls: {
    url: string;
    auth: string | null;
    body: { model?: string };
  }[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      auth: headers.get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : {},
      url: String(input),
    });
    return Promise.resolve(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "ok", role: "assistant" },
          },
        ],
        created: 0,
        id: "x",
        model: "m",
        object: "chat.completion",
        usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
      })
    );
  };
  return { calls, fetch };
};

describe("buildProvider", () => {
  it("builds the Yandex model URI from the folder and goes through the given fetch", async () => {
    const r = recorder();
    const p = buildProvider({
      apiKey: "AQVN-key",
      baseUrl: null,
      fetch: r.fetch,
      kind: "yandex",
      options: { folderId: "b1gspae12afima6v89ts", kind: "yandex" },
    });
    const { text } = await generateText({
      model: p.languageModel("yandexgpt-5.1"),
      prompt: "hi",
    });
    expect(text).toBe("ok");
    expect(r.calls[0]?.url).toBe(
      "https://ai.api.cloud.yandex.net/v1/chat/completions"
    );
    expect(r.calls[0]?.body.model).toBe(
      "gpt://b1gspae12afima6v89ts/yandexgpt-5.1/latest"
    );
    // S3: the key as Bearer, no OpenAI-Project header.
    expect(r.calls[0]?.auth).toBe("Bearer AQVN-key");
  });

  it("keeps a full Yandex URI as is", () => {
    expect(yandexModelUri("b1gX", "gpt://b1gX/aliceai-llm/latest")).toBe(
      "gpt://b1gX/aliceai-llm/latest"
    );
  });

  it("sends an OpenAI-compatible request to the source's own URL, without a key when there is none", async () => {
    const r = recorder();
    const p = buildProvider({
      apiKey: null,
      baseUrl: "http://ollama:11434/v1",
      fetch: r.fetch,
      kind: "openai-compatible",
      options: { kind: "openai-compatible" },
    });
    await generateText({ model: p.languageModel("gemma4:e4b"), prompt: "hi" });
    expect(r.calls[0]?.url).toBe("http://ollama:11434/v1/chat/completions");
    expect(r.calls[0]?.auth).toBeNull();
  });

  it("refuses an OpenAI-compatible source without a URL", () => {
    expect(() =>
      buildProvider({
        apiKey: null,
        baseUrl: null,
        fetch,
        kind: "openai-compatible",
        options: { kind: "openai-compatible" },
      })
    ).toThrow(/base URL/u);
  });

  it.each([
    ["openai", "https://api.openai.com/v1/"],
    ["anthropic", "https://api.anthropic.com/v1/"],
    ["gateway", "https://ai-gateway.vercel.sh/v4/ai"],
  ] as const)(
    "routes %s to its default endpoint through the given fetch",
    async (kind, prefix) => {
      const urls: string[] = [];
      const fetch: typeof globalThis.fetch = (input) => {
        urls.push(String(input));
        return Promise.resolve(new Response("nope", { status: 401 }));
      };
      const p = buildProvider({
        apiKey: "k",
        baseUrl: null,
        fetch,
        kind,
        options: { kind },
      });
      await expect(
        generateText({
          maxRetries: 0,
          model: p.languageModel("m"),
          prompt: "hi",
        })
      ).rejects.toThrow();
      expect(urls[0]?.startsWith(prefix)).toBe(true);
    }
  );
});
