import { describe, expect, it } from "vitest";

import { compareVersions } from "./updates-notes";
import {
  latestNote,
  MAX_FEATURED,
  notesUpTo,
  noteToShow,
  RELEASE_NOTES,
} from "./whats-new-notes";
import type { ReleaseNote } from "./whats-new-notes";

const note = (version: string): ReleaseNote => ({
  admin: [],
  date: "2026-01-01",
  featured: ["a"],
  more: [],
  version,
});

const NOTES = [note("0.8.0"), note("0.7.0"), note("0.6.0")];

describe("which «Что нового» opens by itself", () => {
  it("opens the newest version past the one seen, up to the one running", () => {
    expect(
      noteToShow({ off: false, seen: "0.6.0" }, "0.7.2", NOTES)?.version
    ).toBe("0.7.0");
    expect(
      noteToShow({ off: false, seen: "0.7.0" }, "0.8.0", NOTES)?.version
    ).toBe("0.8.0");
  });

  it("shows only the newest of several missed versions: the rest are on the history page", () => {
    expect(
      noteToShow({ off: false, seen: "0.5.0" }, "0.8.0", NOTES)
    ).toMatchObject({ version: "0.8.0" });
  });

  it("opens nothing once seen, or before the version is running", () => {
    expect(noteToShow({ off: false, seen: "0.8.0" }, "0.8.0", NOTES)).toBe(
      null
    );
    expect(noteToShow({ off: false, seen: "0.5.1" }, "0.5.1", NOTES)).toBe(
      null
    );
  });

  it("opens nothing for whoever turned it off, or for a new account", () => {
    expect(noteToShow({ off: true, seen: "0.5.1" }, "0.8.0", NOTES)).toBe(null);
    expect(noteToShow({ off: false, seen: null }, "0.8.0", NOTES)).toBe(null);
  });
});

describe("the history page", () => {
  it("lists every version up to the one running, newest first", () => {
    expect(notesUpTo("0.7.5", NOTES).map((n) => n.version)).toEqual([
      "0.7.0",
      "0.6.0",
    ]);
  });
});

describe("what the account menu offers to read again", () => {
  it("is the newest note of the running build", () => {
    expect(latestNote("0.7.5", NOTES)?.version).toBe("0.7.0");
    expect(latestNote("0.5.0", NOTES)).toBe(null);
  });
});

describe("the notes themselves", () => {
  it("go newest first, at most six big changes each, no change twice", () => {
    for (const [i, n] of RELEASE_NOTES.entries()) {
      const older = RELEASE_NOTES[i + 1];
      if (older) {
        expect(compareVersions(n.version, older.version)).toBe(1);
      }
    }
    for (const n of RELEASE_NOTES) {
      expect(n.featured.length).toBeLessThanOrEqual(MAX_FEATURED);
      const ids = [...n.featured, ...n.more, ...n.admin];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
