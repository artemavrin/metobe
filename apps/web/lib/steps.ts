import type { Instructions, ModelMessage } from "ai";

/**
 * How many steps an answer may take: a tool call and its result are one. Real work in a 1С base — finding the
 * report, its fields, trying the query another way — took 20 and more in practice, so the ceiling is high; the
 * user can stop an answer at any time.
 */
export const MAX_STEPS = 100;

export const ANSWER_NOW =
  "No more tool calls are possible in this answer. Answer the user now with what you have found; say plainly what you could not find out.";

/**
 * The same, as the last message of the conversation: a reasoning model goes by the last turn more than by its
 * instructions, and without it may go on planning the next call and say nothing at all.
 */
export const ANSWER_NOW_TURN =
  "[The step limit of this answer is reached: no more tools.] Write your final answer to my question now, in my language, from what you have found so far. Say plainly what you could not find out.";

/**
 * The last step answers: no tools on it, and the model told so twice — in its instructions and as the last turn.
 * Otherwise an answer cut by the step limit ends on a thought, with nothing said to the user.
 */
export const lastStepAnswers = ({
  stepNumber,
  instructions,
  messages,
}: {
  stepNumber: number;
  instructions: Instructions | undefined;
  messages: ModelMessage[];
}) => {
  if (stepNumber < MAX_STEPS - 1) {
    return;
  }
  const said = typeof instructions === "string" ? instructions : "";
  return {
    activeTools: [],
    instructions: said ? `${said}\n\n${ANSWER_NOW}` : ANSWER_NOW,
    messages: [
      ...messages,
      { content: ANSWER_NOW_TURN, role: "user" as const },
    ],
    toolChoice: "none" as const,
  };
};
