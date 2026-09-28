import type { Approvals, ChatMessage } from "@metobe/contracts/chat";

/**
 * The server's own copy of an answer with the user's decisions on its asked tool calls. Only calls still asking
 * take a decision, and only by their approval id — the client cannot touch anything else in the answer. Null when
 * no decision fits (nothing to carry on).
 */
export const applyApprovals = (
  answer: ChatMessage,
  decisions: Approvals["answers"]
): ChatMessage | null => {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  let applied = 0;
  const parts = answer.parts.map((part) => {
    if (part.type !== "dynamic-tool" || part.state !== "approval-requested") {
      return part;
    }
    const decision = byId.get(part.approval.id);
    if (!decision) {
      return part;
    }
    applied += 1;
    return {
      ...part,
      approval: {
        approved: decision.approved,
        id: part.approval.id,
        ...(decision.reason ? { reason: decision.reason } : {}),
      },
      state: "approval-responded" as const,
    };
  });
  return applied > 0 ? { ...answer, parts } : null;
};

/**
 * The server's own copy of an answer with the user's answers to its «connect X to go on». Connected is what the
 * server finds (`connected` by the server's key), never what the client says; «not now» stays «not now». Only
 * requests still waiting take an answer. Null when none fits.
 */
export const applyConnections = (
  answer: ChatMessage,
  answers: Approvals["connections"],
  connected: (server: string) => boolean
): ChatMessage | null => {
  const byId = new Map(answers.map((a) => [a.id, a]));
  let applied = 0;
  const parts = answer.parts.map((part) => {
    if (
      part.type !== "tool-request_connection" ||
      part.state !== "input-available"
    ) {
      return part;
    }
    const given = byId.get(part.toolCallId);
    if (!given) {
      return part;
    }
    applied += 1;
    return {
      ...part,
      output: { connected: given.connected && connected(part.input.server) },
      state: "output-available" as const,
    };
  });
  return applied > 0 ? { ...answer, parts } : null;
};

/**
 * An answer whose «connect X to go on» the user passed by with a new question: each request still waiting is taken
 * as «not connected» — a call without a result would be refused by the model's provider. The same answer when
 * nothing waits.
 */
export const settleAsks = (answer: ChatMessage): ChatMessage => {
  const waiting = answer.parts.some(
    (p) => p.type === "tool-request_connection" && p.state === "input-available"
  );
  if (!waiting) {
    return answer;
  }
  return {
    ...answer,
    parts: answer.parts.map((p) =>
      p.type === "tool-request_connection" && p.state === "input-available"
        ? { ...p, output: { connected: false }, state: "output-available" }
        : p
    ),
  };
};
