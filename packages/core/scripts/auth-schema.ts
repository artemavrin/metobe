// Entry point for the Better Auth CLI (`auth generate`): produces packages/db/src/schema/auth.ts.
import { createDb } from "@metobe/db/client";
import { betterAuth } from "better-auth";

import { buildAuthOptions } from "../src/auth-options";

export const auth = betterAuth(
  buildAuthOptions({
    db: createDb(process.env.DATABASE_URL ?? "postgres://localhost/metobe").db,
    sendSignInCode: () => Promise.resolve(),
  })
);
