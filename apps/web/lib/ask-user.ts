import {
  askUserInputSchema,
  askUserOutputSchema,
} from "@metobe/contracts/chat";
import type {
  Approvals,
  AskUserInput,
  AskUserOutput,
  ChatMessage,
} from "@metobe/contracts/chat";
import { tool } from "ai";
import type { Tool } from "ai";

// «Модель спрашивает» — after Claude's AskUserQuestion: the answer needs what only the user knows, so the model asks
// instead of guessing. No execute — the answer stops on the call, the chat shows the questions in the composer's
// place, and what the user said comes back as its output; then the answer carries on by itself.

/** The tool's name — the answer draws its part (`tool-ask_user`) as the user's own message once answered. */
export const ASK_USER = "ask_user";

type Part = ChatMessage["parts"][number];
export type AskUserPart = Extract<Part, { type: "tool-ask_user" }>;
/** A call whose questions are all there and wait on the user. */
export type OpenAskPart = Extract<AskUserPart, { state: "input-available" }>;

/** At most this many words per question: the choices (up to 4) and the user's own line. */
const MAX_PICKS = 5;

/** What the model reads back: each question with what was said, or that the user left it to the model. */
export const askUserModelText = (
  input: AskUserInput,
  output: AskUserOutput
) => {
  if (output.skipped) {
    return "The user did not answer and left it to you. Go on with your best judgment, and say in a few words which choice you made.";
  }
  const lines = input.questions.map((q) => {
    const said = output.answers[q.question] ?? [];
    return `- ${q.question} → ${said.length > 0 ? said.join(", ") : "(no answer — decide yourself)"}`;
  });
  return ["The user answered:", ...lines].join("\n");
};

export const askUserTool: Tool<AskUserInput, AskUserOutput> = tool({
  description: [
    "Ask the user what only they know when the answer depends on it and a wrong guess would waste their time: a period, whom a letter goes to, which of several reports or formats.",
    "Do not ask what the question already says, what you can look up with your tools, or out of politeness — then just answer.",
    "Ask once, 1–4 questions, each with 2–4 short choices; put the likely choice first. The user can always write their own answer or let you decide — never list «other» yourself.",
    "Before the call, say in one short sentence, in the user's language, why you ask. Write the questions and choices in the user's language too.",
  ].join(" "),
  inputSchema: askUserInputSchema,
  outputSchema: askUserOutputSchema,
  toModelOutput: ({ input, output }) => ({
    type: "text",
    value: askUserModelText(input, output),
  }),
});

/**
 * What the user said, as the server keeps it: only answers to questions this call asked, each trimmed, without
 * repeats, a single choice question with one answer. «Let the model decide» drops whatever was picked.
 */
export const keptAnswers = (
  input: AskUserInput,
  given: Approvals["questions"][number]
): AskUserOutput => {
  if (given.skipped) {
    return { answers: {}, skipped: true };
  }
  const answers: Record<string, string[]> = {};
  for (const q of input.questions) {
    const said = [
      ...new Set(
        (given.answers[q.question] ?? []).map((s) => s.trim()).filter(Boolean)
      ),
    ].slice(0, q.multiSelect ? MAX_PICKS : 1);
    if (said.length > 0) {
      answers[q.question] = said;
    }
  }
  return { answers, skipped: false };
};

/** The user's answers to an answer's questions, as the request carries them. */
export const questionsOf = (answer: ChatMessage) =>
  answer.parts.flatMap((p) =>
    p.type === "tool-ask_user" && p.state === "output-available"
      ? [
          {
            answers: p.output.answers,
            id: p.toolCallId,
            skipped: p.output.skipped,
          },
        ]
      : []
  );

/** The question an answer still waits on — the last call with no output; none when nothing waits. */
export const openQuestion = (
  answer: ChatMessage | undefined
): OpenAskPart | null => {
  if (answer?.role !== "assistant") {
    return null;
  }
  let open: OpenAskPart | null = null;
  for (const p of answer.parts) {
    if (p.type === "tool-ask_user" && p.state === "input-available") {
      open = p;
    }
  }
  return open;
};
