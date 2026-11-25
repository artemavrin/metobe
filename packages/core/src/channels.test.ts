import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { user } from "@metobe/db/schema/auth";
import { userChannels } from "@metobe/db/schema/channels";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as ChannelsModule from "./channels";
import { testMember } from "./test-organization";

vi.mock("server-only", () => ({}));
vi.mock("./telegram", () => ({
  botUsername: () => Promise.resolve("metobe_test_bot"),
  telegramToken: () => "token",
}));

// Needs a database of its own: MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test channels
const URL = process.env.MEMORY_TEST_DATABASE_URL;

const codeOf = (url: string) => url.split("?start=")[1] ?? "";

describe.skipIf(!URL)("Telegram channel (D43)", () => {
  const ana = `chan-test-${randomBytes(4).toString("hex")}`;
  const bob = `chan-test-${randomBytes(4).toString("hex")}`;
  let db: Db;
  let channels: typeof ChannelsModule;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    channels = await import("./channels");
    const member = await testMember(db);
    await db.insert(user).values(
      [ana, bob].map((id) => ({
        ...member,
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

  it("binds a chat with a one-time code, and the code is spent", async () => {
    expect(await channels.telegramChannel(ana)).toBeNull();
    const link = await channels.startTelegramLink(ana);
    if (!link.ok) {
      throw new Error("no link");
    }
    expect(link.url.startsWith("https://t.me/metobe_test_bot?start=")).toBe(
      true
    );
    expect(await channels.telegramChannel(ana)).toMatchObject({
      status: "pending",
    });
    // The code is not kept: a hash is.
    const [row] = await db
      .select()
      .from(userChannels)
      .where(eq(userChannels.userId, ana));
    expect(row?.codeHash).toBeTruthy();
    expect(row?.codeHash).not.toContain(codeOf(link.url));

    expect(
      await channels.completeTelegramLink("not-a-code-at-all", {
        display: "@x",
        id: "9001",
      })
    ).toEqual({ result: "invalid" });
    const done = await channels.completeTelegramLink(codeOf(link.url), {
      display: "@ana",
      id: "9001",
    });
    expect(done).toMatchObject({ locale: "ru", result: "linked", userId: ana });
    expect(await channels.telegramChannel(ana)).toMatchObject({
      display: "@ana",
      status: "active",
    });
    expect(await channels.activeTelegramChat(ana)).toBe("9001");
    // Spent: the same code does not bind again.
    expect(
      await channels.completeTelegramLink(codeOf(link.url), {
        display: "@ana",
        id: "9002",
      })
    ).toEqual({ result: "invalid" });
  });

  it("refuses a new link while a chat is bound, and lets another account not take the chat", async () => {
    expect(await channels.startTelegramLink(ana)).toEqual({
      ok: false,
      reason: "linked",
    });
    const link = await channels.startTelegramLink(bob);
    if (!link.ok) {
      throw new Error("no link");
    }
    expect(
      await channels.completeTelegramLink(codeOf(link.url), {
        display: "@ana",
        id: "9001",
      })
    ).toEqual({ result: "taken" });
    expect(await channels.telegramChannel(bob)).toMatchObject({
      status: "pending",
    });
  });

  it("does not take a code that has run out", async () => {
    const link = await channels.startTelegramLink(bob);
    if (!link.ok) {
      throw new Error("no link");
    }
    await db
      .update(userChannels)
      .set({ codeExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(userChannels.userId, bob));
    expect(
      await channels.completeTelegramLink(codeOf(link.url), {
        display: "@bob",
        id: "9003",
      })
    ).toEqual({ result: "invalid" });
    // An expired code is no channel in the settings: «Привязать» again.
    expect(await channels.telegramChannel(bob)).toBeNull();
  });

  it("shows a blocked bot as an error, and takes the channel off", async () => {
    await channels.markTelegramError(
      ana,
      "Forbidden: bot was blocked by the user"
    );
    expect(await channels.telegramChannel(ana)).toMatchObject({
      lastError: expect.stringContaining("blocked"),
      status: "error",
    });
    expect(await channels.activeTelegramChat(ana)).toBeNull();
    await channels.unlinkTelegram(ana);
    expect(await channels.telegramChannel(ana)).toBeNull();
  });
});
