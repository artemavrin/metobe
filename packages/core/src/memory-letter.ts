import { z } from "zod";

// A reminder to the other side of a promise (Г2.4, P23 «Окно»): what the letter is built from, the letter by a
// template (no model — when the slot «Память» has none), and what the model is asked to write. No database here.

/** What is known of the promise: who owes, what, by when, since when — days already in the person's words. */
export interface LetterFacts {
  /** The card's name: «Ольга Ли», «ООО «Вектор»». */
  name: string;
  /** A person is greeted by name; an organization, not. */
  person: boolean;
  /** The promise as recorded: «Прислать подписанный договор». */
  text: string;
  /** The deadline's day, «13 ноября»; null — none. */
  due: string | null;
  /** The deadline has passed. */
  late: boolean;
  /** The day it was promised, «3 ноября»; null — not known. */
  given: string | null;
}

/** How the person asked the model to put it: as written first, shorter, or softer. */
export const letterTones = ["base", "short", "soft"] as const;
export type LetterTone = (typeof letterTones)[number];

export const letterSchema = z.object({
  subject: z.string().describe("The letter's subject, a few words, no «Re:»."),
  text: z
    .string()
    .describe(
      "The letter's body: a greeting, two or three short sentences, a thank-you. Plain paragraphs, no signature with a name."
    ),
});
export type Letter = z.infer<typeof letterSchema>;

/** The words a template letter is made of, in the person's language (`memory.letter.*`). */
export interface LetterWords {
  subject: (values: { text: string }) => string;
  hello: (values: { name: string }) => string;
  helloAll: () => string;
  body: (values: {
    text: string;
    due: string;
    late: "yes" | "no";
    given: string;
  }) => string;
  thanks: () => string;
}

/** «Прислать договор» → «прислать договор»: the promise inside a sentence. An abbreviation keeps its capitals. */
const inSentence = (text: string) => {
  const [first = "", second = ""] = text;
  return first === first.toUpperCase() && second === second.toUpperCase()
    ? text
    : first.toLowerCase() + text.slice(1);
};

/** The letter with no model: a greeting, what was promised and by when, a question, thanks. */
export const templateLetter = (facts: LetterFacts, words: LetterWords) => ({
  subject: words.subject({ text: facts.text }),
  text: [
    facts.person ? words.hello({ name: facts.name }) : words.helloAll(),
    words.body({
      due: facts.due ?? "none",
      given: facts.given ?? "none",
      late: facts.late ? "yes" : "no",
      text: inSentence(facts.text),
    }),
    words.thanks(),
  ].join("\n\n"),
});

const LANGUAGES: Record<string, string> = { en: "English", ru: "Russian" };

const TONES: Record<LetterTone, string> = {
  base: "Polite and to the point.",
  short: "As short as it can be: a greeting and one or two sentences.",
  soft: "Soft and friendly: no pressure, offer more time if they need it.",
};

export const LETTER_INSTRUCTIONS = `You write a short reminder letter from the user to someone who promised the user something.
Use only the facts given; never add a reason, a date or a detail that is not there. No placeholders such as [Name], no signature with a name — the mail adds the user's own.
Do not mention an app, a chat, a memory or notes: it is the user writing.`;

/** What the model is asked: the facts, the tone, the language. */
export const letterPrompt = (
  facts: LetterFacts,
  tone: LetterTone,
  locale: string
) =>
  [
    `To: ${facts.name} (${facts.person ? "a person — greet them by name as people do in this language" : "an organization — no name in the greeting"})`,
    `Promised: ${facts.text}`,
    facts.given ? `Promised on: ${facts.given}` : null,
    facts.due
      ? `Deadline: ${facts.due}${facts.late ? " (passed)" : ""}`
      : "Deadline: none",
    `Tone: ${TONES[tone]}`,
    `Language: ${LANGUAGES[locale] ?? "the language of the facts"}.`,
  ]
    .filter(Boolean)
    .join("\n");
