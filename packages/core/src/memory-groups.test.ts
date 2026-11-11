import { describe, expect, it } from "vitest";

import type { MemoryRecord } from "./memory";
import { groupMembers, membershipFacts } from "./memory-groups";

const fact = (
  id: string,
  who: string[],
  group: string,
  over: Partial<MemoryRecord> = {}
): MemoryRecord => ({
  closedByWrite: null,
  deletedAt: null,
  doneAt: null,
  dueAt: null,
  entities: [
    ...who.map((entityId) => ({ entityId, role: "about" as const })),
    { entityId: group, role: "group" as const },
  ],
  givenAt: null,
  id,
  important: false,
  kind: "fact",
  occurredAt: null,
  occurredPrecision: null,
  recordedAt: new Date("2026-11-01T00:00:00Z"),
  remindAt: null,
  remindedAt: null,
  role: null,
  rule: null,
  status: null,
  supersededAt: null,
  supersededBy: null,
  text: "в команде",
  validFrom: null,
  validTo: null,
  writeId: null,
  ...over,
});

describe("groups (ARCH §19)", () => {
  const now = new Date("2026-11-09T09:00:00Z");

  it("are whoever a live fact puts in them", () => {
    const members = groupMembers(
      [
        fact("f1", ["andrey"], "team"),
        fact("f2", ["natalya", "sergey"], "sales"),
        // Left, deleted, replaced — no longer in.
        fact("f3", ["marina"], "team", {
          validTo: new Date("2026-11-05T00:00:00Z"),
        }),
        fact("f4", ["pavel"], "team", { deletedAt: now }),
        fact("f5", ["oleg"], "team", { supersededAt: now }),
        // Ends later: still in.
        fact("f6", ["igor"], "team", {
          validTo: new Date("2026-12-01T00:00:00Z"),
        }),
      ],
      now
    );
    expect([...(members.get("team") ?? [])]).toEqual(["andrey", "igor"]);
    expect([...(members.get("sales") ?? [])]).toEqual(["natalya", "sergey"]);
  });

  it("finds the facts that put one person in one group", () => {
    const facts = [
      fact("f1", ["andrey"], "team"),
      fact("f2", ["andrey"], "sales"),
      fact("f3", ["marina"], "team"),
    ];
    expect(
      membershipFacts(facts, "andrey", "team", now).map((f) => f.id)
    ).toEqual(["f1"]);
  });
});
