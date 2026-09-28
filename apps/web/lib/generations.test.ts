import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { endGeneration, startGeneration, stopGeneration } =
  await import("./generations");

describe("answers being written", () => {
  it("stops the chat's answer, once", () => {
    const answer = startGeneration("chat-a");
    expect(stopGeneration("chat-a")).toBe(true);
    expect(answer.signal.aborted).toBe(true);
    expect(stopGeneration("chat-a")).toBe(false);
  });

  it("stops only that chat", () => {
    const a = startGeneration("chat-b");
    const other = startGeneration("chat-c");
    stopGeneration("chat-b");
    expect(a.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false);
    endGeneration("chat-c", other);
  });

  it("a new answer stops the old one, and the old one's end leaves the new one", () => {
    const old = startGeneration("chat-d");
    const next = startGeneration("chat-d");
    expect(old.signal.aborted).toBe(true);
    endGeneration("chat-d", old);
    expect(stopGeneration("chat-d")).toBe(true);
    expect(next.signal.aborted).toBe(true);
  });

  it("has nothing to stop once the answer is done", () => {
    const done = startGeneration("chat-e");
    endGeneration("chat-e", done);
    expect(stopGeneration("chat-e")).toBe(false);
    expect(done.signal.aborted).toBe(false);
  });
});
