import "server-only";
import { isOrgRole } from "@metobe/contracts/members";
import { getMembership } from "@metobe/core/organizations";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getAuth } from "@/lib/auth";
import { canOpen, isAdminRole } from "@/lib/settings-nav";

/**
 * The signed-in user and what of the settings they may open; read once per request. `admin` is the install's role
 * (the platform's settings); `orgManager` is the owner or an admin of the organization `orgId` (its settings).
 */
export const getSettingsViewer = cache(async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  const membership = session ? await getMembership(session.user.id) : null;
  const orgRole = membership?.orgRole;
  return {
    admin: isAdminRole(role),
    orgId: membership?.organization.id ?? null,
    orgManager: isOrgRole(orgRole) && orgRole !== "member",
    role,
    user: session?.user ?? null,
  };
});

/** 404 for sections that do not exist or that this user may not open (never an empty admin screen). */
export const requireSection = async (id: string) => {
  const viewer = await getSettingsViewer();
  if (!canOpen(id, { orgManager: viewer.orgManager, platform: viewer.admin })) {
    notFound();
  }
};
