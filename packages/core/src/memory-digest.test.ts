import { randomBytes } from "node:crypto";

import type { MemorySuggestion } from "@metobe/contracts/memory";
import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { user } from "@metobe/db/schema/auth";
import { eq, inArray } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type * as DigestModule from "./memory-digest";
import { testOrganizationId } from "./test-organization";

const notify = vi.fn();
const suggestions = vi.fn();
const memoryOn = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("./notify", () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock("./memory-today", () => ({
  todaySuggestions: (...a: unknown[]) => suggestions(...a),
}));
vi.mock("./memory-write", () => ({
  isMemoryOnFor: (...a: unknown[]) => memoryOn(...a),
}));

const row = (
  key: string,
  over: Partial<MemorySuggestion> = {}
): MemorySuggestion => ({
  days: 3,
  dueAt: null,
  id: key,
  important: false,
  key,
  kind: "commitment",
  reason: "overdue",
  rhythm: null,
  side: "theirs",
  status: "open",
  text: `Дело ${key}`,
  who: null,
  ...over,
});

const at = (iso: string) => new Date(iso);

describe("the digest's pure parts (D43)", () => {
  it("reads the local day and time in a zone", async () => {
    const { localNow } = await import("./memory-digest");
    // 22:30 UTC on the 11th is 01:30 on the 12th in Moscow.
    expect(localNow(new Date("2026-11-11T22:30:00Z"), "Europe/Moscow")).toEqual(
      { day: "2026-11-12", time: "01:30" }
    );
    expect(localNow(new Date("2026-11-11T21:00:00Z"), "Europe/Moscow")).toEqual(
      { day: "2026-11-12", time: "00:00" }
    );
  });

  it("is due once its time has come in the person's day, and not again that day", async () => {
    const { digestDue } = await import("./memory-digest");
    const s = { sentOn: null, time: "09:00" };
    expect(digestDue(s, at("2026-11-11T05:59:00Z"), "Europe/Moscow")).toBe(
      false
    );
    expect(digestDue(s, at("2026-11-11T06:00:00Z"), "Europe/Moscow")).toBe(
      true
    );
    expect(
      digestDue(
        { ...s, sentOn: "2026-11-11" },
        at("2026-11-11T08:00:00Z"),
        "Europe/Moscow"
      )
    ).toBe(false);
    expect(
      digestDue(
        { ...s, sentOn: "2026-11-10" },
        at("2026-11-11T08:00:00Z"),
        "Europe/Moscow"
      )
    ).toBe(true);
    expect(
      digestDue({ sentOn: null, time: null }, at("2026-11-11T08:00:00Z"), "UTC")
    ).toBe(false);
    expect(
      digestDue(
        { sentOn: null, time: "25:99" },
        at("2026-11-11T08:00:00Z"),
        "UTC"
      )
    ).toBe(false);
  });

  it("finds the rows the last digest did not carry", async () => {
    const { freshRows } = await import("./memory-digest");
    expect(freshRows([row("a"), row("b")], null).map((r) => r.key)).toEqual([
      "a",
      "b",
    ]);
    expect(freshRows([row("a"), row("b")], ["a"]).map((r) => r.key)).toEqual([
      "b",
    ]);
    expect(freshRows([row("a")], ["a", "gone"])).toEqual([]);
  });

  it("makes a list with the reason of each, names the person unless the text does, and counts the rest", async () => {
    const { digestBlocks } = await import("./memory-digest");
    const rows = [
      row("a", {
        text: "Прислать договор",
        who: { id: "o", kind: "person", name: "Ольга Ли" },
      }),
      row("b", {
        text: "Ольга обещала смету",
        who: { id: "o", kind: "person", name: "Ольга Ли" },
      }),
      ...Array.from({ length: 16 }, (_, i) => row(`x${i}`)),
    ];
    const blocks = digestBlocks(
      rows,
      (r) => `why ${r.days}`,
      (n) => `ещё ${n}`
    );
    const [list] = blocks;
    expect(list?.type === "list" && list.items[0]).toEqual({
      strong: "Ольга Ли: Прислать договор",
      text: "— why 3",
    });
    expect(list?.type === "list" && list.items[1]?.strong).toBe(
      "Ольга обещала смету"
    );
    expect(list?.type === "list" && list.items).toHaveLength(15);
    expect(blocks[1]).toEqual({ text: "ещё 3", type: "p" });
  });
});

const URL = process.env.MEMORY_TEST_DATABASE_URL;

describe.skipIf(!URL)("sendDueDigests (D43)", () => {
  const ana = `digest-test-${randomBytes(4).toString("hex")}`;
  const bob = `digest-test-${randomBytes(4).toString("hex")}`;
  let db: Db;
  let digest: typeof DigestModule;
  // 12:00 in Moscow on 11 November 2026.
  const NOON = new Date("2026-11-11T09:00:00Z");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    digest = await import("./memory-digest");
    const organizationId = await testOrganizationId(db);
    await db.insert(user).values(
      [ana, bob].map((id) => ({
        email: `${id}@example.test`,
        id,
        locale: "ru",
        name: id,
        organizationId,
        timeZone: "Europe/Moscow",
      }))
    );
  });

  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, [ana, bob]));
  });

  beforeEach(async () => {
    notify.mockReset();
    suggestions.mockReset();
    memoryOn.mockReset();
    notify.mockResolvedValue({ mail: false, telegram: true });
    memoryOn.mockResolvedValue(true);
    await db
      .update(user)
      .set({ digestKeys: null, digestSentOn: null, digestTime: null })
      .where(inArray(user.id, [ana, bob]));
  });

  const on = (id: string, time = "09:00") =>
    db.update(user).set({ digestTime: time }).where(eq(user.id, id));
  const stateOf = async (id: string) => {
    const [found] = await db.select().from(user).where(eq(user.id, id));
    return found;
  };

  it("sends at the chosen time, once a day, and keeps what it carried", async () => {
    await on(ana);
    suggestions.mockResolvedValue([row("a"), row("b")]);
    expect(await digest.sendDueDigests(new Date("2026-11-11T05:00:00Z"))).toBe(
      0
    );
    expect(await digest.sendDueDigests(NOON)).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      ana,
      expect.objectContaining({ title: expect.stringContaining("Не упустить") })
    );
    const s = await stateOf(ana);
    expect(s?.digestSentOn).toBe("2026-11-11");
    expect(s?.digestKeys).toEqual(["a", "b"]);
    // The same day again: nothing.
    expect(await digest.sendDueDigests(NOON)).toBe(0);
  });

  it("sends nothing to a person the platform turned off", async () => {
    await on(ana);
    suggestions.mockResolvedValue([row("a")]);
    await db
      .update(user)
      .set({ blockedAt: new Date() })
      .where(eq(user.id, ana));
    try {
      expect(await digest.sendDueDigests(NOON)).toBe(0);
      expect(notify).not.toHaveBeenCalled();
    } finally {
      await db.update(user).set({ blockedAt: null }).where(eq(user.id, ana));
    }
    expect(await digest.sendDueDigests(NOON)).toBe(1);
  });

  it("does not send the same list twice, and sends when a row is new", async () => {
    await on(ana);
    suggestions.mockResolvedValue([row("a")]);
    await digest.sendDueDigests(NOON);
    notify.mockClear();
    // The next day, the same row: nothing goes.
    expect(await digest.sendDueDigests(new Date("2026-11-12T09:00:00Z"))).toBe(
      0
    );
    expect(notify).not.toHaveBeenCalled();
    // The day after, a new one.
    suggestions.mockResolvedValue([row("a"), row("c")]);
    expect(await digest.sendDueDigests(new Date("2026-11-13T09:00:00Z"))).toBe(
      1
    );
    const after = await stateOf(ana);
    expect(after?.digestKeys).toEqual(["a", "c"]);
  });

  it("sends nothing when there is nothing, or the memory is off, or the digest is off", async () => {
    await on(ana);
    suggestions.mockResolvedValue([]);
    expect(await digest.sendDueDigests(NOON)).toBe(0);
    await db.update(user).set({ digestSentOn: null }).where(eq(user.id, ana));
    suggestions.mockResolvedValue([row("a")]);
    memoryOn.mockResolvedValue(false);
    expect(await digest.sendDueDigests(NOON)).toBe(0);
    await db
      .update(user)
      .set({ digestSentOn: null, digestTime: null })
      .where(eq(user.id, ana));
    memoryOn.mockResolvedValue(true);
    expect(await digest.sendDueDigests(NOON)).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("keeps the rows for another day when it reached nobody", async () => {
    await on(ana);
    suggestions.mockResolvedValue([row("a")]);
    notify.mockResolvedValue({ mail: false, telegram: false });
    expect(await digest.sendDueDigests(NOON)).toBe(0);
    const unsent = await stateOf(ana);
    expect(unsent?.digestKeys).toBeNull();
    notify.mockResolvedValue({ mail: true, telegram: false });
    const next = await digest.sendDueDigests(new Date("2026-11-12T09:00:00Z"));
    expect(next).toBe(1);
  });

  it("is sent once when two ticks run together", async () => {
    await on(ana);
    suggestions.mockResolvedValue([row("a")]);
    const sent = await Promise.all([
      digest.sendDueDigests(NOON),
      digest.sendDueDigests(NOON),
    ]);
    expect(sent.reduce((a, b) => a + b, 0)).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("takes only a time of the day, or none", async () => {
    expect(await digest.setDigestTime(bob, "7:5")).toBe(false);
    expect(await digest.setDigestTime(bob, "08:30")).toBe(true);
    expect(await digest.digestTimeOf(bob)).toBe("08:30");
    expect(await digest.setDigestTime(bob, null)).toBe(true);
    expect(await digest.digestTimeOf(bob)).toBeNull();
  });
});
