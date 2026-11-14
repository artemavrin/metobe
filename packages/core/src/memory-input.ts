import type { Voices } from "./memory-evidence";
import { promptOf, splitQuoted } from "./memory-extract";
import type { ChatTurn } from "./memory-extract";

// The memory's material as lines with speakers (И1, MEMORY-PLAN §5.1): a chat's message is the person's line (and
// what they pasted, someone else's); a letter is its sender's line; a meeting's transcript — many lines, each with its
// speaker. The core reads the lines, not the source: who speaks decides what the words may change
// (`memory-evidence.ts`), not where they came from. No database here.

/** Who says a line: the person, someone the memory knows (a card's ref for the model), or someone by a name. */
export type Speaker =
  | { kind: "owner" }
  | { kind: "card"; ref: string; name: string }
  | { kind: "named"; name: string };

export interface Segment {
  speaker: Speaker;
  /** `own` — the speaker's own words; `quoted` — someone else's text the speaker brought (a forward, a paste). */
  voice: "own" | "quoted";
  text: string;
}

/** A chat's message: the person's words, and what they pasted or forwarded as someone else's (`splitQuoted`). */
export const messageSegments = (text: string): Segment[] => {
  const { own, quoted } = splitQuoted(text);
  if (!quoted) {
    return [{ speaker: { kind: "owner" }, text, voice: "own" }];
  }
  return [
    { speaker: { kind: "owner" }, text: own, voice: "own" },
    { speaker: { kind: "named", name: "" }, text: quoted, voice: "quoted" },
  ];
};

/** The person's own words are in the material: then they may settle and rule as always. */
export const ownerSpeaks = (segments: Segment[]) =>
  segments.some(
    (s) => s.speaker.kind === "owner" && s.voice === "own" && s.text.trim()
  );

/** Someone other than the person speaks in their own voice: a letter, a line of a meeting. */
export const othersSpeak = (segments: Segment[]) =>
  segments.some((s) => s.speaker.kind !== "owner" && s.voice === "own");

const byOf = (speaker: Speaker) => {
  if (speaker.kind === "card") {
    return `${speaker.name} (${speaker.ref})`;
  }
  return speaker.kind === "named" ? speaker.name : "user";
};

/**
 * The body of <message>. A chat's message — the person's words, with or without a paste — is written exactly as
 * before (S13 measured that wording): the text itself, or <user> and <quoted>. Lines of other speakers go in
 * <said by="…">, the person's in <user>.
 */
export const segmentsBody = (segments: Segment[]) => {
  const [first, second, ...rest] = segments;
  if (first?.speaker.kind === "owner" && first.voice === "own") {
    if (!second) {
      return first.text;
    }
    if (
      rest.length === 0 &&
      second.voice === "quoted" &&
      second.speaker.kind === "named" &&
      !second.speaker.name
    ) {
      return `<user>\n${first.text}\n</user>\n<quoted>\n${second.text}\n</quoted>`;
    }
  }
  return segments
    .map((s) => {
      if (s.speaker.kind === "owner" && s.voice === "own") {
        return `<user>\n${s.text}\n</user>`;
      }
      return s.voice === "quoted"
        ? `<quoted>\n${s.text}\n</quoted>`
        : `<said by="${byOf(s.speaker)}">\n${s.text}\n</said>`;
    })
    .join("\n");
};

/** What the writer reads (`memoryPrompt`, by lines): the chat before it, the material, the answer that retells. */
export const memoryPromptOf = (
  segments: Segment[],
  context: ChatTurn[] = [],
  answer?: string
) => promptOf(segmentsBody(segments), context, answer);

/** Which voices a material has: the person's own words, someone else's, the assistant's retelling. */
export const voicesOf = (segments: Segment[], answer?: string): Voices => ({
  answer: Boolean(answer),
  others: segments.some(
    (s) => (s.speaker.kind !== "owner" || s.voice === "quoted") && s.text.trim()
  ),
  owner: ownerSpeaks(segments),
});
