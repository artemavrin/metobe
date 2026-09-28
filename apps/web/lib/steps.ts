import type { Instructions } from "ai";

/** How many steps an answer may take: a tool call and its result are one; real work in a 1С base needs a dozen. */
export const MAX_STEPS = 20;

const ANSWER_NOW =
  "No more tool calls are possible in this answer. Answer the user now with what you have found; say plainly what you could not find out.";

/**
 * The last step answers: no tools on it, and the model told so — otherwise an answer cut by the step limit ends on
 * a thought, with nothing said to the user.
 */
export const lastStepAnswers = ({
  stepNumber,
  instructions,
}: {
  stepNumber: number;
  instructions: Instructions | undefined;
}) => {
  if (stepNumber < MAX_STEPS - 1) {
    return;
  }
  const said = typeof instructions === "string" ? instructions : "";
  return {
    activeTools: [],
    instructions: said ? `${said}\n\n${ANSWER_NOW}` : ANSWER_NOW,
    toolChoice: "none" as const,
  };
};
