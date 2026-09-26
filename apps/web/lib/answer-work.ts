import type { ChatMessage } from "@metobe/contracts/chat";

type Part = ChatMessage["parts"][number];
export type ToolPart = Extract<Part, { type: "dynamic-tool" }>;

export type WorkStep =
  | { kind: "thought"; key: string; text: string }
  | { kind: "note"; key: string; text: string }
  /** The same tool called several times in a row is one step. */
  | { kind: "tool"; key: string; calls: ToolPart[] };

/**
 * An answer split in two: its work — reasoning, tool calls and what the model said between them, everything up to
 * its last tool call — and the answer itself, the words after it. Without tools there is no work. Only a way to
 * draw the message: its parts, and what the model is sent, stay as they are.
 */
export const answerWork = (parts: Part[]) => {
  // findLastIndex is past the ES2022 target.
  let lastTool = -1;
  for (const [i, p] of parts.entries()) {
    if (p.type === "dynamic-tool") {
      lastTool = i;
    }
  }
  if (lastTool === -1) {
    return {
      answer: parts
        .flatMap((p) => (p.type === "text" ? [p.text] : []))
        .join("")
        .trim(),
      steps: [] as WorkStep[],
    };
  }
  const steps: WorkStep[] = [];
  let answer = "";
  for (const [i, part] of parts.entries()) {
    const last = steps.at(-1);
    if (part.type === "text" && i > lastTool) {
      answer += part.text;
    } else if (part.type === "dynamic-tool") {
      if (last?.kind === "tool" && last.calls[0]?.toolName === part.toolName) {
        last.calls.push(part);
      } else {
        steps.push({ calls: [part], key: part.toolCallId, kind: "tool" });
      }
    } else if (part.type === "reasoning" || part.type === "text") {
      const kind = part.type === "reasoning" ? "thought" : "note";
      if (!part.text.trim()) {
        continue;
      }
      if (last?.kind === kind) {
        last.text += part.text;
      } else {
        steps.push({ key: `${kind}:${i}`, kind, text: part.text });
      }
    }
  }
  return {
    answer: answer.trim(),
    steps: steps.map((s) =>
      s.kind === "tool" ? s : { ...s, text: s.text.trim() }
    ),
  };
};
