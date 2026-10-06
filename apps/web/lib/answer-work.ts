import type { ChatMessage } from "@metobe/contracts/chat";

type Part = ChatMessage["parts"][number];
export type ToolPart = Extract<Part, { type: "dynamic-tool" }>;
export type TablePart = Extract<Part, { type: "tool-show_table" }>;
export type ChartPart = Extract<Part, { type: "tool-show_chart" }>;
export type MetricsPart = Extract<Part, { type: "tool-show_metrics" }>;
export type ConnectPart = Extract<Part, { type: "tool-request_connection" }>;
export type SearchPart = Extract<Part, { type: "tool-find_tools" }>;
export type ReadPart = Extract<Part, { type: "tool-read_attachment" }>;
export type WebPart = Extract<
  Part,
  { type: "tool-web_search" } | { type: "tool-web_fetch" }
>;

export type WorkStep =
  | { kind: "thought"; key: string; text: string; timed: string[] }
  | { kind: "note"; key: string; text: string; timed: string[] }
  /** The same tool called several times in a row is one step. */
  | { kind: "tool"; key: string; calls: ToolPart[] }
  /** The model looking for a big server's tools. */
  | { kind: "search"; key: string; part: SearchPart }
  /** A web search or a page read. */
  | { kind: "web"; key: string; part: WebPart }
  /** The model reading a file the user attached. */
  | { kind: "read"; key: string; part: ReadPart };

/** What the answer shows, in order: its words, the tables, charts and figures the model built, and its asks to connect. */
export type AnswerBlock =
  | { kind: "text"; key: string; text: string }
  | { kind: "table"; key: string; part: TablePart }
  | { kind: "chart"; key: string; part: ChartPart }
  | { kind: "metrics"; key: string; part: MetricsPart }
  /** «Connect X to go on»: the answer waits on the user there. */
  | { kind: "connect"; key: string; part: ConnectPart };

/** Reasoning or words between tool calls: one step, or more of the step before it when it is of the same kind. */
const addWords = (
  steps: WorkStep[],
  kind: "thought" | "note",
  text: string,
  at: number,
  timed: string
) => {
  if (!text.trim()) {
    return;
  }
  const last = steps.at(-1);
  if (last?.kind === kind) {
    last.text += text;
    last.timed.push(timed);
  } else {
    steps.push({ key: `${kind}:${at}`, kind, text, timed: [timed] });
  }
};

/** A thought's or a text's place among the answer's own: the key the server times it by; none for other parts. */
const wordKey = (
  part: Part,
  seen: { reasoning: number; text: number }
): string => {
  if (part.type !== "reasoning" && part.type !== "text") {
    return "";
  }
  const key = `${part.type}:${seen[part.type]}`;
  seen[part.type] += 1;
  return key;
};

/** Where the work ends: the last call of a server's tool, of the search for them or of the web; -1 without any. */
const lastToolAt = (parts: Part[]) => {
  // findLastIndex is past the ES2022 target.
  let at = -1;
  for (const [i, p] of parts.entries()) {
    if (
      p.type === "dynamic-tool" ||
      p.type === "tool-find_tools" ||
      p.type === "tool-web_search" ||
      p.type === "tool-web_fetch" ||
      p.type === "tool-read_attachment"
    ) {
      at = i;
    }
  }
  return at;
};

/** A part that is a block of the answer of its own: a table, a chart, an ask to connect; null for anything else. */
const blockOf = (part: Part): AnswerBlock | null => {
  switch (part.type) {
    case "tool-show_table": {
      return { key: part.toolCallId, kind: "table", part };
    }
    case "tool-show_chart": {
      return { key: part.toolCallId, kind: "chart", part };
    }
    case "tool-show_metrics": {
      return { key: part.toolCallId, kind: "metrics", part };
    }
    case "tool-request_connection": {
      return { key: part.toolCallId, kind: "connect", part };
    }
    default: {
      return null;
    }
  }
};

/**
 * An answer split in two: its work — reasoning, tool calls and what the model said between them, everything up to
 * its last tool call — and the answer itself: the words after it and the tables and charts, wherever they come. Without tools
 * there is no work. Only a way to draw the message: its parts, and what the model is sent, stay as they are.
 */
export const answerWork = (parts: Part[]) => {
  const lastTool = lastToolAt(parts);
  const steps: WorkStep[] = [];
  const blocks: AnswerBlock[] = [];
  // The place of each thought and each text among the answer's own: the key the server times it by.
  const seen = { reasoning: 0, text: 0 };
  for (const [i, part] of parts.entries()) {
    const last = steps.at(-1);
    const timed = wordKey(part, seen);
    const lastBlock = blocks.at(-1);
    const block = blockOf(part);
    if (block) {
      blocks.push(block);
    } else if (part.type === "text" && i > lastTool) {
      if (lastBlock?.kind === "text") {
        lastBlock.text += part.text;
      } else {
        blocks.push({ key: `text:${i}`, kind: "text", text: part.text });
      }
    } else if (part.type === "tool-find_tools") {
      steps.push({ key: part.toolCallId, kind: "search", part });
    } else if (
      part.type === "tool-web_search" ||
      part.type === "tool-web_fetch"
    ) {
      steps.push({ key: part.toolCallId, kind: "web", part });
    } else if (part.type === "tool-read_attachment") {
      steps.push({ key: part.toolCallId, kind: "read", part });
    } else if (part.type === "dynamic-tool") {
      if (last?.kind === "tool" && last.calls[0]?.toolName === part.toolName) {
        last.calls.push(part);
      } else {
        steps.push({ calls: [part], key: part.toolCallId, kind: "tool" });
      }
    } else if (
      // Without tools the reasoning stays with the status line.
      lastTool !== -1 &&
      (part.type === "reasoning" || part.type === "text")
    ) {
      addWords(
        steps,
        part.type === "reasoning" ? "thought" : "note",
        part.text,
        i,
        timed
      );
    }
  }
  const answer = blocks
    .flatMap((b) => (b.kind === "text" ? [b.text] : []))
    .join("\n\n")
    .trim();
  return {
    answer,
    blocks: blocks.flatMap<AnswerBlock>((b) => {
      if (b.kind !== "text") {
        return [b];
      }
      const text = b.text.trim();
      return text ? [{ ...b, text }] : [];
    }),
    steps: steps.map((s) =>
      s.kind === "thought" || s.kind === "note"
        ? { ...s, text: s.text.trim() }
        : s
    ),
  };
};
