import { describe, expect, it } from "vitest";

import { yandexFetch } from "./ai-yandex-fetch";

// Raw streams recorded from Yandex AI Studio in spike S3 (Alice AI), the folder replaced.
const AUTO_WITHOUT_FINISH = [
  'data: {"id":"chatcmpl-d977","object":"chat.completion.chunk","model":"gpt://f/aliceai-llm/latest","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"weather","type":"function","function":{"name":"weather","arguments":"{\\"city\\":\\"Moscow\\"}"}}]}}]}',
  'data: {"id":"chatcmpl-d977","object":"chat.completion.chunk","model":"gpt://f/aliceai-llm/latest","choices":[],"usage":{"prompt_tokens":62,"total_tokens":73,"completion_tokens":11}}',
  "data: [DONE]",
];
const REQUIRED_WITH_TOKEN = [
  'data: {"id":"chatcmpl-fa5a","object":"chat.completion.chunk","model":"gpt://f/aliceai-llm/latest","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"weather","type":"function","function":{"name":"weather","arguments":"{\\"city\\":\\"Москва\\"}"}}]}}]}',
  'data: {"id":"chatcmpl-fa5a","object":"chat.completion.chunk","model":"gpt://f/aliceai-llm/latest","choices":[{"index":0,"delta":{"role":"assistant","content":"[TOOL_CALL_END]"},"finish_reason":"tool_calls"}]}',
  "data: [DONE]",
];
const PLAIN_TEXT = [
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Париж"}}]}',
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  "data: [DONE]",
];

/** Serves `lines` as SSE, split into small pieces to exercise buffering across chunk boundaries. */
const serve =
  (lines: string[]): typeof fetch =>
  () => {
    const text = `${lines.join("\n\n")}\n\n`;
    const pieces = text.match(/[\s\S]{1,37}/gu) ?? [];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) {
          controller.enqueue(new TextEncoder().encode(piece));
        }
        controller.close();
      },
    });
    return Promise.resolve(
      new Response(body, { headers: { "content-type": "text/event-stream" } })
    );
  };

const events = async (lines: string[]) => {
  const res = await yandexFetch(serve(lines))(
    "https://ai.api.cloud.yandex.net/v1/chat/completions"
  );
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map(
      (l) =>
        JSON.parse(l.slice(6)) as {
          choices: {
            finish_reason?: string;
            delta?: { content?: string; tool_calls?: { id: string }[] };
          }[];
        }
    );
};

describe("yandexFetch (spike S3)", () => {
  it("adds the missing finish_reason after a tool call", async () => {
    const out = await events(AUTO_WITHOUT_FINISH);
    expect(out.at(-1)?.choices[0]?.finish_reason).toBe("tool_calls");
  });

  it("drops the leaked [TOOL_CALL_END] and keeps one finish_reason", async () => {
    const out = await events(REQUIRED_WITH_TOKEN);
    const text = out
      .flatMap((c) => c.choices.map((ch) => ch.delta?.content ?? ""))
      .join("");
    expect(text).not.toContain("TOOL_CALL_END");
    expect(
      out.filter((c) => c.choices.some((ch) => ch.finish_reason)).length
    ).toBe(1);
  });

  it("makes tool call ids unique per response", async () => {
    const [a] = await events(AUTO_WITHOUT_FINISH);
    const [b] = await events(REQUIRED_WITH_TOKEN);
    const idA = a?.choices[0]?.delta?.tool_calls?.[0]?.id;
    const idB = b?.choices[0]?.delta?.tool_calls?.[0]?.id;
    expect(idA).not.toBe("weather");
    expect(idA).not.toBe(idB);
  });

  it("leaves ordinary streams as they are", async () => {
    const out = await events(PLAIN_TEXT);
    expect(
      out.map(
        (c) => c.choices[0]?.delta?.content ?? c.choices[0]?.finish_reason
      )
    ).toEqual(["Париж", "stop"]);
  });
});
