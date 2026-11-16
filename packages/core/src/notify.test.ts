import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { user } from "@metobe/db/schema/auth";
import { userChannels } from "@metobe/db/schema/channels";
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

import type * as NotifyModule from "./notify";

const sendMail = vi.fn();
const sendTelegram = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("./mail", () => ({
  isMailConfigured: () => Promise.resolve(true),
  sendMail: (letter: unknown) => sendMail(letter),
}));
vi.mock("./telegram", () => {
  class TelegramError extends Error {
    code: number | null;
    constructor(message: string, code: number | null = null) {
      super(message);
      this.name = "TelegramError";
      this.code = code;
    }
  }
  return {
    TelegramError,
    botUsername: () => Promise.resolve("metobe_test_bot"),
    sendTelegram: (...args: unknown[]) => sendTelegram(...args),
    telegramToken: () => "token",
  };
});

// Needs a database of its own: MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test notify
const URL = process.env.MEMORY_TEST_DATABASE_URL;

const notice = {
  blocks: [{ text: "Новых заказов: 5 < 10", type: "p" as const }],
  links: [{ href: "https://metobe.test/tasks/1", label: "Открыть" }],
  mail: () =>
    Promise.resolve({ html: "<p>x</p>", subject: "Заказы", text: "x" }),
  title: "Заказы за неделю",
};

describe("telegramMessage (D43)", () => {
  it("puts the title in bold, the body and the links under it, and keeps under the limit", async () => {
    const { telegramMessage } = await import("./notify");
    const text = telegramMessage(notice);
    expect(text).toBe(
      '<b>Заказы за неделю</b>\n\nНовых заказов: 5 &lt; 10\n\n<a href="https://metobe.test/tasks/1">Открыть</a>'
    );
    const long = telegramMessage({
      ...notice,
      blocks: Array.from({ length: 80 }, () => ({
        text: "я".repeat(200),
        type: "p" as const,
      })),
    });
    expect(long.length).toBeLessThanOrEqual(4096);
    expect(long).toContain("Открыть");
  });
});

describe.skipIf(!URL)("notify (D43)", () => {
  const ana = `notify-test-${randomBytes(4).toString("hex")}`;
  let db: Db;
  let notifyModule: typeof NotifyModule;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    notifyModule = await import("./notify");
    await db
      .insert(user)
      .values({ email: `${ana}@example.test`, id: ana, name: ana });
  });

  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, [ana]));
  });

  beforeEach(async () => {
    sendMail.mockReset();
    sendTelegram.mockReset();
    await db.delete(userChannels).where(eq(userChannels.userId, ana));
    await db
      .update(user)
      .set({ notifyEmail: true, notifyTelegram: true })
      .where(eq(user.id, ana));
  });

  const bind = () =>
    db.insert(userChannels).values({
      chatId: "555",
      display: "@ana",
      kind: "telegram",
      status: "active",
      userId: ana,
    });

  it("tells the mail alone while no chat is bound", async () => {
    expect(await notifyModule.notify(ana, notice)).toEqual({
      mail: true,
      telegram: false,
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Заказы", to: `${ana}@example.test` })
    );
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("tells both when a chat is bound", async () => {
    await bind();
    expect(await notifyModule.notify(ana, notice)).toEqual({
      mail: true,
      telegram: true,
    });
    expect(sendTelegram).toHaveBeenCalledWith(
      "555",
      expect.stringContaining("<b>Заказы за неделю</b>"),
      { html: true }
    );
  });

  it("follows the person's switches: the mail off, Telegram off", async () => {
    await bind();
    await db.update(user).set({ notifyEmail: false }).where(eq(user.id, ana));
    expect(await notifyModule.notify(ana, notice)).toEqual({
      mail: false,
      telegram: true,
    });
    sendMail.mockReset();
    await db
      .update(user)
      .set({ notifyEmail: true, notifyTelegram: false })
      .where(eq(user.id, ana));
    expect(await notifyModule.notify(ana, notice)).toEqual({
      mail: true,
      telegram: false,
    });
  });

  it("draws the letter only when the mail is used", async () => {
    await bind();
    await db.update(user).set({ notifyEmail: false }).where(eq(user.id, ana));
    const mail = vi.fn(notice.mail);
    await notifyModule.notify(ana, { ...notice, mail });
    expect(mail).not.toHaveBeenCalled();
  });

  it("goes on with the other channel when one fails, and marks a blocked bot", async () => {
    await bind();
    sendMail.mockRejectedValue(new Error("smtp down"));
    expect(await notifyModule.notify(ana, notice)).toEqual({
      mail: false,
      telegram: true,
    });
    sendMail.mockReset();
    const { TelegramError } = await import("./telegram");
    sendTelegram.mockRejectedValue(
      new TelegramError("Forbidden: bot was blocked by the user", 403)
    );
    expect(await notifyModule.notify(ana, notice)).toEqual({
      mail: true,
      telegram: false,
    });
    const [row] = await db
      .select()
      .from(userChannels)
      .where(eq(userChannels.userId, ana));
    expect(row?.status).toBe("error");
    // A channel in error is not written to again.
    sendTelegram.mockReset();
    expect(await notifyModule.notify(ana, notice)).toEqual({
      mail: true,
      telegram: false,
    });
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("tells nothing about a user that is gone, and does not throw", async () => {
    expect(await notifyModule.notify("nobody", notice)).toEqual({
      mail: false,
      telegram: false,
    });
  });
});
