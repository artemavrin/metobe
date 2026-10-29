// What a Metobe release says (D35): its version, compared as numbers, and its notes as release-please writes them on
// GitHub — «### Features» and «### Bug Fixes» lists of commit subjects, each with its commit's link at the end. Pure:
// the check in `updates.ts` fetches, this reads.

export interface ReleaseNotes {
  features: string[];
  fixes: string[];
}

export interface Release extends ReleaseNotes {
  version: string;
  /** `YYYY-MM-DD`. */
  date: string;
  url: string;
}

const parts = (v: string) =>
  v
    .replace(/^v/u, "")
    .split("-")[0]
    ?.split(".")
    .map((n) => Math.trunc(Number(n)) || 0) ?? [];

/** -1, 0 or 1, as `a` is older, the same as or newer than `b`. A pre-release tail is ignored. */
export const compareVersions = (a: string, b: string) => {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) {
      return d > 0 ? 1 : -1;
    }
  }
  return 0;
};

/** «* skills in the chat — pick one with / ([d03c057](https://…))» → «skills in the chat — pick one with /». */
const clean = (line: string) =>
  line
    .replace(/^\s*[*-]\s+/u, "")
    // The links release-please appends: the commit, and the pull request before it.
    .replace(/(?:\s*\(\[[^\]]*\]\([^)]*\)\))+\s*$/u, "")
    // A scope in bold: «**chat:** …».
    .replace(/^\*\*[^*]+:\*\*\s*/u, "")
    .trim();

export const parseNotes = (body: string): ReleaseNotes => {
  const notes: ReleaseNotes = { features: [], fixes: [] };
  let list: string[] | null = null;
  for (const line of body.split("\n")) {
    const heading = /^#{2,4}\s+(?<title>.+?)\s*$/u
      .exec(line)
      ?.groups?.title?.toLowerCase();
    if (heading !== undefined) {
      list = null;
      if (heading.startsWith("feature")) {
        list = notes.features;
      } else if (heading.startsWith("bug fix")) {
        list = notes.fixes;
      }
    } else if (list && /^\s*[*-]\s+/u.test(line)) {
      const item = clean(line);
      if (item) {
        list.push(item);
      }
    }
  }
  return notes;
};
