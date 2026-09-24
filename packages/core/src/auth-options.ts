import type { Db } from "@metobe/db/client";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";

const CODE_TTL_SECONDS = 10 * 60;
const DAY_SECONDS = 24 * 60 * 60;

type SendCode = (email: string, code: string) => Promise<void>;

// Kept free of `server-only` so the Better Auth CLI can load it to generate the schema.
// Passwordless: email OTP only. Public sign-up is closed; users come from claim or invites.
export const buildAuthOptions = ({
  db,
  plugins = [],
  sendSignInCode,
}: {
  db: Db;
  plugins?: BetterAuthPlugin[];
  sendSignInCode: SendCode;
}) =>
  ({
    database: drizzleAdapter(db, { provider: "pg" }),
    plugins: [
      emailOTP({
        allowedAttempts: 5,
        disableSignUp: true,
        expiresIn: CODE_TTL_SECONDS,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type === "sign-in") {
            await sendSignInCode(email, otp);
          }
        },
        storeOTP: "hashed",
      }),
      ...plugins,
    ],
    session: { expiresIn: 30 * DAY_SECONDS, updateAge: DAY_SECONDS },
    user: {
      additionalFields: {
        role: {
          defaultValue: "user",
          input: false,
          required: true,
          type: "string",
        },
      },
    },
  }) satisfies BetterAuthOptions;
