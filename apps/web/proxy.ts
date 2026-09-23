import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie presence only: the real session check happens in the (app) layout (Next and Better Auth both advise this).
export const proxy = (request: NextRequest) => {
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
};

export const config = {
  matcher: ["/((?!login|claim|api/auth|api/health|dev|_next|favicon.ico).*)"],
};
