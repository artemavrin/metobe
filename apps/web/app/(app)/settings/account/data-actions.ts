"use server";

import {
  deleteAccount,
  deleteAllChats,
  LastOwnerError,
} from "@metobe/core/account";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

// The user's data (ARCH §17.6): what can be taken away is taken by /api/account/export; what can be deleted is here.

const session = async () =>
  getAuth().api.getSession({ headers: await headers() });

/** Deletes every chat of the signed-in user's. */
export const removeAllChats = async () => {
  const s = await session();
  if (!s) {
    return { count: 0, ok: false as const };
  }
  const count = await deleteAllChats(s.user.id);
  revalidatePath("/", "layout");
  return { count, ok: true as const };
};

/** Deletes the account once the user has typed its email; then off to the sign-in page. */
export const removeAccount = async (confirm: string) => {
  const s = await session();
  if (!s || confirm.trim().toLowerCase() !== s.user.email.toLowerCase()) {
    return { ok: false as const, problem: "confirm" as const };
  }
  try {
    await deleteAccount(s.user.id);
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return { ok: false as const, problem: "lastOwner" as const };
    }
    throw error;
  }
  redirect("/login");
};
