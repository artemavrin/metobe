import "server-only";
import { isOrgManager, isPlatformRole } from "@metobe/contracts/members";
import { loadContext } from "@metobe/core/context";
import type { RequestContext } from "@metobe/core/context";
import { headers } from "next/headers";
import { cache } from "react";

import { getAuth } from "@/lib/auth";

// The context of a request (D48, ARCH §20.2): the signed-in person, their organization and both roles. The session of
// Better Auth stays on the person; the organization, roles and the gates are read from the base each time, so turning an
// organization off acts at once. Every page, route and action asks here instead of calling `getSession` itself.

type SessionUser = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>
>["user"];

/** `sessionToken` is the current session's own, for the list of where the account is signed in. */
export type WebContext = RequestContext & {
  user: SessionUser;
  sessionToken: string;
};

/** The signed-in person's context, gates not applied (the «disabled» screen reads it); null — nobody is signed in. */
export const getContext = cache(async (): Promise<WebContext | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }
  const ctx = await loadContext(session.user.id);
  return ctx
    ? { ...ctx, sessionToken: session.session.token, user: session.user }
    : null;
});

/** For server actions that act for the person: null when nobody is signed in or their organization or they are off. */
export const getActiveContext = async () => {
  const ctx = await getContext();
  return ctx && !ctx.gate ? ctx : null;
};

/**
 * For route handlers: the context, or the response to return — 401 without a session, 403 `org-disabled` while the
 * organization or the person is turned off by the platform.
 */
export const requireContext = async (): Promise<WebContext | Response> => {
  const ctx = await getContext();
  if (!ctx) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (ctx.gate) {
    return Response.json(
      { error: "org-disabled", reason: ctx.gate },
      { status: 403 }
    );
  }
  return ctx;
};

/**
 * For platform-only routes (the update, the dump of the base): like `requireContext`, and anyone who is not the
 * platform's staff gets 404 — an organization's admin must not learn the route exists.
 */
export const requirePlatformRoute = async (): Promise<
  WebContext | Response
> => {
  const ctx = await requireContext();
  if (ctx instanceof Response) {
    return ctx;
  }
  return isPlatformRole(ctx.platformRole)
    ? ctx
    : Response.json({ error: "not found" }, { status: 404 });
};

/** Staff of the platform: the superuser and the install's admins. Throws for anyone else, and for the gated. */
export const requirePlatform = async () => {
  const ctx = await getActiveContext();
  if (!(ctx && isPlatformRole(ctx.platformRole))) {
    throw new Error("forbidden");
  }
  return ctx;
};

/** The owner or an admin of the person's organization. Throws for anyone else, and for the gated. */
export const requireOrgAdmin = async () => {
  const ctx = await getActiveContext();
  if (!(ctx && isOrgManager(ctx.orgRole))) {
    throw new Error("forbidden");
  }
  return ctx;
};
