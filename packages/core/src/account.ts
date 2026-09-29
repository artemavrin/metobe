import "server-only";
import { user } from "@metobe/db/schema/auth";
import { connections } from "@metobe/db/schema/catalog";
import { chats, messages } from "@metobe/db/schema/chat";
import { mailboxes } from "@metobe/db/schema/mail";
import { modelRuns, models, sources } from "@metobe/db/schema/models";
import { and, asc, count, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "./db";
import { removeSecrets } from "./secrets";

// The user's own account (ARCH §17.6): the profile they edit, what the model is told about them, their data — to
// take away or to delete — and what they used. Only ever the signed-in user's own rows.

export type SendKey = "enter" | "mod-enter";

const MAX_INSTRUCTIONS = 2000;

/** What the profile and personal settings hold. */
export const getAccount = async (userId: string) => {
  const [row] = await getDb()
    .db.select({
      email: user.email,
      image: user.image,
      instructions: user.instructions,
      name: user.name,
      role: user.role,
      sendKey: user.sendKey,
    })
    .from(user)
    .where(eq(user.id, userId));
  return row ?? null;
};

/** The user's notes for the model, as written; empty when there are none. */
export const getInstructions = async (userId: string) => {
  const [row] = await getDb()
    .db.select({ instructions: user.instructions })
    .from(user)
    .where(eq(user.id, userId));
  return row?.instructions?.trim() ?? "";
};

export const setName = async (userId: string, name: string) => {
  await getDb().db.update(user).set({ name }).where(eq(user.id, userId));
};

/** A picture as a data URL, or null to go back to the initials. Callers check its type and size. */
export const setImage = async (userId: string, image: string | null) => {
  await getDb().db.update(user).set({ image }).where(eq(user.id, userId));
};

export const setInstructions = async (userId: string, text: string) => {
  const trimmed = text.trim().slice(0, MAX_INSTRUCTIONS);
  await getDb()
    .db.update(user)
    .set({ instructions: trimmed || null })
    .where(eq(user.id, userId));
};

export { MAX_INSTRUCTIONS };

export const setSendKey = async (userId: string, sendKey: SendKey) => {
  await getDb()
    .db.update(user)
    .set({ sendKey: sendKey === "enter" ? null : sendKey })
    .where(eq(user.id, userId));
};

/** Deletes every chat of the user's and its messages; what they cost stays in the usage, without the chat. */
export const deleteAllChats = async (userId: string) => {
  const removed = await getDb()
    .db.delete(chats)
    .where(eq(chats.userId, userId))
    .returning({ id: chats.id });
  return removed.length;
};

/** Why an account cannot be deleted: it is the last owner's. */
export class LastOwnerError extends Error {
  constructor() {
    super("the last owner cannot be deleted");
    this.name = "LastOwnerError";
  }
}

/**
 * Deletes the account: the profile, sessions, chats, connections and mailboxes go with it (foreign keys), and the
 * secrets of the connections and mailboxes are removed by hand — they hang on no key. What the runs cost stays, with no
 * name on it. The last owner cannot leave: nobody would be left to run the install.
 */
export const deleteAccount = async (userId: string) => {
  const { db } = getDb();
  const [me] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId));
  if (!me) {
    return;
  }
  if (me.role === "superuser") {
    const [owners] = await db
      .select({ n: count() })
      .from(user)
      .where(eq(user.role, "superuser"));
    if ((owners?.n ?? 0) <= 1) {
      throw new LastOwnerError();
    }
  }
  const [mine, boxes] = await Promise.all([
    db
      .select({ id: connections.id })
      .from(connections)
      .where(eq(connections.userId, userId)),
    db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(eq(mailboxes.userId, userId)),
  ]);
  await Promise.all([
    ...mine.map((c) => removeSecrets({ id: c.id, type: "connection" })),
    ...boxes.map((b) => removeSecrets({ id: b.id, type: "mailbox" })),
  ]);
  await db.delete(user).where(eq(user.id, userId));
};

