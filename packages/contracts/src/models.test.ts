import { describe, expect, it } from "vitest";

import { capabilitiesSchema, sourceOptionsSchema } from "./models";

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
