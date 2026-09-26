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

  it("takes the user's answers to approvals instead of a message", () => {
    const approvals = {
      answers: [{ approved: true, id: "approval-1" }],
      messageId: crypto.randomUUID(),
    };
    expect(
      chatRequestSchema.safeParse(body({ approvals, message: undefined }))
        .success
    ).toBe(true);
    expect(chatRequestSchema.safeParse(body({ approvals })).success).toBe(
      false
    );
    expect(
      chatRequestSchema.safeParse(body({ message: undefined })).success
    ).toBe(false);
    expect(
      chatRequestSchema.safeParse(
        body({ approvals: { ...approvals, answers: [] }, message: undefined })
      ).success
    ).toBe(false);
  });
});
