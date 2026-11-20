import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const box = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock("../sandbox", () => ({
  SandboxError: class extends Error {},
  acquireBox: () => Promise.resolve({ boxId: "b1", fresh: true }),
  heartbeatBox: () => Promise.resolve(),
  listBox: () => Promise.resolve([]),
  putInBox: () => Promise.resolve(),
  releaseBox: () => Promise.resolve(),
  runInBox: () => Promise.resolve({}),
  takeFromBox: (_id: string, path: string) =>
    Promise.resolve(new TextEncoder().encode(box.files.get(path) ?? "")),
}));
vi.mock("../files", () => ({
  filesOf: () => Promise.resolve([]),
  getFile: () => Promise.resolve(null),
}));

const { LOAD_DATA, SANDBOX_NOTE, madeFileIdsOf, sandboxNote, sandboxSession } =
  await import("./sandbox-tools");
const { createSources } = await import("./tool-sources");

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

  it("tells the model the limits the admin set (P35)", () => {
    expect(SANDBOX_NOTE).toContain("60 seconds and about 1 GB");
    expect(SANDBOX_NOTE).toContain("There is no network");
    const note = sandboxNote({
      memoryMb: 2048,
      network: true,
      runSeconds: 120,
    });
    expect(note).toContain("120 seconds and about 2 GB");
    expect(note).toContain("can reach the internet");
    expect(note).not.toContain("There is no network");
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

const load = async (path: string) => {
  const sources = createSources([]);
  const session = sandboxSession({
    chatId: "c1",
    class: "chat",
    fileIds: [],
    sources,
    userId: "u1",
  });
  const run = session.tools[LOAD_DATA]?.execute as unknown as (
    input: { path: string },
    options: { toolCallId: string; messages: [] }
  ) => Promise<Record<string, unknown>>;
  const output = await run({ path }, { messages: [], toolCallId: "call-1" });
  await session.release(true);
  return { output, sources };
};

describe("load_data", () => {
  it("gives the widgets a table the code wrote, by the call's ref", async () => {
    box.files.set(
      "/workspace/m.json",
      JSON.stringify([
        { month: "2026-01", revenue: 150 },
        { month: "2026-02", revenue: 70 },
      ])
    );
    const { output, sources } = await load("/workspace/m.json");
    expect(output).toMatchObject({
      columns: ["month", "revenue"],
      ref: "call-1",
      rows: 2,
    });
    expect(sources.resolve("call-1").table.rows).toEqual([
      ["2026-01", 150],
      ["2026-02", 70],
    ]);
  });

  it("says what is wrong with a file that is not a table", async () => {
    box.files.set("/workspace/bad.json", "{oops");
    const { output } = await load("/workspace/bad.json");
    expect(output).toEqual({ error: "The file is not JSON." });
  });
});
