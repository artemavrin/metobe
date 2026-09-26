import { finishOAuth } from "@metobe/core/catalog";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getAuth } from "@/lib/auth";

// GET /api/mcp/oauth/callback — where an MCP server's OAuth provider sends the user back (ARCH §17.4). The state
// names a sign-in this user started; the code is traded for tokens kept as secrets. Then back to where they began —
// a path inside the app only, never an address from the query.

const back = (request: Request, path: string, failed = false) => {
  const url = new URL(
    path.startsWith("/") && !path.startsWith("//") ? path : "/settings",
    request.url
  );
  if (failed) {
    url.searchParams.set("oauth", "failed");
  }
  return NextResponse.redirect(url);
};

export const GET = async (request: Request) => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const query = new URL(request.url).searchParams;
  const state = query.get("state");
  const code = query.get("code");
  if (!session) {
    return back(request, "/login");
  }
  if (!state || !code) {
    return back(request, "/settings", true);
  }
  try {
    const returnTo = await finishOAuth({
      code,
      issuer: query.get("iss") ?? undefined,
      state,
      userId: session.user.id,
    });
    return returnTo
      ? back(request, returnTo)
      : back(request, "/settings", true);
  } catch (error) {
    console.error("mcp: the OAuth sign-in did not finish", error);
    return back(request, "/settings", true);
  }
};
