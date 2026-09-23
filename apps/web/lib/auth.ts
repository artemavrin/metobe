import "server-only";
import { createAuth } from "@purr/core/auth";
import { nextCookies } from "better-auth/next-js";

// nextCookies lets server actions that call auth.api.* set the session cookie.
export const auth = createAuth([nextCookies()]);
