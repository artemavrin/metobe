import type { ChatMessage } from "@metobe/contracts/chat";
import { describe, expect, it } from "vitest";

import { applyApprovals } from "./approvals";

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
