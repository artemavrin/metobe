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
