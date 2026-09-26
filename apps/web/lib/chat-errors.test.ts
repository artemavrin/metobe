import { describe, expect, it } from "vitest";

import { chatProblem } from "./chat-errors";

describe("what went wrong with a chat request", () => {
  it("reads our code from a refused request's body", () => {
    expect(chatProblem(new Error('{"error":"model-unavailable"}'))).toBe(
      "model-unavailable"
    );
    expect(chatProblem(new Error('{"error":"forbidden"}'))).toBe("forbidden");
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
});
