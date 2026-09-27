"use server";

import {
  checkCatalogItem,
  getCatalogItem,
  setCatalogToken,
} from "@metobe/core/catalog";
import { listChatServers } from "@metobe/core/mcp";
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

export type ConnectResult =
  | { state: "ok" }
  | { state: "signIn"; url: string }
  | { state: "refused" | "error" };

/**
 * A user connects to an MCP server from the chat, with their own credentials: OAuth answers with the provider's page
 * (the user comes back to `returnTo`), a token, a header or a login and password is saved and checked on the spot.
 * Only servers the user may use, and only for a per-user server — a shared one is the admin's to fix.
 */
export const connectServer = async (input: {
  catalogId: string;
  returnTo: string;
  secret?: string;
  username?: string;
}): Promise<ConnectResult> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const id = z.uuid().safeParse(input.catalogId);
  if (!session || !id.success) {
    return { state: "error" };
  }
  const userId = session.user.id;
  const servers = await listChatServers(userId);
  const item = servers.some((s) => s.id === id.data)
    ? await getCatalogItem(id.data)
    : null;
  if (!item || item.credentialMode !== "per_user") {
    return { state: "error" };
  }
  // Back to this app's page only, never an address from outside.
  const returnTo = /^\/(?!\/)/u.test(input.returnTo) ? input.returnTo : "/";
  if (item.config.auth !== "oauth" && item.config.auth !== "none") {
    const secret = z.string().trim().min(1).max(4000).safeParse(input.secret);
    if (!secret.success) {
      return { state: "error" };
    }
    await setCatalogToken(
      item,
      userId,
      secret.data,
      z.string().trim().max(200).optional().parse(input.username)
    );
  }
  const result = await checkCatalogItem(item, userId, returnTo);
  if (result.health.state === "ok") {
    return { state: "ok" };
  }
  if (result.authorizationUrl) {
    return { state: "signIn", url: result.authorizationUrl };
  }
  return { state: result.health.state === "auth" ? "refused" : "error" };
};
