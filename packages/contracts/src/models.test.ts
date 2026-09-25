import { describe, expect, it } from "vitest";

import {
  capabilitiesSchema,
  sourceInputSchema,
  sourceOptionsSchema,
} from "./models";

describe("source options", () => {
  it("requires a real Yandex folder id", () => {
    expect(
      sourceOptionsSchema.safeParse({
        folderId: "b1gspae12afima6v89ts",
        kind: "yandex",
      }).success
    ).toBe(true);
    const bad = sourceOptionsSchema.safeParse({
      folderId: "abc",
      kind: "yandex",
    });
    expect(bad.success).toBe(false);
    // Messages are translation keys, not text (D31).
    expect(bad.error?.issues[0]?.message).toBe("folderId");
  });

  it("rejects an unknown kind", () => {
    expect(sourceOptionsSchema.safeParse({ kind: "cohere" }).success).toBe(
      false
    );
  });
});

describe("capabilities", () => {
  it("keeps «unknown» (null) apart from «no» (false)", () => {
    const parsed = capabilitiesSchema.parse({
      reasoning: null,
      structured: false,
      tools: true,
      vision: null,
    });
    expect(parsed.reasoning).toBeNull();
    expect(parsed.structured).toBe(false);
  });
});

const messages = (input: unknown) =>
  sourceInputSchema.safeParse(input).error?.issues.map((i) => i.message);

describe("source input", () => {
  it("needs a key everywhere but on OpenAI-compatible servers", () => {
    expect(messages({ kind: "openai", options: { kind: "openai" } })).toEqual([
      "apiKey",
    ]);
    expect(
      messages({
        baseUrl: "http://ollama:11434/v1",
        kind: "openai-compatible",
        options: { kind: "openai-compatible" },
      })
    ).toBeUndefined();
  });

  it("needs an http(s) address for an OpenAI-compatible server", () => {
    expect(
      messages({
        kind: "openai-compatible",
        options: { kind: "openai-compatible" },
      })
    ).toEqual(["baseUrl"]);
    expect(
      messages({
        baseUrl: "ollama:11434",
        kind: "openai-compatible",
        options: { kind: "openai-compatible" },
      })
    ).toEqual(["baseUrl"]);
  });

  it("keeps options of the same kind", () => {
    expect(
      messages({
        apiKey: "sk-x",
        kind: "openai",
        options: { kind: "anthropic" },
      })
    ).toEqual(["options"]);
  });
});
