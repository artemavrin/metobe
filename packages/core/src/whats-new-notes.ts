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
    admin: ["sandboxSettings"],
    date: "2026-11-21",
    featured: [],
    more: [],
    version: "0.11.1",
  },
  {
    admin: ["sandbox"],
    date: "2026-11-20",
    featured: ["codeFiles", "filePanel"],
    more: ["anyFile"],
    version: "0.11.0",
  },
  {
    admin: ["dataProtection", "modelTitle", "compatDecisions"],
    date: "2026-11-17",
    featured: ["modelSaw", "draftCheck"],
    more: ["memoryRow"],
    version: "0.10.0",
  },
  {
    admin: ["memorySlots", "telegramBot"],
    date: "2026-11-16",
    featured: [
      "memory",
      "forToday",
      "calendar",
      "schedule",
      "telegram",
      "mailWaits",
    ],
    more: ["meetingPrep", "mentionCard", "tableCopy", "sidebarWidth"],
    version: "0.9.0",
  },
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

/** Whether a version has anything for this person: a version with only an admin block is nothing to the rest. */
const hasFor = (n: ReleaseNote, admin: boolean) =>
  n.featured.length + n.more.length > 0 || (admin && n.admin.length > 0);

const unique = (ids: string[]) => [...new Set(ids)];

/**
 * Several missed versions as one: the cover is the newest one's, the big changes of all of them (newest first)
 * up to `MAX_FEATURED` — the rest go to «И ещё» — and every «И ещё» and admin line once.
 */
const mergeNotes = (missed: ReleaseNote[]): ReleaseNote => {
  const [newest] = missed;
  const all = unique(missed.flatMap((n) => n.featured));
  const featured = all.slice(0, MAX_FEATURED);
  return {
    admin: unique(missed.flatMap((n) => n.admin)),
    date: newest.date,
    featured,
    more: unique([
      ...all.slice(MAX_FEATURED),
      ...missed.flatMap((n) => n.more),
    ]).filter((id) => !featured.includes(id)),
    version: newest.version,
  };
};

/**
 * The window to show: every version past the one seen and not past the one running that has something for this
 * person, as one — a patch without news must not hide the minor before it. The cover carries the newest version.
 * None when the person turned it off, or when nothing was seen yet — a new account starts at the version it came in on.
 */
export const noteToShow = (
  { seen, off }: { seen: string | null; off: boolean },
  running: string,
  notes: ReleaseNote[] = RELEASE_NOTES,
  admin = false
): ReleaseNote | null => {
  if (off || seen === null) {
    return null;
  }
  const missed = notes.filter(
    (n) =>
      compareVersions(n.version, seen) > 0 &&
      compareVersions(n.version, running) <= 0 &&
      hasFor(n, admin)
  );
  return missed.length > 1 ? mergeNotes(missed) : (missed[0] ?? null);
};

/** «История изменений»: every version of this build, newest first — what it brought, as the window said it. */
export const notesUpTo = (
  running: string,
  notes: ReleaseNote[] = RELEASE_NOTES,
  admin = false
) =>
  notes.filter(
    (n) => compareVersions(n.version, running) <= 0 && hasFor(n, admin)
  );

/** What «Что нового» in the account menu opens: the newest version not past the one running. */
export const latestNote = (
  running: string,
  notes: ReleaseNote[] = RELEASE_NOTES,
  admin = false
): ReleaseNote | null =>
  notes.find(
    (n) => compareVersions(n.version, running) <= 0 && hasFor(n, admin)
  ) ?? null;
