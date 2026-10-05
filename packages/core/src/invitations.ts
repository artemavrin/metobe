import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { INVITATION_TTL_DAYS, canInvite } from "@metobe/contracts/members";
import type { InvitableRole, Role } from "@metobe/contracts/members";
import { user } from "@metobe/db/schema/auth";
import { invitations } from "@metobe/db/schema/invitations";
import type { Locale } from "@metobe/i18n/config";
import { getTranslator } from "@metobe/i18n/translator";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { getDb } from "./db";
import { getEnv } from "./env";
import { isMailConfigured, sendMail } from "./mail";
import { staleUnverified } from "./users";

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

/**
 * A new invitation: its link (shown once) and its id. Refused when the actor may not invite to that role, and — as
 * `reason: "mail"` — when the link is for no address while the service has no mail to check the one its holder types.
 */
export const issueInvitation = async (input: {
  actor: { id: string; role: Role };
  role: InvitableRole;
  email?: string;
}) => {
  if (!canInvite(input.actor.role, input.role)) {
    throw new NotAllowedError();
  }
  if (!input.email?.trim() && !(await isMailConfigured())) {
    return { ok: false as const, reason: "mail" as const };
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
    ok: true as const,
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
  | {
      ok: true;
      /** The link was for this address, so holding it proves the mailbox; otherwise the caller checks it by a code. */
      verified: boolean;
    }
  | {
      ok: false;
      reason: "invalid-token" | "wrong-email" | "email-taken" | "needs-mail";
    };

/**
 * Makes the person the link is for. A link for an address signs them in at once (the link is the proof); one for no
 * address makes an account whose mailbox is not checked yet, and the caller sends the code that checks it (see the
 * invite action in apps/web) — without the mail that cannot be done, so nothing is made.
 */
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
    if (!invitation.email && !(await isMailConfigured())) {
      return { ok: false, reason: "needs-mail" };
    }
    await tx.delete(user).where(staleUnverified());
    const [taken] = await tx
      .select({ id: user.id, verified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email));
    // An invitation to this very address outranks an account someone made with it and never confirmed.
    if (taken && !taken.verified && invitation.email) {
      await tx.delete(user).where(eq(user.id, taken.id));
    } else if (taken) {
      return { ok: false, reason: "email-taken" };
    }
    const id = randomUUID();
    await tx.insert(user).values({
      email,
      emailVerified: Boolean(invitation.email),
      id,
      name: input.name,
      role: invitation.role,
    });
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedBy: id })
      .where(eq(invitations.id, invitation.id));
    return { ok: true, verified: Boolean(invitation.email) };
  });

/** The letter that carries an invitation's link to its address; false when it did not go (the link still works). */
export const sendInvitationLetter = async (input: {
  to: string;
  url: string;
  inviter: string;
  role: InvitableRole;
  locale: Locale;
}) => {
  const [t, { inviteLetter }] = await Promise.all([
    getTranslator(input.locale),
    import("@metobe/emails/invite-letter"),
  ]);
  const text = t("email.invite.text", {
    inviter: input.inviter,
    role: t(`email.invite.roles.${input.role}`),
  });
  const ttl = t("email.invite.ttl", { days: INVITATION_TTL_DAYS });
  try {
    const { html, text: plain } = await inviteLetter({
      button: { href: input.url, label: t("email.invite.button") },
      heading: t("email.invite.heading"),
      ignore: t("email.invite.ignore"),
      locale: input.locale,
      preview: text,
      text,
      ttl,
    });
    await sendMail({
      html,
      subject: t("email.invite.subject", { inviter: input.inviter }),
      text: plain,
      to: input.to,
    });
    return true;
  } catch (error) {
    console.error("invitation letter was not sent", error);
    return false;
  }
};
