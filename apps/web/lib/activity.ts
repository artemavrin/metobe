import type { ChatServer } from "@metobe/core/mcp";

import type {
  ReadPart,
  SearchPart,
  ToolPart,
  WebPart,
  WorkStep,
} from "./answer-work";

// The work of an answer as a ribbon of steps: what each step is, where it stands, how long it took. Only a way to
// draw the message — its parts, and what the model is sent, stay as they are.

/** The user's own mail's tools (lib/email-tools). */
export const isMailTool = (
  name: string
): name is "email_send" | "email_search" | "email_read" =>
  name === "email_send" || name === "email_search" || name === "email_read";

/** A tool's server, by its name's prefix — the longest wins: `kaskad_hr` over `kaskad` — and its name without it. */
export const toolOwner = (toolName: string, servers: ChatServer[]) => {
  let server: ChatServer | undefined;
  for (const s of servers) {
    if (
      toolName.startsWith(`${s.key}_`) &&
      s.key.length > (server?.key.length ?? 0)
    ) {
      server = s;
    }
  }
  return {
    bare: server ? toolName.slice(server.key.length + 1) : toolName,
    server,
  };
};

/** A tool's name as people read it — its MCP title, else its name without the server's prefix — and its server. */
export const toolLook = (part: ToolPart, servers: ChatServer[]) => {
  const { bare, server } = toolOwner(part.toolName, servers);
  return { label: part.title ?? bare.replaceAll("_", " "), server };
};

/** What a tool gave back, readable: an MCP result's text, anything else as JSON; a long one is cut. */
export const outputText = (output: unknown) => {
  const content = (output as { content?: unknown } | null)?.content;
  const text = Array.isArray(content)
    ? content
        .flatMap((c: { type?: string; text?: string }) =>
          c.type === "text" && c.text ? [c.text] : []
        )
        .join("\n\n")
    : (JSON.stringify(output, null, 2) ?? "");
  return text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
};

export type CallState = "running" | "waiting" | "failed" | "denied" | "done";

/** Where a step of one or several calls of a tool stands: the first that is still busy or went wrong decides. */
export const stateOf = (calls: ToolPart[]): CallState => {
  if (
    calls.some(
      (c) => c.state === "input-streaming" || c.state === "input-available"
    )
  ) {
    return "running";
  }
  if (calls.some((c) => c.state === "approval-requested")) {
    return "waiting";
  }
  if (calls.some((c) => c.state === "output-error")) {
    return "failed";
  }
  return calls.every((c) => c.state === "output-denied") ? "denied" : "done";
};

/** A file read that came back with an `error` (the tool says it so, it does not throw). */
export const readFailed = (part: ReadPart) =>
  part.state === "output-available" && "error" in part.output;

/** Where a search for tools, or of the web, or a page read, or a file read stands. */
const partState = (part: SearchPart | WebPart | ReadPart): CallState => {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return "running";
  }
  if (part.type === "tool-read_attachment" && readFailed(part)) {
    return "failed";
  }
  return part.state === "output-error" ? "failed" : "done";
};

export interface ActivityRow {
  key: string;
  step: WorkStep;
  state: CallState;
  /** How long the step took as the server measured it; none for words, and for a call it did not see through. While a
   * call of the step still goes — the time of those that finished. */
  ms: number | undefined;
  /** When the call that still goes began (the server's clock): its time runs from there; none when not known. */
  startedAt: number | undefined;
  /** How many steps of the work this row counts: a tool called three times in a row is three. */
  count: number;
}

/**
 * The steps of the work as rows. A thought is «running» while it is the last thing the model did and the work goes
 * on; every other row's state is its calls'.
 */
export const activityRows = (
  steps: WorkStep[],
  working: boolean,
  timing: {
    stepMs?: Record<string, number>;
    stepStartedAt?: Record<string, number>;
  } = {}
): ActivityRow[] =>
  steps.map((step, i) => {
    const last = i === steps.length - 1;
    switch (step.kind) {
      case "thought":
      case "note": {
        // Every part of the step is timed by its own key; the step is their sum, and while the last is still
        // going, it counts on from its start.
        const known = step.timed.flatMap((k) => {
          const ms = timing.stepMs?.[k];
          return ms === undefined ? [] : [ms];
        });
        const going = step.timed.find(
          (k) => timing.stepMs?.[k] === undefined && timing.stepStartedAt?.[k]
        );
        return {
          count: 1,
          key: step.key,
          ms: known.length === 0 ? undefined : known.reduce((a, b) => a + b, 0),
          startedAt: going ? timing.stepStartedAt?.[going] : undefined,
          state: working && last ? "running" : "done",
          step,
        };
      }
      case "tool": {
        const known = step.calls.flatMap((c) => {
          const ms = timing.stepMs?.[c.toolCallId];
          return ms === undefined ? [] : [ms];
        });
        const going = step.calls.find(
          (c) => c.state === "input-streaming" || c.state === "input-available"
        );
        return {
          count: step.calls.length,
          key: step.key,
          ms: known.length === 0 ? undefined : known.reduce((a, b) => a + b, 0),
          startedAt: going
            ? timing.stepStartedAt?.[going.toolCallId]
            : undefined,
          state: stateOf(step.calls),
          step,
        };
      }
      default: {
        const state = partState(step.part);
        return {
          count: 1,
          key: step.key,
          ms: timing.stepMs?.[step.part.toolCallId],
          startedAt:
            state === "running"
              ? timing.stepStartedAt?.[step.part.toolCallId]
              : undefined,
          state,
          step,
        };
      }
    }
  });

/** A row that shows its content by itself: it is busy, waits for the user, or went wrong. */
export const opensByItself = (row: ActivityRow) =>
  row.state === "running" || row.state === "waiting" || row.state === "failed";

/** How many of the last rows stay in view once the older ones are folded into «more steps». */
const KEEP = 3;

/**
 * How many of the first rows fold into one line: a long series of steps shows its last few, the older ones — on a
 * click. Nothing folds while any of them is busy, waits or failed — that one must stay in sight.
 */
export const foldCount = (rows: ActivityRow[]) => {
  if (rows.length <= KEEP + 2) {
    return 0;
  }
  const count = rows.length - KEEP;
  return rows.slice(0, count).some(opensByItself) ? 0 : count;
};

/** «Работал 14 с · 7 шагов»: the parts the message knows; a part it does not know is left out. */
export const summaryFacts = (rows: ActivityRow[], workMs?: number) => ({
  seconds: workMs === undefined ? null : Math.max(1, Math.round(workMs / 1000)),
  steps: rows.reduce((sum, r) => sum + r.count, 0),
});
