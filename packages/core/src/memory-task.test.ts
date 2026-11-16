import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const on = vi.hoisted(() => ({ value: true }));
vi.mock("./memory-write", () => ({
  isMemoryOnFor: () => Promise.resolve(on.value),
}));
vi.mock("./memory-read", () => ({
  memoryBrief: (_owner: string, text: string) =>
    Promise.resolve(
      text.includes("Ирин") ? "<memory>Ирина Белова</memory>" : ""
    ),
  memoryTools: () => ({ memory_card: {}, search_memory: {} }),
}));

const { taskMemory } = await import("./memory-task");

describe("the memory a task's run reads (В4.1)", () => {
  beforeEach(() => {
    on.value = true;
  });

  it("gives the reading tools and the block of the cards the instruction names", async () => {
    const { note, tools } = await taskMemory(
      "o",
      "Напомни про Ирину",
      "Europe/Moscow"
    );
    expect(Object.keys(tools)).toEqual(["memory_card", "search_memory"]);
    expect(note).toContain("read only");
    expect(note).toContain("<memory>Ирина Белова</memory>");
  });

  it("has no block when the instruction names nobody", async () => {
    const { note } = await taskMemory("o", "Сводка по складу", "UTC");
    expect(note).not.toContain("Ирина Белова");
  });

  it("gives nothing while the memory is off", async () => {
    on.value = false;
    const given = await taskMemory("o", "Напомни про Ирину", "UTC");
    expect(given).toEqual({ note: "", tools: {} });
  });
});
