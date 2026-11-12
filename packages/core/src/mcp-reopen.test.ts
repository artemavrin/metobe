import type { ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";

import { isClosedClient, reopening } from "./mcp-reopen";

type Tool = ToolSet[string];

const CLOSED = "Attempted to send a request from a closed client";
const options = { context: {}, messages: [], toolCallId: "call-1" };

const toolOf = (execute: (input: unknown) => Promise<unknown>) =>
  ({ description: "a tool", execute, inputSchema: {} }) as unknown as Tool;

describe("isClosedClient", () => {
  it("knows the error of a request that never left a closed client", () => {
    expect(isClosedClient(new Error(CLOSED))).toBe(true);
  });

  it("does not take a dropped connection for it: that request may have been sent", () => {
    expect(isClosedClient(new Error("Connection closed"))).toBe(false);
    expect(isClosedClient(new Error("boom"))).toBe(false);
    expect(isClosedClient(CLOSED)).toBe(false);
  });
});

describe("reopening", () => {
  it("calls the same tool on a fresh client when its own was closed under the chat", async () => {
    const dead = toolOf(() => Promise.reject(new Error(CLOSED)));
    const alive = toolOf((input) => Promise.resolve({ again: input }));
    const reopen = vi.fn(() => Promise.resolve({ run_query: alive }));

    const tool = reopening(dead, "run_query", reopen);

    await expect(tool.execute?.({ q: 1 } as never, options)).resolves.toEqual({
      again: { q: 1 },
    });
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it("lets other errors through and does not reopen for them", async () => {
    const failing = toolOf(() =>
      Promise.reject(new Error("Connection closed"))
    );
    const reopen = vi.fn(() => Promise.resolve({}));

    const tool = reopening(failing, "run_query", reopen);

    await expect(tool.execute?.({} as never, options)).rejects.toThrow(
      "Connection closed"
    );
    expect(reopen).not.toHaveBeenCalled();
  });

  it("says so when the server no longer has the tool", async () => {
    const dead = toolOf(() => Promise.reject(new Error(CLOSED)));

    const tool = reopening(dead, "run_query", () => Promise.resolve({}));

    await expect(tool.execute?.({} as never, options)).rejects.toThrow(CLOSED);
  });

  it("leaves a tool without execute as it is", () => {
    const plain = {
      description: "no execute",
      inputSchema: {},
    } as unknown as Tool;
    expect(reopening(plain, "x", () => Promise.resolve({}))).toBe(plain);
  });
});
