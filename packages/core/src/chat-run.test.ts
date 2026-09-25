import type { ModelMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { withPromptCache } = await import("./chat-run");

const chat: ModelMessage[] = [
  { content: "Первый вопрос", role: "user" },
  { content: "Ответ", role: "assistant" },
  { content: "Второй вопрос", role: "user" },
];

describe("withPromptCache", () => {
  it("marks the newest message for Anthropic and leaves the history as it was", () => {
    const { messages, providerOptions } = withPromptCache("anthropic", chat);
    expect(providerOptions).toBeUndefined();
    expect(messages.slice(0, -1)).toEqual(chat.slice(0, -1));
    expect(messages.at(-1)?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
    // The input is not touched: the stored history stays byte for byte the same.
    expect(chat.at(-1)?.providerOptions).toBeUndefined();
  });

  it("asks the Gateway to cache by itself", () => {
    expect(withPromptCache("gateway", chat)).toEqual({
      messages: chat,
      providerOptions: { gateway: { caching: "auto" } },
    });
  });

  it("leaves sources that cache a repeated prefix on their own", () => {
    for (const kind of ["openai", "yandex", "openai-compatible"] as const) {
      expect(withPromptCache(kind, chat)).toEqual({ messages: chat });
    }
  });
});
