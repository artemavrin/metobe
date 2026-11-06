// «было → стало» on a task's card (P15): what is new in the value after a change, to be marked. The same start and
// end are cut off, and the middle widened to whole words, so «9:00» → «9:00 и 15:00» marks « и 15:00», not «5:00».

const isSpace = (c: string | undefined) => c === undefined || /\s/u.test(c);

export interface Marked {
  head: string;
  added: string;
  tail: string;
}

/** The new part of `after` against `before`; null when nothing was added (only taken away, or the same). */
export const markAdded = (before: string, after: string): Marked | null => {
  const most = Math.min(before.length, after.length);
  let start = 0;
  while (start < most && before[start] === after[start]) {
    start += 1;
  }
  // Back to the word's start first, so the same end is looked for in whole words.
  while (start > 0 && !isSpace(after[start - 1]) && !isSpace(after[start])) {
    start -= 1;
  }
  let end = 0;
  while (
    end < most - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end += 1;
  }
  let to = after.length - end;
  while (to < after.length && !isSpace(after[to - 1]) && !isSpace(after[to])) {
    to += 1;
  }
  const added = after.slice(start, to);
  if (added.trim() === "") {
    return null;
  }
  return { added, head: after.slice(0, start), tail: after.slice(to) };
};
