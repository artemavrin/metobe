"use server";

import {
  checkCatalogItem,
  disconnectMine,
  getCatalogItem,
  setCatalogToken,
  setMyLogin,
  startMySignIn,
} from "@metobe/core/catalog";
import { listMyConnections } from "@metobe/core/mcp";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "@/lib/auth";
import { OAUTH_POPUP_RETURN } from "@/lib/oauth-window";

// «Мои подключения» (ARCH §17.6): a user's own credentials to the per-user servers they may use — saved and checked
// at once, signed in with OAuth (in the provider's window, or this tab), or left. Only their own, never a shared one.

const refresh = () => revalidatePath("/settings", "layout");

/** The signed-in user and a per-user server they may use; null for anything else. */
const mine = async (catalogId: string) => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const id = z.uuid().safeParse(catalogId);
  if (!(session && id.success)) {
    return null;
  }
  const servers = await listMyConnections(session.user.id);
  const server = servers.find((s) => s.id === id.data);
  const item =
    server?.mode === "per_user" ? await getCatalogItem(id.data) : null;
  return item && server ? { item, server, userId: session.user.id } : null;
};

export type SaveResult =
  | { ok: true }
  | { ok: false; problem: "refused" | "failed" | "invalid" };

/**
 * Saves the user's token, header value, or login and password, then checks the server with them. An empty secret
 * keeps a working one — a login may change alone; a refused one must be replaced.
 */
export const saveMine = async (
  catalogId: string,
  input: { secret?: string; username?: string }
): Promise<SaveResult> => {
  const found = await mine(catalogId);
  const auth = found?.item.config.auth;
  if (!found || auth === "oauth" || auth === "none") {
    return { ok: false, problem: "invalid" };
  }
  const { item, server, userId } = found;
  const secret = z
    .string()
    .trim()
    .max(4000)
    .safeParse(input.secret ?? "");
  if (!secret.success) {
    return { ok: false, problem: "invalid" };
  }
  const canKeep = server.connection?.status === "active";
  if (auth === "basic") {
    // A colon ends the login in basic auth, so a login cannot hold one.
    const login = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^:]*$/u)
      .safeParse(input.username ?? "");
    if (!login.success || !(secret.data || canKeep)) {
      return { ok: false, problem: "invalid" };
    }
    await (secret.data
      ? setCatalogToken(item, userId, secret.data, login.data)
      : setMyLogin(item, userId, login.data));
  } else if (secret.data) {
    await setCatalogToken(item, userId, secret.data);
  } else {
    return canKeep ? { ok: true } : { ok: false, problem: "invalid" };
  }
  const result = await checkCatalogItem(
    item,
    userId,
    `/settings/connections/${item.id}`
  );
  refresh();
  if (result.health.state === "ok") {
    return { ok: true };
  }
  return {
    ok: false,
    problem: result.health.state === "auth" ? "refused" : "failed",
  };
};

/**
 * OAuth: the provider's sign-in page for this user — the first time or again, even while their tokens still work —
 * back to the window's relay, or to a page of this app when the window was blocked.
 */
export const signInMine = async (
  catalogId: string,
  returnTo: string
): Promise<
  { state: "ok" } | { state: "signIn"; url: string } | { state: "error" }
> => {
  const found = await mine(catalogId);
  if (found?.item.config.auth !== "oauth") {
    return { state: "error" };
  }
  // Back to the relay or to this app's own page, never an address from outside.
  const back =
    returnTo === OAUTH_POPUP_RETURN || /^\/(?![/\\])/u.test(returnTo)
      ? returnTo
      : `/settings/connections/${found.item.id}`;
  const result = await startMySignIn(found.item, found.userId, back);
  if (result.state === "ok") {
    refresh();
  }
  return result;
};

/** Leaves a server: the user's connection and its secrets go; the server stays in the list, to connect again. */
export const leaveMine = async (catalogId: string) => {
  const found = await mine(catalogId);
  if (!found) {
    return;
  }
  await disconnectMine(found.item, found.userId);
  refresh();
};
