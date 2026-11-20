import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { SANDBOX_NOTE, madeFileIdsOf } = await import("./sandbox-tools");

// The prompt names what the image has (D3: the description of the box once parted from the image in PlusPortal).
describe("sandbox note", () => {
  it("names every library the image installs", () => {
    const requirements = readFileSync(
      new URL("../../../../docker/sandbox/requirements.txt", import.meta.url),
      "utf-8"
    );
    const names = requirements
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("==")[0]?.trim() ?? "");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(SANDBOX_NOTE).toContain(name);
    }
    expect(SANDBOX_NOTE).toContain("Python 3.13");
  });

  it("keeps the files the answers handed over", () => {
    const id = crypto.randomUUID();
    expect(
      madeFileIdsOf({
        parts: [
          { type: "text" },
          { output: { id }, type: "tool-share_file" },
          { output: { error: "no" }, type: "tool-share_file" },
          { output: { id: "x" }, type: "tool-run_code" },
        ],
      })
    ).toEqual([id]);
  });
});
