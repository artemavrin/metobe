import { finishOAuth } from "@metobe/core/catalog";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getAuth } from "@/lib/auth";
import { OAUTH_POPUP_RETURN } from "@/lib/oauth-window";

// GET /api/mcp/oauth/callback — where an MCP server's OAuth provider sends the user back (ARCH §17.4). The state
// names a sign-in this user started; the code is traded for tokens kept as secrets. A sign-in started in a window
// ends on the relay with its result (it tells the page and closes); one started in this tab goes back to where it
// began — a path inside the app only, never an address from the query. A failure ends on the relay, which says so.

const to = (
  request: Request,
  path: string,
  params: Record<string, string> = {}
) => {
  const url = new URL(
    path.startsWith("/") && !path.startsWith("//") ? path : "/settings",
    request.url
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
};

const failed = (request: Request) => to(request, "/mcp-oauth", { ok: "0" });

export const GET = async (request: Request) => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const query = new URL(request.url).searchParams;
  const state = query.get("state");
  const code = query.get("code");
  if (!session) {
    return to(request, "/login");
  }
  if (!state || !code) {
    return failed(request);
  }
  try {
    const done = await finishOAuth({
      code,
      issuer: query.get("iss") ?? undefined,
      state,
      userId: session.user.id,
    });
    if (!done) {
      return failed(request);
    }
    return done.returnTo === OAUTH_POPUP_RETURN
      ? to(request, done.returnTo, { ok: "1", server: done.catalogId })
      : to(request, done.returnTo);
  } catch (error) {
    console.error("mcp: the OAuth sign-in did not finish", error);
    return failed(request);
  }
};
