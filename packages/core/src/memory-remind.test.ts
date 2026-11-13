import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { user } from "@metobe/db/schema/auth";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as MemoryModule from "./memory";
import type * as RemindModule from "./memory-remind";
import type * as TodayModule from "./memory-today";

// «Напомнить» (Г2.4) on a database of its own: MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test
// memory-remind. The mail is not sent — `sendEmail` is a spy, the boxes and the admin's policy are given here — and the
// slot «Память» has no model, so the letter is the template's.

vi.mock("server-only", () => ({}));

const sent = vi.fn();
let boxes: { address: string; toolPolicy: Record<string, string> }[] = [];

vi.mock("./mailboxes", () => ({
  listMailboxes: () => Promise.resolve(boxes),
  sendEmail: (...args: unknown[]) => {
    sent(...args);
    return Promise.resolve({ from: "me@example.test", sent: true });
  },
}));
vi.mock("./personal", () => ({
  getPersonalPolicy: () => Promise.resolve({ approvals: {}, mode: "on" }),
}));
vi.mock("./model-slots", () => ({ getSlotModel: () => Promise.resolve(null) }));

const URL = process.env.MEMORY_TEST_DATABASE_URL;
const TZ = "Europe/Moscow";
const prefs = { locale: "ru" as const, timeZone: TZ };

describe.skipIf(!URL)("a reminder letter (Г2.4)", () => {
  let memory: typeof MemoryModule;
  let remind: typeof RemindModule;
  let today: typeof TodayModule;
  let db: Db;
  const owner = `memory-test-${randomBytes(4).toString("hex")}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    memory = await import("./memory");
    remind = await import("./memory-remind");
    today = await import("./memory-today");
    await db
      .insert(user)
      .values({ email: `${owner}@example.test`, id: owner, name: owner });
  });

  afterAll(async () => {
    await db?.delete(user).where(eq(user.id, owner));
  });

  /** Olga owes the person a contract by 13 November, promised on the 3rd; the person owes Olga an estimate. */
  const seed = async () => {
    const self = await memory.ensureSelf(owner, "Я");
    const olga = await memory.createEntity(owner, {
      kind: "person",
      name: "Ольга Ли",
    });
    const owed = await memory.addRecord(owner, {
      dueAt: new Date("2026-11-12T21:00:00Z"),
      entities: [
        { entityId: olga.id, role: "debtor" },
        { entityId: self.id, role: "creditor" },
      ],
      givenAt: new Date("2026-11-03T09:00:00Z"),
      kind: "commitment",
      text: "Прислать подписанный договор",
    });
    const mine = await memory.addRecord(owner, {
      entities: [
        { entityId: self.id, role: "debtor" },
        { entityId: olga.id, role: "creditor" },
      ],
      kind: "commitment",
      text: "Прислать смету",
    });
    return { mine, olga, owed };
  };

  it("drafts a letter to the one who owes, and nothing for a promise the person owes", async () => {
    boxes = [{ address: "me@example.test", toolPolicy: {} }];
    const { mine, olga, owed } = await seed();
    const draft = await remind.reminderDraft(owner, owed.id, {
      ...prefs,
      tone: "base",
    });
    expect(draft).toMatchObject({
      boxes: ["me@example.test"],
      by: "template",
      due: "13 ноября",
      given: "3 ноября",
      subject: "Напоминание: Прислать подписанный договор",
      to: { email: null, id: olga.id, name: "Ольга Ли" },
    });
    expect(draft?.text).toContain("срок был 13 ноября");
    expect(
      await remind.reminderDraft(owner, mine.id, { ...prefs, tone: "base" })
    ).toBeNull();
  });

  it("sends from the box, notes it on the card and takes the row away", async () => {
    boxes = [{ address: "me@example.test", toolPolicy: {} }];
    const { olga, owed } = await seed();
    const before = await today.todaySuggestions(owner, TZ);
    expect(before.map((s) => s.id)).toContain(owed.id);
    const result = await remind.sendReminder(
      owner,
      owed.id,
      {
        subject: "Договор",
        text: "Ольга, добрый день!",
        to: "olga@example.test",
      },
      prefs
    );
    expect(result).toEqual({ from: "me@example.test", sent: true });
    expect(sent).toHaveBeenLastCalledWith(owner, {
      mailbox: "me@example.test",
      subject: "Договор",
      text: "Ольга, добрый день!",
      to: ["olga@example.test"],
    });
    const events = await memory.listRecords(owner, {
      entityId: olga.id,
      kinds: ["event"],
    });
    expect(events.map((e) => e.text)).toEqual([
      "Напоминание по почте: Прислать подписанный договор",
    ]);
    const after = await today.todaySuggestions(owner, TZ);
    expect(after.map((s) => s.id)).not.toContain(owed.id);
  });

  it("refuses a box where sending is off, and asks which of several", async () => {
    const { owed } = await seed();
    const letter = {
      subject: "Договор",
      text: "Текст",
      to: "olga@example.test",
    };
    sent.mockClear();
    boxes = [
      { address: "me@example.test", toolPolicy: { email_send: "deny" } },
    ];
    await expect(
      remind.sendReminder(owner, owed.id, letter, prefs)
    ).rejects.toThrow("no mailbox");
    boxes = [
      { address: "a@example.test", toolPolicy: {} },
      { address: "b@example.test", toolPolicy: {} },
    ];
    await expect(
      remind.sendReminder(owner, owed.id, letter, prefs)
    ).rejects.toThrow("no mailbox");
    expect(sent).not.toHaveBeenCalled();
    const draft = await remind.reminderDraft(owner, owed.id, {
      ...prefs,
      tone: "base",
    });
    expect(draft?.boxes).toEqual(["a@example.test", "b@example.test"]);
  });
});
