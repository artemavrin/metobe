import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { withoutNul } = await import("./chat");

describe("a message on its way to Postgres", () => {
  it("loses its NUL characters, however deep, and nothing else", () => {
    const parts = [
      { text: "Калуга\u0000 и Тула", type: "text" },
      {
        output: { page: 1, pages: [{ text: "a\u0000b" }] },
        type: "tool-read_attachment",
      },
    ];
    expect(withoutNul(parts)).toEqual([
      { text: "Калуга и Тула", type: "text" },
      {
        output: { page: 1, pages: [{ text: "ab" }] },
        type: "tool-read_attachment",
      },
    ]);
    expect(withoutNul(null)).toBeNull();
    const at = new Date();
    expect(withoutNul({ at }).at).toBe(at);
  });
});
