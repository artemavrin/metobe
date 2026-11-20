import type { ChatMessage } from "@metobe/contracts/chat";

type Part = ChatMessage["parts"][number];
export type ToolPart = Extract<Part, { type: "dynamic-tool" }>;
export type TablePart = Extract<Part, { type: "tool-show_table" }>;
export type ChartPart = Extract<Part, { type: "tool-show_chart" }>;
export type MetricsPart = Extract<Part, { type: "tool-show_metrics" }>;
export type CardPart = Extract<Part, { type: "tool-show_card" }>;
export type PromisesPart = Extract<Part, { type: "tool-show_promises" }>;
export type ConnectPart = Extract<Part, { type: "tool-request_connection" }>;
export type AskPart = Extract<Part, { type: "tool-ask_user" }>;
export type TaskDraftPart = Extract<Part, { type: "tool-draft_task" }>;
export type SearchPart = Extract<Part, { type: "tool-find_tools" }>;
export type ReadPart = Extract<Part, { type: "tool-read_attachment" }>;
export type CodePart = Extract<
  Part,
  | { type: "tool-run_code" }
  | { type: "tool-use_file" }
  | { type: "tool-share_file" }
>;
export type MadePart = Extract<Part, { type: "tool-share_file" }>;
export type SkillPart = Extract<
  Part,
  { type: "tool-load_skill" } | { type: "tool-read_skill_file" }
>;
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
  | { kind: "read"; key: string; part: ReadPart }
  /** The model loading a skill, or reading a file of one. */
  | { kind: "skill"; key: string; part: SkillPart }
  /** Code run in the sandbox, a file put back in it, or one that could not be handed over (D47). */
  | { kind: "code"; key: string; part: CodePart };

/** What the answer shows, in order: its words, the tables, charts and figures the model built, and its asks to connect. */
export type AnswerBlock =
  | { kind: "text"; key: string; text: string }
  | { kind: "table"; key: string; part: TablePart }
  | { kind: "chart"; key: string; part: ChartPart }
  | { kind: "metrics"; key: string; part: MetricsPart }
  /** A card, or a list of open promises, the memory put in the answer (Д1). */
  | { kind: "memory-card"; key: string; part: CardPart }
  | { kind: "memory-promises"; key: string; part: PromisesPart }
  /** «Connect X to go on»: the answer waits on the user there. */
  | { kind: "connect"; key: string; part: ConnectPart }
  /** The model's questions: answered, what the user said stands there as their own message. */
  | { kind: "ask"; key: string; part: AskPart }
  /** A periodic task drafted from the person's words: its card, created from there (P11). */
  | { kind: "task"; key: string; part: TaskDraftPart }
  /** A file the sandbox handed over (D47). */
  | { kind: "file"; key: string; part: MadePart };

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
      p.type === "tool-read_attachment" ||
      p.type === "tool-load_skill" ||
      p.type === "tool-read_skill_file" ||
      p.type === "tool-run_code" ||
      p.type === "tool-use_file"
    ) {
      at = i;
    }
  }
  return at;
};

/** A part that is a step of the work by itself: a search for tools, of the web, a page read, a file read, a skill. */
const singleStep = (part: Part): WorkStep | null => {
  switch (part.type) {
    case "tool-find_tools": {
      return { key: part.toolCallId, kind: "search", part };
    }
    case "tool-web_search":
    case "tool-web_fetch": {
      return { key: part.toolCallId, kind: "web", part };
    }
    case "tool-read_attachment": {
      return { key: part.toolCallId, kind: "read", part };
    }
    case "tool-load_skill":
    case "tool-read_skill_file": {
      return { key: part.toolCallId, kind: "skill", part };
    }
    case "tool-run_code":
    case "tool-use_file":
    case "tool-share_file": {
      return { key: part.toolCallId, kind: "code", part };
    }
    default: {
      return null;
    }
  }
};

/** A part that is a block of the answer of its own: a table, a chart, an ask to connect, questions; null for anything else. */
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
    case "tool-show_card": {
      return { key: part.toolCallId, kind: "memory-card", part };
    }
    case "tool-show_promises": {
      return { key: part.toolCallId, kind: "memory-promises", part };
    }
    case "tool-request_connection": {
      return { key: part.toolCallId, kind: "connect", part };
    }
    case "tool-ask_user": {
      return { key: part.toolCallId, kind: "ask", part };
    }
    case "tool-draft_task": {
      return { key: part.toolCallId, kind: "task", part };
    }
    // Handed over, the file is part of the answer; a failure stays a step of the work.
    case "tool-share_file": {
      return part.state === "output-available" && "id" in part.output
        ? { key: part.toolCallId, kind: "file", part }
        : null;
    }
    default: {
      return null;
    }
  }
};

/** Whether a block is a widget the model built (a table, a chart, figures) that the server could not. */
const failedWidget = (b: AnswerBlock) =>
  (b.kind === "table" || b.kind === "chart" || b.kind === "metrics") &&
  b.part.state === "output-error";

/**
 * A widget the server could not build is dropped when the model built the same kind again after it and that one
 * stands: the user sees the chart, not the failed attempt before it (the model has read why it failed). A widget that
 * failed and was not built again stays, with its reason.
 */
const withoutRetried = (blocks: AnswerBlock[]) =>
  blocks.filter(
    (b, i) =>
      !(
        failedWidget(b) &&
        blocks
          .slice(i + 1)
          .some((later) => later.kind === b.kind && !failedWidget(later))
      )
  );

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
    } else if (singleStep(part)) {
      steps.push(singleStep(part) as WorkStep);
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
    blocks: withoutRetried(
      blocks.flatMap<AnswerBlock>((b) => {
        if (b.kind !== "text") {
          return [b];
        }
        const text = b.text.trim();
        return text ? [{ ...b, text }] : [];
      })
    ),
    steps: steps.map((s) =>
      s.kind === "thought" || s.kind === "note"
        ? { ...s, text: s.text.trim() }
        : s
    ),
  };
};
