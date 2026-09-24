import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { user } from "@metobe/db/schema/auth";
import { claimTokens } from "@metobe/db/schema/claim";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { getDb } from "./db";
import { getEnv } from "./env";

const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
// Serializes redemption so two different claim tokens cannot create two superusers.
const CLAIM_LOCK_KEY = 7_272_702;

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const hasSuperuser = async () => {
  const rows = await getDb()
    .db.select({ id: user.id })
    .from(user)
    .where(eq(user.role, "superuser"))
    .limit(1);
  return rows.length > 0;
};

// Returns a one-time claim URL, or null when the install already has its superuser.
export const issueClaimLink = async () => {
  if (await hasSuperuser()) {
    return null;
  }
  const token = randomBytes(32).toString("base64url");
  await getDb()
    .db.insert(claimTokens)
    .values({
      expiresAt: new Date(Date.now() + CLAIM_TTL_MS),
      tokenHash: hashToken(token),
    });
  const url = new URL("/claim", getEnv().BETTER_AUTH_URL);
  url.searchParams.set("token", token);
  return url.toString();
};

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "invalid-token" | "already-claimed" };

// Creates the superuser. The caller signs them in afterwards (see apps/web claim action).
export const redeemClaimToken = (input: {
  email: string;
  name: string;
  token: string;
}): Promise<ClaimResult> =>
  getDb().db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CLAIM_LOCK_KEY})`);

    const existing = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, "superuser"))
      .limit(1);
    if (existing.length > 0) {
      return { ok: false, reason: "already-claimed" };
    }

    const [claim] = await tx
      .update(claimTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(claimTokens.tokenHash, hashToken(input.token)),
          isNull(claimTokens.usedAt),
          gt(claimTokens.expiresAt, new Date())
        )
      )
      .returning({ id: claimTokens.id });
    if (!claim) {
      return { ok: false, reason: "invalid-token" };
    }

    await tx.insert(user).values({
      email: input.email.toLowerCase(),
      emailVerified: true,
      id: randomUUID(),
      name: input.name,
      role: "superuser",
    });
    return { ok: true };
  });
