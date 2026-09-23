import "server-only";
import { createAuth } from "@purr/core/auth";
import { nextCookies } from "better-auth/next-js";

let instance: ReturnType<typeof createAuth> | undefined;

// Lazy so `next build` never needs runtime env (DB URL, auth secret).
// nextCookies lets server actions that call auth.api.* set the session cookie.
export const getAuth = () => {
  instance ??= createAuth([nextCookies()]);
  return instance;
};
