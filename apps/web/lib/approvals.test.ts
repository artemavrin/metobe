import type { ChatMessage } from "@metobe/contracts/chat";
import { describe, expect, it } from "vitest";

import { applyApprovals, applyConnections, settleAsks } from "./approvals";

const asking = (toolCallId: string, approvalId: string) =>
  ({
    approval: { id: approvalId },
    input: { q: "x" },
    state: "approval-requested",
    toolCallId,
    toolName: "github_create_issue",
    type: "dynamic-tool",
  }) as ChatMessage["parts"][number];

const answer: ChatMessage = {
  id: "a1",
  parts: [asking("call-1", "ap-1"), asking("call-2", "ap-2")],
  role: "assistant",
};

describe("applying the user's answers to approvals", () => {
  it("marks each asked call with the user's yes or no", () => {
    const next = applyApprovals(answer, [
      { approved: true, id: "ap-1" },
      { approved: false, id: "ap-2", reason: "не сейчас" },
    ]);
    expect(next?.parts).toMatchObject([
      { approval: { approved: true, id: "ap-1" }, state: "approval-responded" },
      {
        approval: { approved: false, id: "ap-2", reason: "не сейчас" },
        state: "approval-responded",
      },
    ]);
  });

  it("leaves what it was not asked alone, and answers nothing twice", () => {
    const once = applyApprovals(answer, [{ approved: true, id: "ap-1" }]);
    expect(once?.parts[1]).toMatchObject({ state: "approval-requested" });
    expect(
      once && applyApprovals(once, [{ approved: false, id: "ap-1" }])
    ).toBe(null);
  });

  it("refuses answers to approvals the answer does not have", () => {
    expect(applyApprovals(answer, [{ approved: true, id: "made-up" }])).toBe(
      null
    );
  });
});

const requesting = (toolCallId: string, server: string) =>
  ({
    input: { reason: "Сделки лежат в Битрикс24", server },
    state: "input-available",
    toolCallId,
    type: "tool-request_connection",
  }) as ChatMessage["parts"][number];

const paused: ChatMessage = {
  id: "a2",
  parts: [requesting("call-9", "bitrix")],
  role: "assistant",
};

describe("applying the user's answer to «connect X to go on»", () => {
  it("says connected only when the server really is", () => {
    expect(
      applyConnections(paused, [{ connected: true, id: "call-9" }], () => true)
        ?.parts[0]
    ).toMatchObject({ output: { connected: true }, state: "output-available" });
    expect(
      applyConnections(paused, [{ connected: true, id: "call-9" }], () => false)
        ?.parts[0]
    ).toMatchObject({ output: { connected: false } });
  });

  it("takes «not now» as it is", () => {
    expect(
      applyConnections(paused, [{ connected: false, id: "call-9" }], () => true)
        ?.parts[0]
    ).toMatchObject({ output: { connected: false } });
  });

  it("answers a request once, and nothing it was not asked", () => {
    const once = applyConnections(
      paused,
      [{ connected: true, id: "call-9" }],
      () => true
    );
    expect(
      once &&
        applyConnections(once, [{ connected: false, id: "call-9" }], () => true)
    ).toBe(null);
    expect(
      applyConnections(paused, [{ connected: true, id: "made-up" }], () => true)
    ).toBe(null);
  });
});

describe("a new question past «connect X to go on»", () => {
  it("takes the waiting request as not connected", () => {
    expect(settleAsks(paused).parts[0]).toMatchObject({
      output: { connected: false },
      state: "output-available",
    });
  });

  it("leaves an answer with nothing waiting as it is", () => {
    expect(settleAsks(answer)).toBe(answer);
  });
});
