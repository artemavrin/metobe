import { describe, expect, it } from "vitest";

import { compareVersions, parseNotes } from "./updates-notes";

// The body release-please wrote for 0.4.0 on GitHub, cut short.
const BODY = `## [0.4.0](https://github.com/artemavrin/metobe/compare/v0.3.0...v0.4.0) (2026-10-14)


### Features

* «Мои файлы», and drafts nobody sent go after a day ([6d9eeeb](https://github.com/artemavrin/metobe/commit/6d9eeeb))
* «connect X to go on» in the chat ([#46](https://github.com/artemavrin/metobe/issues/46)) ([daeb4f4](https://github.com/artemavrin/metobe/commit/daeb4f4))
* **chat:** a scope in bold goes ([1234567](https://github.com/artemavrin/metobe/commit/1234567))


### Bug Fixes

* shortcut hints in this computer's keys, and none on a touch screen ([969f0ec](https://github.com/artemavrin/metobe/commit/969f0ec))

### Miscellaneous Chores

* release 0.4.0
`;

describe("a release's notes", () => {
  it("keeps what is new and what is fixed, without the links", () => {
    expect(parseNotes(BODY)).toEqual({
      features: [
        "«Мои файлы», and drafts nobody sent go after a day",
        "«connect X to go on» in the chat",
        "a scope in bold goes",
      ],
      fixes: [
        "shortcut hints in this computer's keys, and none on a touch screen",
      ],
    });
  });

  it("is empty for a release without notes", () => {
    expect(parseNotes("")).toEqual({ features: [], fixes: [] });
  });
});

describe("versions", () => {
  it("compare as numbers, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.1")).toBe(1);
    expect(compareVersions("v0.4.0", "0.4.0")).toBe(0);
    expect(compareVersions("0.4.0", "0.4.1")).toBe(-1);
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(0);
  });
});
