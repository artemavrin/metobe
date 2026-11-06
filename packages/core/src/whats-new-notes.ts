import { compareVersions } from "./updates-notes";

// «Что нового» (docs/RELEASE.md): what each version tells the people in the chat, in their words — not the
// CHANGELOG. Here only which changes a version has and how they are shown; the words are in the messages
// (`whatsNew.changes.<id>`), in every language. Pure: `whats-new.ts` reads and writes the user's marks.

export interface ReleaseNote {
  version: string;
  /** `YYYY-MM-DD`: the cover says it in the reader's language. */
  date: string;
  /** The big ones: a page, a demo and a star each — at most six. */
  featured: string[];
  /** «И ещё»: a line each. */
  more: string[];
  /** «Для администратора»: shown to admins only. */
  admin: string[];
}

/** At most this many pages: a seventh is not read; the rest go to «И ещё». */
export const MAX_FEATURED = 6;

/** Newest first. */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    admin: [],
    date: "2026-11-06",
    featured: ["tasks"],
    more: [],
    version: "0.8.0",
  },
  {
    admin: ["summariesSlot"],
    date: "2026-11-03",
    featured: ["compactChat"],
    more: [],
    version: "0.7.0",
  },
  {
    admin: ["serverInstructions", "localSources"],
    date: "2026-11-03",
    featured: ["shareChat", "askUser", "threadMap", "greeting"],
    more: ["answerEnds", "chatHeader", "sidebar"],
    version: "0.6.0",
  },
];

/**
 * The window to show: the newest version past the one seen and not past the one running — only that one; versions
 * missed before it are on the history page, a button away. None when the person turned it off, or when nothing was
 * seen yet — a new account starts at the version it came in on.
 */
export const noteToShow = (
  { seen, off }: { seen: string | null; off: boolean },
  running: string,
  notes: ReleaseNote[] = RELEASE_NOTES
): ReleaseNote | null => {
  if (off || seen === null) {
    return null;
  }
  return (
    notes.find(
      (n) =>
        compareVersions(n.version, seen) > 0 &&
        compareVersions(n.version, running) <= 0
    ) ?? null
  );
};

/** «История изменений»: every version of this build, newest first — what it brought, as the window said it. */
export const notesUpTo = (
  running: string,
  notes: ReleaseNote[] = RELEASE_NOTES
) => notes.filter((n) => compareVersions(n.version, running) <= 0);

/** What «Что нового» in the account menu opens: the newest version not past the one running. */
export const latestNote = (
  running: string,
  notes: ReleaseNote[] = RELEASE_NOTES
): ReleaseNote | null =>
  notes.find((n) => compareVersions(n.version, running) <= 0) ?? null;
