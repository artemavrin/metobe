// What a set hands to `pnpm memory:eval` (S15, MEMORY-PLAN §4): its cases, each with what the model is sent and how
// the answer is judged. A set keeps its own command and printing; these are for the run of all sets at once.

import { fileURLToPath } from "node:url";

import type { extractionSchema } from "../../packages/core/src/memory-extract.ts";
import type { RelationAnswer } from "../../packages/core/src/memory-relations.ts";

export type Out = (typeof extractionSchema)["_output"];

/** By measure: how many were right, of how many. */
export type Tally = Record<string, [right: number, of: number]>;

export interface Verdict {
  /** null — right; otherwise what went wrong, for the console only. */
  miss: string | null;
  tally: Tally;
}

export type EvalCase =
  /** A message for the «Память» model. */
  | { kind: "write"; id: string; text: string; instructions: string; prompt: string; score: (out: Out) => Verdict }
  /** A writer's replacement for the decision model to confirm: the message, the new and the old record, their days (ARCH §19.9.3). */
  | { kind: "relation"; id: string; text: string; state: unknown; score: (answers: Record<string, RelationAnswer>) => Verdict };

/** The place of a case in its set: new cases go to the end, so the ids of the old ones hold. */
export const caseId = (index: number) => String(index + 1).padStart(2, "0");

/** The file is the one run, not imported: only then a set calls the model itself. */
export const isMain = (url: string) => process.argv[1] === fileURLToPath(url);
