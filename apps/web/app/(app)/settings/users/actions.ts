"use server";

import { emailSchema } from "@metobe/contracts/auth";
import {
  canInvite,
  canRemove,
  invitableRoleSchema,
} from "@metobe/contracts/members";
import { deleteAccount } from "@metobe/core/account";
import { issueInvitation, revokeInvitation } from "@metobe/core/invitations";
import { getMember, setMemberRole } from "@metobe/core/users";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// Users (M6): admins only; what each may do to whom is in @metobe/contracts/members and checked again here.

const idSchema = z.uuid();
const refresh = () => revalidatePath("/settings", "layout");

const requireAdmin = async () => {
  const { admin, role, user } = await getSettingsViewer();
  if (!(admin && user)) {
    throw new Error("forbidden");
  }
  return { id: user.id, role: role as "superuser" | "admin" | "user" };
};

export type InviteResult =
  | { ok: true; id: string; url: string; expiresAt: string }
  | { ok: false };

/** A new invitation link for a role, for one address when it is given; the link is returned once and never kept. */
export const createInvite = async (
  role: string,
  email: string
): Promise<InviteResult> => {
  const actor = await requireAdmin();
  const parsedRole = invitableRoleSchema.safeParse(role);
  const address = email.trim() ? emailSchema.safeParse(email) : null;
  if (!parsedRole.success || (address && !address.success)) {
    return { ok: false };
  }
  if (!canInvite(actor.role, parsedRole.data)) {
    throw new Error("forbidden");
  }
  const made = await issueInvitation({
    actor,
    email: address?.success ? address.data : undefined,
    role: parsedRole.data,
  });
  refresh();
  return {
    expiresAt: made.expiresAt.toISOString(),
    id: made.id,
    ok: true,
    url: made.url,
  };
};

export const revokeInvite = async (id: string) => {
  const actor = await requireAdmin();
  await revokeInvitation(actor, idSchema.parse(id));
  refresh();
};

export const changeRole = async (id: string, role: string) => {
  const actor = await requireAdmin();
  const done = await setMemberRole(
    actor,
    idSchema.parse(id),
    invitableRoleSchema.parse(role)
  );
  refresh();
  return done;
};

export const removeUser = async (id: string) => {
  const actor = await requireAdmin();
  const target = await getMember(idSchema.parse(id));
  if (
    !target ||
    target.id === actor.id ||
    !canRemove(actor.role, target.role)
  ) {
    throw new Error("forbidden");
  }
  await deleteAccount(target.id);
  refresh();
};
