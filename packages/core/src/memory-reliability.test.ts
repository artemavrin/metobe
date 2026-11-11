import { describe, expect, it } from "vitest";

import type { MemoryRecord } from "./memory";
import { reliabilityOf } from "./memory-reliability";

const TZ = "Europe/Moscow";
const NOW = new Date("2026-11-11T09:00:00Z");
const at = (iso: string) => new Date(iso);

const promise = (
  id: string,
  over: Partial<MemoryRecord> & { debtor?: string; creditor?: string }
) => {
  const { debtor = "olga", creditor = "me", ...rest } = over;
  return {
    deletedAt: null,
    doneAt: null,
    dueAt: null,
    entities: [
      { entityId: debtor, role: "debtor" },
      { entityId: creditor, role: "creditor" },
    ],
    id,
    kind: "commitment",
    status: "open",
    supersededAt: null,
    text: id,
    ...rest,
  } as MemoryRecord;
};

const done = (id: string, due: string, doneAt: string, over = {}) =>
  promise(id, { doneAt: at(doneAt), dueAt: at(due), status: "done", ...over });

const ME = new Set(["me"]);
const NO_MOVES = new Map<string, number>();

describe("reliabilityOf (Г2.2)", () => {
  it("counts done promises with a deadline: on time, late and by how much", () => {
    const r = reliabilityOf(
      "olga",
      [
        done("a", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00"),
        done("b", "2026-10-10T00:00:00+03:00", "2026-10-10T20:00:00+03:00"),
        done("c", "2026-10-10T00:00:00+03:00", "2026-10-13T12:00:00+03:00"),
        done("d", "2026-10-10T00:00:00+03:00", "2026-10-15T12:00:00+03:00"),
      ],
      ME,
      NO_MOVES,
      NOW,
      TZ
    );
    expect(r.theirs).toEqual({
      late: 2,
      // 3 and 5 days: the average is 4.
      lateDays: 4,
      moved: 0,
      onTime: 2,
      overdueOpen: 0,
      total: 4,
    });
    expect(r.mine).toBeNull();
  });

  it("says nothing about fewer than three counted", () => {
    const r = reliabilityOf(
      "olga",
      [
        done("a", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00"),
        done("b", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00"),
      ],
      ME,
      NO_MOVES,
      NOW,
      TZ
    );
    expect(r.theirs).toBeNull();
  });

  it("leaves out the cancelled, the dateless and the unconfirmed, and tells the open ones past their day", () => {
    const base = [
      done("a", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00"),
      done("b", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00"),
      done("c", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00"),
    ];
    const r = reliabilityOf(
      "olga",
      [
        ...base,
        promise("x", {
          dueAt: at("2026-10-10T00:00:00+03:00"),
          status: "cancelled",
        }),
        promise("y", {
          doneAt: at("2026-10-10T00:00:00+03:00"),
          status: "done",
        }),
        promise("z", {
          dueAt: at("2026-10-10T00:00:00+03:00"),
          status: "unconfirmed",
        }),
        promise("w", { dueAt: at("2026-12-10T00:00:00+03:00") }),
      ],
      ME,
      NO_MOVES,
      NOW,
      TZ
    );
    expect(r.theirs).toMatchObject({ onTime: 3, overdueOpen: 1, total: 3 });
  });

  it("counts the moves of the deadlines of the counted ones, and the two sides apart", () => {
    const mine = ["a", "b", "c"].map((id) =>
      done(`m${id}`, "2026-10-10T00:00:00+03:00", "2026-10-10T12:00:00+03:00", {
        creditor: "olga",
        debtor: "me",
      })
    );
    const theirs = ["a", "b", "c"].map((id) =>
      done(`t${id}`, "2026-10-10T00:00:00+03:00", "2026-10-11T12:00:00+03:00")
    );
    const r = reliabilityOf(
      "olga",
      [...mine, ...theirs],
      ME,
      new Map([
        ["ta", 2],
        ["tb", 1],
        ["ma", 5],
      ]),
      NOW,
      TZ
    );
    expect(r.theirs).toMatchObject({
      late: 3,
      lateDays: 1,
      moved: 3,
      onTime: 0,
    });
    expect(r.mine).toMatchObject({ late: 0, moved: 5, onTime: 3 });
  });

  it("counts the day in the person's zone", () => {
    // Done at 22:30 UTC on the 9th is already the 10th in Moscow: the deadline day, so on time.
    const r = reliabilityOf(
      "olga",
      [
        done("a", "2026-10-10T00:00:00+03:00", "2026-10-09T22:30:00Z"),
        done("b", "2026-10-10T00:00:00+03:00", "2026-10-09T22:30:00Z"),
        done("c", "2026-10-10T00:00:00+03:00", "2026-10-09T22:30:00Z"),
      ],
      ME,
      NO_MOVES,
      NOW,
      TZ
    );
    expect(r.theirs).toMatchObject({ late: 0, onTime: 3 });
  });

  it("ignores promises between two others and deleted or replaced ones", () => {
    const r = reliabilityOf(
      "olga",
      [
        done("a", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00"),
        done("b", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00"),
        done("c", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00", {
          creditor: "igor",
        }),
        done("d", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00", {
          deletedAt: at("2026-10-11T00:00:00Z"),
        }),
        done("e", "2026-10-10T00:00:00+03:00", "2026-10-09T12:00:00+03:00", {
          supersededAt: at("2026-10-11T00:00:00Z"),
        }),
      ],
      ME,
      NO_MOVES,
      NOW,
      TZ
    );
    expect(r.theirs).toBeNull();
  });
});
