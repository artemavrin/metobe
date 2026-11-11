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
    await db.insert(user).values(
      [ana, bob].map((id) => ({
        email: `${id}@example.test`,
        id,
        locale: "ru",
        name: id,
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

  const promise = async (
    owner: string,
    text: string,
    remindAt?: Date,
    status?: "done"
  ) => {
    const self = await memory.ensureSelf(owner, "Я");
    return memory.addRecord(owner, {
      dueAt: new Date("2026-11-12T00:00:00Z"),
      entities: [{ entityId: self.id, role: "debtor" }],
      kind: "commitment",
      remindAt,
      status,
      text,
    });
  };

  it("tells a reminder whose moment has come, once, with the buttons under it", async () => {
    const r = await promise(ana, "Позвонить Ольге", minutes(-1));
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

  it("waits for its moment, and leaves the done, the deleted and those with no reminder", async () => {
    await promise(ana, "Позже", minutes(30));
    await promise(ana, "Уже сделано", minutes(-5), "done");
    const gone = await promise(ana, "Удалено", minutes(-5));
    await memory.deleteRecord(ana, gone.id);
    await promise(ana, "Без напоминания");
    expect(await reminders.sendDueReminders(NOW)).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    // Thirty minutes on, the first one is due.
    expect(await reminders.sendDueReminders(minutes(31))).toBe(1);
  });

  it("tells each person their own, and nothing while their memory is off", async () => {
    await promise(ana, "Анино", minutes(-10));
    await promise(bob, "Бобово", minutes(-10));
    memoryOn.mockImplementation((id: string) => Promise.resolve(id !== bob));
    expect(await reminders.sendDueReminders(NOW)).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toBe(ana);
  });

  it("is told once when two ticks run together, and a reminder moved is told again", async () => {
    const r = await promise(ana, "Дважды не надо", minutes(-1));
    const told = await Promise.all([
      reminders.sendDueReminders(NOW),
      reminders.sendDueReminders(NOW),
    ]);
    expect(told.reduce((a, b) => a + b, 0)).toBe(1);
    // «Через час»: a new moment makes it unsent again.
    expect(
      await memory.editCommitment(ana, r.id, { remindAt: minutes(60) })
    ).toBe(true);
    notify.mockClear();
    expect(await reminders.sendDueReminders(minutes(61))).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("counts a reminder as claimed even when nobody could be told", async () => {
    await promise(ana, "Некому", minutes(-1));
    notify.mockResolvedValue({ mail: false, telegram: false });
    expect(await reminders.sendDueReminders(NOW)).toBe(0);
    notify.mockClear();
    // It is not told again every minute.
    expect(await reminders.sendDueReminders(minutes(1))).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, ana));
    expect(row?.id).toBe(ana);
  });
});