/**
 * Everything of the user's to take away: the profile, the chats with their messages, the names of the connections
 * and mailboxes. No secret — no password, no token — and nobody else's data.
 */
export const exportAccount = async (userId: string) => {
  const { db } = getDb();
  const account = await getAccount(userId);
  const myChats = await db
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(asc(chats.createdAt));
  const ids = myChats.map((c) => c.id);
  const myMessages = ids.length
    ? await db
        .select()
        .from(messages)
        .where(inArray(messages.chatId, ids))
        .orderBy(asc(messages.createdAt))
    : [];
  const byChat = new Map<string, (typeof myMessages)[number][]>();
  for (const m of myMessages) {
    byChat.set(m.chatId, [...(byChat.get(m.chatId) ?? []), m]);
  }
  const boxes = await db
    .select({ address: mailboxes.address, createdAt: mailboxes.createdAt })
    .from(mailboxes)
    .where(eq(mailboxes.userId, userId));
  return {
    account: account && {
      email: account.email,
      instructions: account.instructions,
      name: account.name,
      role: account.role,
    },
    chats: myChats.map((c) => ({
      createdAt: c.createdAt,
      id: c.id,
      messages: (byChat.get(c.id) ?? []).map((m) => ({
        createdAt: m.createdAt,
        id: m.id,
        metadata: m.metadata,
        parts: m.parts,
        role: m.role,
      })),
      title: c.title,
      updatedAt: c.updatedAt,
    })),
    exportedAt: new Date().toISOString(),
    mailboxes: boxes,
  };
};

/** One model's use in a month: requests, tokens, and what they cost in the model's own currency. */
export interface UsageRow {
  model: string;
  source: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: { currency: string; amount: number }[];
}

/** What the user used in a month (from the 1st, to the 1st of the next), by model — chat answers and service jobs. */
export const usageOfMonth = async (
  userId: string,
  month: { from: Date; to: Date }
): Promise<UsageRow[]> => {
  const { db } = getDb();
  const rows = await db
    .select({
      cacheRead: sql<number>`coalesce(sum(${modelRuns.cacheReadTokens}), 0)::int`,
      cost: sql<string | null>`sum(${modelRuns.cost})`,
      currency: modelRuns.currency,
      inputTokens: sql<number>`coalesce(sum(${modelRuns.inputTokens}), 0)::int`,
      model: models.title,
      outputTokens: sql<number>`coalesce(sum(${modelRuns.outputTokens}), 0)::int`,
      requests: sql<number>`count(*)::int`,
      source: sources.title,
    })
    .from(modelRuns)
    .leftJoin(models, eq(models.id, modelRuns.modelId))
    .leftJoin(sources, eq(sources.id, models.sourceId))
    .where(
      and(
        eq(modelRuns.userId, userId),
        gte(modelRuns.createdAt, month.from),
        lt(modelRuns.createdAt, month.to)
      )
    )
    .groupBy(models.title, sources.title, modelRuns.currency);
  // One row per model; its cost per currency (a model has one, but a price may have changed its unit).
  const byModel = new Map<string, UsageRow>();
  for (const r of rows) {
    const key = `${r.source ?? ""}|${r.model ?? ""}`;
    const row = byModel.get(key) ?? {
      cacheReadTokens: 0,
      cost: [],
      inputTokens: 0,
      model: r.model ?? "",
      outputTokens: 0,
      requests: 0,
      source: r.source ?? "",
    };
    row.requests += r.requests;
    row.inputTokens += r.inputTokens;
    row.outputTokens += r.outputTokens;
    row.cacheReadTokens += r.cacheRead;
    if (r.cost !== null && r.currency) {
      row.cost.push({ amount: Number(r.cost), currency: r.currency });
    }
    byModel.set(key, row);
  }
  // toSorted is past the ES2022 target; the spread is a fresh array.
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
  return [...byModel.values()].sort((a, b) => b.requests - a.requests);
};
