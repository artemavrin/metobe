import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { user } from "@metobe/db/schema/auth";
import { chats } from "@metobe/db/schema/chat";
import { memoryWrites } from "@metobe/db/schema/memory";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as ChatModule from "./chat";
import { testMember } from "./test-organization";

vi.mock("server-only", () => ({}));
// The person's memory is on: what is under test is the chat's own switch.
vi.mock("./memory-write", () => ({
  isMemoryOnFor: () => Promise.resolve(true),
  readWrite: vi.fn(),
}));

// «Не запоминать этот чат» (Д7.2). Needs a database of its own, as memory.test.ts does:
// MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test memory-chat-off
const URL = process.env.MEMORY_TEST_DATABASE_URL;

describe.skipIf(!URL)("a chat the memory leaves alone (Д7.2)", () => {
  let db: Db;
  let chat: typeof ChatModule;
  const ana = `chat-off-${randomBytes(4).toString("hex")}`;
  const bob = `chat-off-${randomBytes(4).toString("hex")}`;
  const anaChat = crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    chat = await import("./chat");
    const member = await testMember(db);
    await db.insert(user).values(
      [ana, bob].map((id) => ({
        ...member,
        email: `${id}@example.test`,
        id,
        name: id,
      }))
    );
    await db.insert(chats).values({ id: anaChat, title: "Чат", userId: ana });
  });

  afterAll(async () => {
    await db?.delete(user).where(inArray(user.id, [ana, bob]));
  });

  it("is on by default, and only its owner switches it", async () => {
    expect(await chat.isChatMemoryOff(ana, anaChat)).toBe(false);
    expect(await chat.setChatMemoryOff(bob, anaChat, true)).toBe(false);
    expect(await chat.isChatMemoryOff(ana, anaChat)).toBe(false);
    expect(await chat.setChatMemoryOff(ana, anaChat, true)).toBe(true);
    expect(await chat.isChatMemoryOff(ana, anaChat)).toBe(true);
    // The sidebar's list tells it too.
    const list = await chat.listChats(ana);
    expect(list.find((c) => c.id === anaChat)?.memoryOff).toBe(true);
  });

  it("puts nothing of its messages in the queue, and takes them again when switched back", async () => {
    const { queueMemoryWrite } = await import("./memory-queue");
    await chat.setChatMemoryOff(ana, anaChat, true);
    const queued = await queueMemoryWrite({
      chatId: anaChat,
      ownerId: ana,
      source: "chat",
      sourceKey: crypto.randomUUID(),
      timeZone: "UTC",
    });
    expect(queued).toBeNull();
    const rows = await db
      .select({ id: memoryWrites.id })
      .from(memoryWrites)
      .where(eq(memoryWrites.ownerId, ana));
    expect(rows).toHaveLength(0);
    await chat.setChatMemoryOff(ana, anaChat, false);
    expect(await chat.isChatMemoryOff(ana, anaChat)).toBe(false);
  });
});
