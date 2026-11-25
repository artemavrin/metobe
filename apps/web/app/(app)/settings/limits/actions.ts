"use server";

import { chatLimitSchema, limitedRoles } from "@metobe/contracts/limits";
import type { ChatLimit, LimitedRole } from "@metobe/contracts/limits";
import { getChatLimits, setChatLimits } from "@metobe/core/chat-limits";
import { revalidatePath } from "next/cache";

import { requirePlatform } from "@/lib/context";

// How many chat messages a role may send (ARCH §10): admins only.

/** Sets one role's limits; false when they are not whole numbers above zero (or none). */
export const saveLimit = async (role: LimitedRole, limit: ChatLimit) => {
  await requirePlatform();
  const parsed = chatLimitSchema.safeParse(limit);
  if (!parsed.success || !limitedRoles.includes(role)) {
    return false;
  }
  await setChatLimits({ ...(await getChatLimits()), [role]: parsed.data });
  revalidatePath("/settings/limits");
  return true;
};
