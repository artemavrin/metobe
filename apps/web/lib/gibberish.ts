// The letters a title runs through while it is being named (after animata's «Gibberish text»): each letter shows
// random ones of its own kind — script and case — and settles into itself after a few frames. Spaces and marks stay.

const CYRILLIC = "абвгдежзиклмнопрстуфхцчшэюя";
const LATIN = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

/** A random letter of the same kind as `ch` (script, case, digit); anything else — a space, a mark — is itself. */
export const glyphFor = (ch: string, random: () => number = Math.random) => {
  const pick = (set: string) => set[Math.floor(random() * set.length)] ?? ch;
  const lower = ch.toLowerCase();
  const isUpper = ch !== lower;
  if (/[а-яё]/u.test(lower)) {
    return isUpper ? pick(CYRILLIC).toUpperCase() : pick(CYRILLIC);
  }
  if (/[a-z]/u.test(lower)) {
    return isUpper ? pick(LATIN).toUpperCase() : pick(LATIN);
  }
  return /\d/u.test(ch) ? pick(DIGITS) : ch;
};

/** The whole text as noise. */
export const scrambled = (text: string, random: () => number = Math.random) =>
  [...text].map((ch) => glyphFor(ch, random)).join("");

/** Frames of noise each letter shows before it settles: 5 to 14, as in the original. */
export const settleFrames = (
  text: string,
  random: () => number = Math.random
) => [...text].map(() => 5 + Math.floor(random() * 10));

/** The text at a frame of settling: a letter shows noise until its own frame count is reached. */
export const settling = (
  text: string,
  frames: number[],
  frame: number,
  random: () => number = Math.random
) =>
  [...text]
    .map((ch, i) => (frame >= (frames[i] ?? 0) ? ch : glyphFor(ch, random)))
    .join("");
