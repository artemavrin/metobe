import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { INVITATION_TTL_DAYS, canInvite } from "@metobe/contracts/members";
import type { InvitableRole, Role } from "@metobe/contracts/members";
import { user } from "@metobe/db/schema/auth";
import { invitations } from "@metobe/db/schema/invitations";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { getDb } from "./db";
import { getEnv } from "./env";

// Invitations (D17): a link an admin copies and hands over. Whoever opens it names themselves and is signed in at once, so
// the install needs no mail to take people in. Only the hash of a token is kept; the link is shown once, when it is made.

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

// Serializes redemption: one link makes one person even when two open it at once.
const LOCK_KEY = 7_272_703;

export class NotAllowedError extends Error {
  constructor() {
    super("this role may not make that invitation");
    this.name = "NotAllowedError";
  }
}

/** A new invitation: its link (shown once) and its id. Refused when the actor may not invite to that role. */
export const issueInvitation = async (input: {
  actor: { id: string; role: Role };
  role: InvitableRole;
  email?: string;
}) => {
  if (!canInvite(input.actor.role, input.role)) {
    throw new NotAllowedError();
  }
  const token = randomBytes(32).toString("base64url");
  const [row] = await getDb()
    .db.insert(invitations)
    .values({
      createdBy: input.actor.id,
      email: input.email?.trim().toLowerCase() || null,
      expiresAt: new Date(
        Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000
      ),
      role: input.role,
      tokenHash: hashToken(token),
    })
    .returning({ expiresAt: invitations.expiresAt, id: invitations.id });
  const url = new URL("/invite", getEnv().BETTER_AUTH_URL);
  url.searchParams.set("token", token);
  return {
    expiresAt: row?.expiresAt ?? new Date(),
    id: row?.id ?? "",
    url: url.toString(),
  };
};

/** The invitations still open: not used, not past their time — newest first, with who made them. */
export const listOpenInvitations = () => {
  const { db } = getDb();
  return db
    .select({
      createdAt: invitations.createdAt,
      createdByName: user.name,
      email: invitations.email,
      expiresAt: invitations.expiresAt,
      id: invitations.id,
      role: invitations.role,
    })
    .from(invitations)
    .leftJoin(user, eq(user.id, invitations.createdBy))
    .where(
      and(isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date()))
    )
    .orderBy(desc(invitations.createdAt));
};

/** Takes an open invitation back: its link stops working. An admin takes back only the ones for users. */
export const revokeInvitation = async (
  actor: { role: Role },
  id: string
): Promise<boolean> => {
  const { db } = getDb();
  const [found] = await db
    .select({ role: invitations.role })
    .from(invitations)
    .where(and(eq(invitations.id, id), isNull(invitations.acceptedAt)));
  if (!found) {
    return false;
  }
  if (!canInvite(actor.role, found.role as InvitableRole)) {
    throw new NotAllowedError();
  }
  await db.delete(invitations).where(eq(invitations.id, id));
  return true;
};

/** What a link offers, for the page it opens: the role, and the address when the link is for one; null — not open. */
export const previewInvitation = async (token: string) => {
  const [row] = await getDb()
    .db.select({ email: invitations.email, role: invitations.role })
    .from(invitations)
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date())
      )
    );
  return row ?? null;
};

export type RedeemResult =
  | { ok: true }
  | { ok: false; reason: "invalid-token" | "wrong-email" | "email-taken" };

/** Makes the person the link is for. The caller signs them in afterwards (see the invite action in apps/web). */
export const redeemInvitation = (input: {
  email: string;
  name: string;
  token: string;
}): Promise<RedeemResult> =>
  getDb().db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);
    const email = input.email.toLowerCase();
    const [invitation] = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, hashToken(input.token)),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date())
        )
      );
    if (!invitation) {
      return { ok: false, reason: "invalid-token" };
    }
    if (invitation.email && invitation.email !== email) {
      return { ok: false, reason: "wrong-email" };
    }
    const [taken] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    if (taken) {
      return { ok: false, reason: "email-taken" };
    }
    const id = randomUUID();
    await tx.insert(user).values({
      email,
      emailVerified: true,
      id,
      name: input.name,
      role: invitation.role,
    });
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedBy: id })
      .where(eq(invitations.id, invitation.id));
    return { ok: true };
  });
