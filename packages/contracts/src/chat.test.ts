import { describe, expect, it } from "vitest";

import { chatRequestSchema } from "./chat";

const body = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  message: {
    id: crypto.randomUUID(),
    parts: [{ text: "Привет", type: "text" }],
    role: "user",
  },
  modelId: crypto.randomUUID(),
  ...over,
});

describe("chatRequestSchema", () => {
  it("takes one user message with text", () => {
    expect(chatRequestSchema.safeParse(body()).success).toBe(true);
  });

  it("refuses what the client may not send", () => {
    const { message } = body();
    for (const bad of [
      body({ modelId: "gpt-5" }),
      body({ message: { ...message, role: "assistant" } }),
      body({ message: { ...message, parts: [] } }),
      body({ message: { ...message, parts: [{ text: "", type: "text" }] } }),
    ]) {
      expect(chatRequestSchema.safeParse(bad).success).toBe(false);
    }
  });
});
