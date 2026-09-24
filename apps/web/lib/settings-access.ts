import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getAuth } from "@/lib/auth";
import { canOpen, isAdminRole } from "@/lib/settings-nav";

/** The signed-in user and whether they may see the service's settings; read once per request. */
export const getSettingsViewer = cache(async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  return { admin: isAdminRole(role), role, user: session?.user ?? null };
});

/** 404 for sections that do not exist or that this user may not open (never an empty admin screen). */
export const requireSection = async (id: string) => {
  const { admin } = await getSettingsViewer();
  if (!canOpen(id, admin)) {
    notFound();
  }
};
