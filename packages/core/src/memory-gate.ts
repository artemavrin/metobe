import type { Experimental_EvaluationQuestion } from "ai";

import { chatContext } from "./memory-extract";
import type { ChatTurn } from "./memory-extract";

// The first step of the silent writer (ARCH §19.4, Б2b): a decision model — the «Решения» job, Jev and the like,
// a few hundredths of a cent — answers yes/no questions about a message before the «Память» model reads it. Only a
// sure «no» to every one of them skips the message; anything else goes on as before. Free of the DB: S13 runs it.

/** The questions, English like S13's (their language did not matter; the message is Russian). */
export const GATE_QUESTIONS = {
  change: {
    instructions:
      "Does the message say that something about a promise, a plan or a meeting changed: it was done, sent, received, cancelled, moved, or someone changed their mind? Use the earlier conversation to understand short replies.",
    type: "boolean",
  },
  commitment: {
    instructions:
      "Does the message report a promise or obligation between people: someone has to do something for someone, with or without a deadline? A request to the assistant itself (write, count, make a plan) and a standing instruction to the assistant are not commitments.",
    type: "boolean",
  },
  event: {
    instructions:
      "Does the message report something that happened or is scheduled at a specific time (a meeting, a call, something sent or received, a signing)?",
    type: "boolean",
  },
  fact: {
    instructions:
      "Does the message state a lasting fact about a person, organization, project or the user (role, stage, attribute, preference)? One-time happenings are not facts.",
    type: "boolean",
  },
  remember: {
    instructions:
      "Does the user's message contain information about their work or life worth saving to long-term memory (people, organizations, projects, events, promises, preferences, standing instructions)? Requests to the assistant, questions and small talk are not.",
    type: "boolean",
  },
  rule: {
    instructions:
      "Does the user give a standing instruction about how or how often the assistant should remind them or highlight something?",
    type: "boolean",
  },
} as const satisfies Record<string, Experimental_EvaluationQuestion>;

export type GateAnswers = Record<
  keyof typeof GATE_QUESTIONS,
  { probability: number }
>;

/** Below this for every question — a sure «no»; S13's decision models were never wrong that sure. */
export const GATE_SKIP = 0.1;

/** What the decision model reads: today, the chat the message follows (to understand «она прислала»), the message. */
export const gateState = (
  message: string,
  today: string,
  context: ChatTurn[] = []
) => {
  // Plain objects: the state goes to the model as JSON.
  const earlier = chatContext(context).map(({ role, text }) => ({
    role,
    text,
  }));
  return {
    ...(earlier.length > 0 ? { earlier } : {}),
    message,
    today,
  };
};

/** Nothing to keep — every answer a sure «no»; otherwise the «Память» model reads the message. */
export const nothingToKeep = (answers: GateAnswers) =>
  Object.values(answers).every((a) => a.probability < GATE_SKIP);
