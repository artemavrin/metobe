import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getContext } from "@/lib/context";
import { canOpen, isAdminRole } from "@/lib/settings-nav";

/** The signed-in user, their context and whether they may see the service's settings; read once per request. */
export const getSettingsViewer = cache(async () => {
  const ctx = await getContext();
  const role = ctx?.platformRole ?? "user";
  return { admin: isAdminRole(role), ctx, role, user: ctx?.user ?? null };
});

/** 404 for sections that do not exist or that this user may not open (never an empty admin screen). */
export const requireSection = async (id: string) => {
  const { admin } = await getSettingsViewer();
  if (!canOpen(id, admin)) {
    notFound();
  }
};
