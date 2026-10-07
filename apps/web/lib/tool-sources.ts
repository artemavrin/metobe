import type { ChatMessage } from "@metobe/contracts/chat";
import type { JSONValue, Tool, ToolSet } from "ai";

import { PARTIAL_WARNING, summaryOf, tableOf } from "./tool-table";
import type { SourceTable } from "./tool-table";

// The results of the chat's MCP tools, by the id of the call (ARCH §9.2). The model is told a summary of a big one
// and asks for a chart or a table by that id (`from.ref`); the server takes the numbers from here — the full result
// of this answer's calls and of the ones the history keeps — so the widget shows what the tool said, not what the
// model remembers of it.

/** A widget asked for data the chat does not have; the message is for the model, which asks again. */
export class SourceError extends Error {
  override readonly name = "SourceError";
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** At least this many telling figures, this share of them found in one result: the widget is a copy of it. */
const COPY_MIN = 3;
const COPY_SHARE = 0.7;

export interface Sources {
  /** A call's result, as this answer got it. */
  note: (ref: string, output: unknown) => void;
  /** The table behind a ref; the latest table-like result when none is given. Throws `SourceError` when there is none. */
  resolve: (ref?: string) => { ref: string; table: SourceTable };
  /** The table behind a ref, if the result is one. */
  tableOf: (ref: string) => SourceTable | null;
  /**
   * The ref of the table-like result whose numbers these are — the model retyped a tool's numbers instead of asking
   * for them by `from`; undefined when they are not a result's (the user's own, a web page's, the model's sums).
   */
  copied: (numbers: number[]) => string | undefined;
}

/** The sources of a chat: the results its history keeps (the answer carried on after approvals included). */
export const createSources = (history: ChatMessage[]): Sources => {
  const outputs = new Map<string, unknown>();
  const tables = new Map<string, SourceTable | null>();
  for (const message of history) {
    for (const part of message.parts) {
      if (part.type === "dynamic-tool" && part.state === "output-available") {
        outputs.set(part.toolCallId, part.output);
      }
    }
  }
  const tableAt = (ref: string) => {
    if (!tables.has(ref)) {
      tables.set(ref, outputs.has(ref) ? tableOf(outputs.get(ref)) : null);
    }
    return tables.get(ref) ?? null;
  };
  const numbersOfTable = new Map<string, Set<number>>();
  const numbersAt = (ref: string) => {
    let set = numbersOfTable.get(ref);
    if (!set) {
      const table = tableAt(ref);
      set = new Set<number>();
      for (const row of table?.rows ?? []) {
        for (const cell of row) {
          if (typeof cell === "number") {
            set.add(round6(cell));
          }
        }
      }
      numbersOfTable.set(ref, set);
    }
    return set;
  };
  return {
    copied: (numbers) => {
      // Small whole numbers (a rank, a count of three) are in any table: only figures that tell are compared.
      const telling = numbers.filter(
        (n) => Math.abs(n) >= 100 || !Number.isInteger(n)
      );
      // The latest result first: it is the one the model has just read.
      const refs =
        telling.length < COPY_MIN
          ? []
          : // oxlint-disable-next-line unicorn/no-array-reverse -- a fresh array
            [...outputs.keys()].reverse();
      return refs.find((ref) => {
        if (!tableAt(ref)) {
          return false;
        }
        const own = numbersAt(ref);
        return (
          telling.filter((n) => own.has(round6(n))).length / telling.length >=
          COPY_SHARE
        );
      });
    },
    note: (ref, output) => {
      outputs.set(ref, output);
      tables.delete(ref);
      numbersOfTable.delete(ref);
    },
    resolve: (ref) => {
      const refs = [...outputs.keys()].filter((r) => tableAt(r));
      const found = ref ?? refs.at(-1);
      const table = found === undefined ? null : tableAt(found);
      if (found === undefined || !table) {
        throw new SourceError(
          ref === undefined
            ? "There is no table-like tool result in this chat to take data from. Call the tool that has the data first, or write the data yourself."
            : `There is no table result with ref "${ref}".${refs.length > 0 ? ` Refs of table results here: ${refs.join(", ")}.` : ""}`
        );
      }
      return { ref: found, table };
    },
    tableOf: tableAt,
  };
};

const isAsync = (value: unknown): value is AsyncIterable<unknown> =>
  typeof value === "object" && value !== null && Symbol.asyncIterator in value;

/** The text of a result's first text part — what a small table is told as, unchanged. */
const textOf = (output: unknown) => {
  const content = (output as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) {
    return null;
  }
  const part = content.find(
    (p) => (p as { type?: string } | null)?.type === "text"
  ) as { text?: unknown } | undefined;
  return typeof part?.text === "string" ? part.text : null;
};

const shared = (tool: Tool, sources: Sources): Tool => {
  const { execute } = tool;
  return {
    ...tool,
    ...(execute
      ? {
          execute: async (input: unknown, options: { toolCallId: string }) => {
            const result = await (
              execute as (i: unknown, o: unknown) => Promise<unknown>
            )(input, options);
            if (!isAsync(result)) {
              sources.note(options.toolCallId, result);
            }
            return result;
          },
        }
      : {}),
    // What the model sees of a result. A table is told as a summary (big) or as it is with its ref (small); anything
    // else as plain JSON, as before the widgets: the budget (lib/context-budget) reads and trims that.
    toModelOutput: ({ toolCallId, output }) => {
      const table = sources.tableOf(toolCallId);
      if (table) {
        const summary = summaryOf(table, toolCallId);
        const text = summary ?? textOf(output);
        if (text !== null) {
          return {
            type: "text",
            value: summary
              ? text
              : `${text}\n\n(ref ${toolCallId})${table.partial ? `\n\n${PARTIAL_WARNING}` : ""}`,
          };
        }
      }
      return typeof output === "string"
        ? { type: "text", value: output }
        : { type: "json", value: (output ?? null) as JSONValue };
    },
  } as Tool;
};

/** The MCP tools of a chat, each noting its results for the widgets and telling the model a table's summary. */
export const shareResults = (tools: ToolSet, sources: Sources): ToolSet =>
  Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [name, shared(tool, sources)])
  );
