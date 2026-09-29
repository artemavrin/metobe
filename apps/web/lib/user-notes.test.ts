import { describe, expect, it } from "vitest";

import { aboutUser, withNotes } from "./user-notes";

describe("what the model is told about the user", () => {
  it("says nothing without notes", () => {
    expect(aboutUser("  ")).toBeUndefined();
    expect(withNotes("")).toBeUndefined();
  });

  it("puts the user's notes first and the services after", () => {
    const text = withNotes("Я бухгалтер, суммы в рублях", "MCP services: …");
    expect(text?.indexOf("Я бухгалтер")).toBeLessThan(
      text?.indexOf("MCP services") ?? 0
    );
    expect(text).toContain("their words");
  });

  it("gives the services alone when there are no notes", () => {
    expect(withNotes("", "MCP services: …")).toBe("MCP services: …");
  });
});
