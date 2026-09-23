import "server-only";
import { getEnv } from "./env";

// A login link is the sign-in code embedded in a URL: one mechanism for email, invites and CLI.
export const buildLoginLink = (email: string, code: string) => {
  const url = new URL("/login/verify", getEnv().BETTER_AUTH_URL);
  url.searchParams.set("email", email);
  url.searchParams.set("code", code);
  return url.toString();
};
