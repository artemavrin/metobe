import { describe, expect, it } from "vitest";

import { chatProblem, retryAtOf } from "./chat-errors";

describe("what went wrong with a chat request", () => {
  it("reads our code from a refused request's body", () => {
    expect(chatProblem(new Error('{"error":"model-unavailable"}'))).toBe(
      "model-unavailable"
    );
    expect(chatProblem(new Error('{"error":"forbidden"}'))).toBe("forbidden");
    expect(chatProblem(new Error('{"error":"daily-limit"}'))).toBe(
      "daily-limit"
    );
  });

  it("reads a failed generation's code from the stream", () => {
    expect(chatProblem(new Error("generation-failed"))).toBe(
      "generation-failed"
    );
  });

  it("tells the network from everything else", () => {
    expect(chatProblem(new TypeError("Failed to fetch"))).toBe("network");
    expect(chatProblem(new Error('{"error":"nope"}'))).toBe("unknown");
    expect(chatProblem(new Error("<html>Bad gateway</html>"))).toBe("unknown");
  });

  it("reads when a limited request may go again", () => {
    const at = "2026-10-07T11:30:00.000Z";
    expect(
      retryAtOf(new Error(`{"error":"daily-limit","retryAt":"${at}"}`))
    ).toEqual(new Date(at));
    expect(retryAtOf(new Error('{"error":"forbidden"}'))).toBeNull();
    expect(retryAtOf(new Error("generation-failed"))).toBeNull();
  });
});
