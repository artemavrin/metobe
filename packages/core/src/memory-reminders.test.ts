import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { user } from "@metobe/db/schema/auth";
import { memoryRecords } from "@metobe/db/schema/memory";
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

import type * as MemoryModule from "./memory";
import type * as RemindersModule from "./memory-reminders";
import { testOrganizationId } from "./test-organization";

const notify = vi.fn();
const memoryOn = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("./notify", () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock("./memory-write", () => ({
  isMemoryOnFor: (...a: unknown[]) => memoryOn(...a),
}));

// Needs a database of its own: MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test memory-reminders
const URL = process.env.MEMORY_TEST_DATABASE_URL;

describe.skipIf(!URL)("the reminders people asked for (D43)", () => {
  const ana = `remind-test-${randomBytes(4).toString("hex")}`;
  const bob = `remind-test-${randomBytes(4).toString("hex")}`;
  let db: Db;
  let memory: typeof MemoryModule;
  let reminders: typeof RemindersModule;
  const NOW = new Date("2026-11-12T12:00:00Z");
  const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    memory = await import("./memory");
    reminders = await import("./memory-reminders");
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
    // Each test has the two memories to itself.
    await db
      .delete(memoryRecords)
      .where(inArray(memoryRecords.ownerId, [ana, bob]));
    notify.mockReset();
    memoryOn.mockReset();
    notify.mockResolvedValue({ mail: false, telegram: true });
    memoryOn.mockResolvedValue(true);
  });

  /** The person's own reminder (D45): a schedule, no promise; `done` — closed already. */
  const reminder = async (
    owner: string,
    text: string,
    at: Date,
    { done, repeat }: { done?: boolean; repeat?: "day" | "week" } = {}
  ) => {
    const r = await memory.addRecord(owner, {
      entities: [],
      kind: "schedule",
      schedule: { at, kind: "reminder", repeat },
      text,
    });
    if (done) {
      await memory.editReminder(owner, r.id, { done: true });
    }
    return r;
  };

  const recordOf = async (id: string) => {
    const [record] = await memory.listRecords(ana, { ids: [id] });
    return record;
  };
  const scheduleOf = async (id: string) => {
    const record = await recordOf(id);
    return record?.schedule;
  };

  it("tells a reminder whose moment has come, once, with the buttons under it", async () => {
    const r = await reminder(ana, "Позвонить Ольге", minutes(-1));
    expect(await reminders.sendDueReminders(NOW)).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
    const [owner, notice] = notify.mock.calls[0] as [
      string,
      {
        title: string;
        blocks: { text: string }[];
        buttons: { text: string; data: string }[][];
      },
    ];
    expect(owner).toBe(ana);
    expect(notice.title).toBe("Напоминание");
    expect(notice.blocks[0]?.text).toBe("Позвонить Ольге");
    expect(notice.buttons[0]?.map((b) => b.data)).toEqual([
      `d:${r.id}`,
      `s:${r.id}`,
      `m:${r.id}`,
    ]);
    // Told: the next tick has nothing.
    expect(await reminders.sendDueReminders(NOW)).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("waits for its moment, and leaves the done and the deleted", async () => {
    await reminder(ana, "Позже", minutes(30));
    await reminder(ana, "Уже сделано", minutes(-5), { done: true });
    const gone = await reminder(ana, "Удалено", minutes(-5));
    await memory.deleteRecord(ana, gone.id);
    expect(await reminders.sendDueReminders(NOW)).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    // Thirty minutes on, the first one is due.
    expect(await reminders.sendDueReminders(minutes(31))).toBe(1);
  });

  it("tells each person their own, and nothing while their memory is off", async () => {
    await reminder(ana, "Анино", minutes(-10));
    await reminder(bob, "Бобово", minutes(-10));
    memoryOn.mockImplementation((id: string) => Promise.resolve(id !== bob));
    expect(await reminders.sendDueReminders(NOW)).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toBe(ana);
  });

  it("tells nothing to a person the platform turned off, and tells it when they are back", async () => {
    await reminder(bob, "Бобово", minutes(-10));
    await db
      .update(user)
      .set({ blockedAt: new Date() })
      .where(eq(user.id, bob));
    try {
      expect(await reminders.sendDueReminders(NOW)).toBe(0);
      expect(notify).not.toHaveBeenCalled();
    } finally {
      await db.update(user).set({ blockedAt: null }).where(eq(user.id, bob));
    }
    expect(await reminders.sendDueReminders(NOW)).toBe(1);
    expect(notify.mock.calls[0]?.[0]).toBe(bob);
  });

  it("is told once when two ticks run together, and a reminder moved is told again", async () => {
    const r = await reminder(ana, "Дважды не надо", minutes(-1));
    const told = await Promise.all([
      reminders.sendDueReminders(NOW),
      reminders.sendDueReminders(NOW),
    ]);
    expect(told.reduce((a, b) => a + b, 0)).toBe(1);
    // «Через час» (as the Telegram button does it): a new moment makes it not gone off — and not done — again.
    expect(await memory.editReminder(ana, r.id, { at: minutes(60) })).toBe(
      true
    );
    notify.mockClear();
    expect(await reminders.sendDueReminders(minutes(61))).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("counts a reminder as claimed even when nobody could be told", async () => {
    await reminder(ana, "Некому", minutes(-1));
    notify.mockResolvedValue({ mail: false, telegram: false });
    expect(await reminders.sendDueReminders(NOW)).toBe(0);
    notify.mockClear();
    // It is not told again every minute.
    expect(await reminders.sendDueReminders(minutes(1))).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("closes a plain reminder once it has reached the person; one about a promise is told in its words and waits", async () => {
    const plain = await reminder(ana, "Позвонить в банк", minutes(-1));
    const self = await memory.ensureSelf(ana, "Я");
    const olga = await memory.createEntity(ana, {
      kind: "person",
      name: "Ольга Ли",
    });
    const owed = await memory.addRecord(ana, {
      dueAt: new Date("2026-11-12T00:00:00Z"),
      entities: [
        { entityId: self.id, role: "debtor" },
        { entityId: olga.id, role: "creditor" },
      ],
      kind: "commitment",
      remind: { at: minutes(-1) },
      text: "Согласовать смету",
    });
    expect(await reminders.sendDueReminders(NOW)).toBe(2);
    const closed = await recordOf(plain.id);
    expect(closed?.doneAt).not.toBeNull();
    const open = await recordOf(owed.id);
    expect(open?.status).toBe("open");
    const texts = notify.mock.calls.map(
      (c) => (c[1] as { blocks: { text: string }[] }).blocks[0]?.text
    );
    expect(texts.toSorted()).toEqual(["Позвонить в банк", "Согласовать смету"]);
    // The promise done: its reminder, moved on, is not told.
    await memory.setCommitmentStatus(ana, owed.id, "done");
    const schedules = await memory.listRecords(ana, { kinds: ["schedule"] });
    const linked = schedules.find(
      (r) =>
        r.schedule?.kind === "reminder" && r.schedule.forRecordId === owed.id
    );
    expect(linked).toBeDefined();
    await memory.editReminder(ana, linked?.id as string, { at: minutes(5) });
    notify.mockClear();
    expect(await reminders.sendDueReminders(minutes(6))).toBe(0);
  });

  it("leaves a plain reminder open when it reached nobody", async () => {
    const plain = await reminder(ana, "Некому сказать", minutes(-1));
    notify.mockResolvedValue({ mail: false, telegram: false });
    await reminders.sendDueReminders(NOW);
    const left = await recordOf(plain.id);
    expect(left?.doneAt).toBeNull();
  });

  it("moves a reminder that comes again on to its next time as it is told, with «Готово» alone under it", async () => {
    // Thursday 12 November, 15:00 in Moscow, every week.
    const weekly = await reminder(ana, "Отчёт по закупкам", minutes(-60), {
      repeat: "week",
    });
    expect(await reminders.sendDueReminders(NOW)).toBe(1);
    const [, notice] = notify.mock.calls[0] as [
      string,
      { buttons: { data: string }[][] },
    ];
    expect(notice.buttons[0]?.map((b) => b.data)).toEqual([`d:${weekly.id}`]);
    expect(await scheduleOf(weekly.id)).toMatchObject({
      firedAt: NOW,
      nextAt: new Date("2026-11-19T11:00:00Z"),
      repeat: "week",
    });
    // Not again this week; again a week on.
    expect(await reminders.sendDueReminders(minutes(60))).toBe(0);
    expect(
      await reminders.sendDueReminders(new Date("2026-11-19T11:01:00Z"))
    ).toBe(1);
    expect(await scheduleOf(weekly.id)).toMatchObject({
      nextAt: new Date("2026-11-26T11:00:00Z"),
    });
  });

  it("takes «Готово» on one that comes again as marked this time: it goes on", async () => {
    const weekly = await reminder(ana, "Заполнить таймшит", minutes(-1), {
      repeat: "day",
    });
    await reminders.sendDueReminders(NOW);
    const told = await scheduleOf(weekly.id);
    expect(told?.kind).toBe("reminder");
    expect(await memory.editReminder(ana, weekly.id, { done: true })).toBe(
      true
    );
    const after = await recordOf(weekly.id);
    expect(after?.doneAt).toBeNull();
    expect(after?.schedule).toMatchObject({ firedAt: null, repeat: "day" });
  });
});
