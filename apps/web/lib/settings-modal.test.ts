import { readdirSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Settings open as a window over the app through an intercepted route (app/(app)/@modal/(.)settings): each screen
// there is a re-export of the page it mirrors. A screen with no mirror still opens — as the page, not over the chat —
// so this keeps them together.

const APP = path.join(import.meta.dirname, "..", "app", "(app)");
const SETTINGS = path.join(APP, "settings");
const MIRROR = path.join(APP, "@modal", "(.)settings");

const screens = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && ["page.tsx", "layout.tsx"].includes(e.name))
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)));

describe("the settings window over the app", () => {
  it("mirrors every page and layout of settings, and each mirror points at its own", () => {
    const original = screens(SETTINGS).filter((f) => f !== "layout.tsx");
    const mirrored = screens(MIRROR).filter((f) => f !== "layout.tsx");
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy (toSorted is past the ES2022 target)
    expect([...mirrored].sort()).toEqual([...original].sort());
    for (const file of original) {
      expect(existsSync(path.join(MIRROR, file))).toBe(true);
    }
  });
});
