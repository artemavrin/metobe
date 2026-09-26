"use server";

import { setFavoriteModels } from "@metobe/core/model-choices";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuth } from "@/lib/auth";

export const signOut = async () => {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
};

const favoritesSchema = z.array(z.uuid()).max(500);

/** The user's favorite models in their new order (the picker and the palette star, unstar and reorder). */
export const saveFavorites = async (ids: string[]) => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const parsed = favoritesSchema.safeParse(ids);
  if (!session || !parsed.success) {
    return;
  }
  await setFavoriteModels(session.user.id, parsed.data);
};
