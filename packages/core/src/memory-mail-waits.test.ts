import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { user } from "@metobe/db/schema/auth";
import { mailboxes } from "@metobe/db/schema/mail";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as MemoryModule from "./memory";
import type * as TodayModule from "./memory-today";

vi.mock("server-only", () => ({}));

// Needs a database of its own: MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test memory-mail-waits
const URL = process.env.MEMORY_TEST_DATABASE_URL;

const TZ = "Europe/Moscow";
const SERVER = { host: "mail.example", port: 993, security: "ssl" } as const;

describe.skipIf(!URL)("letters with no answer in «Не упустить» (Г3.1)", () => {
  const ana = `mailwait-test-${randomBytes(4).toString("hex")}`;
  let db: Db;
  let memory: typeof MemoryModule;
  let today: typeof TodayModule;
  let box = "";
  let olga = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    memory = await import("./memory");
    today = await import("./memory-today");
    await db.insert(user).values({
      email: `${ana}@example.test`,
      id: ana,
      name: ana,
    });
    const [row] = await db
      .insert(mailboxes)
      .values({
        address: "me@company.example",
        imap: SERVER,
        preset: "custom",
        smtp: SERVER,
        userId: ana,
        username: "me",
      })
      .returning({ id: mailboxes.id });
    box = row?.id ?? "";
    await memory.ensureSelf(ana, "Я");
    ({ id: olga } = await memory.createEntity(ana, {
      kind: "person",
      name: "Ольга Ли",
    }));
  });

  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, [ana]));
  });

  const letter = (sentAt: string) => ({
    body: {
      messageId: "<a@company.example>",
      references: ["<a@company.example>"],
      subject: "Договор поставки",
      to: "olga@vendor.example",
    },
    entityId: olga,
    key: "k1",
    sentAt: new Date(sentAt),
  });
  const rows = async (at: string) => {
    const all = await today.todaySuggestions(ana, TZ, new Date(at));
    return all.filter((r) => r.kind === "mail");
  };

  it("shows a letter once five working days have passed with no answer", async () => {
    // Friday 6 November; Thursday the 12th is the fourth working day, Friday the 13th the fifth.
    await memory.saveMailWaits(ana, box, [letter("2026-11-06T09:00:00Z")]);
    expect(await rows("2026-11-12T09:00:00Z")).toEqual([]);
    const [row] = await rows("2026-11-13T09:00:00Z");
    expect(row).toMatchObject({
      days: 5,
      email: "olga@vendor.example",
      key: `mail:${box}:k1`,
      mail: {
        box: "me@company.example",
        subject: "Договор поставки",
        workingDays: true,
      },
      reason: "waiting",
      side: "theirs",
      text: "Договор поставки",
      who: { id: olga, name: "Ольга Ли" },
    });
  });

  it("takes the card's wait rule over the five working days", async () => {
    const rule = await memory.addRecord(ana, {
      entities: [{ entityId: olga, role: "subject" }],
      kind: "rule",
      rule: { days: 3, kind: "wait", workingDays: false },
      text: "Ольга отвечает за три дня",
    });
    expect(await rows("2026-11-09T09:00:00Z")).toMatchObject([
      { days: 3, mail: { workingDays: false } },
    ]);
    await memory.deleteRecord(ana, rule.id);
  });

  it("«Убрать» keeps it away until the person writes again in the thread", async () => {
    const [wait] = await memory.listMailWaits(ana);
    expect(await memory.dismissMailWait(ana, wait?.id ?? "")).toBe(true);
    expect(await rows("2026-11-13T09:00:00Z")).toEqual([]);
    // A later letter of the person's in the thread: the wait counts from it, and the row is back when it is over.
    await memory.saveMailWaits(ana, box, [letter("2026-11-16T09:00:00Z")]);
    expect(await rows("2026-11-20T09:00:00Z")).toEqual([]);
    expect(await rows("2026-11-23T09:00:00Z")).toHaveLength(1);
    // An earlier time found again does not move the wait back.
    await memory.saveMailWaits(ana, box, [letter("2026-11-06T09:00:00Z")]);
    const [kept] = await memory.listMailWaits(ana);
    expect(kept?.sentAt).toEqual(new Date("2026-11-16T09:00:00Z"));
  });

  it("is gone once an answer came — the look finds it no more", async () => {
    await memory.saveMailWaits(ana, box, []);
    expect(await memory.listMailWaits(ana)).toEqual([]);
    expect(await rows("2026-11-30T09:00:00Z")).toEqual([]);
  });
});
