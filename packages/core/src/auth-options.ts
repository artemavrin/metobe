import type { Db } from "@metobe/db/client";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";

const CODE_TTL_SECONDS = 10 * 60;
const DAY_SECONDS = 24 * 60 * 60;

type SendCode = (email: string, code: string) => Promise<void>;
/** A code for changing the email: to the current address first, then to the new one. */
type SendAccountCode = (
  email: string,
  code: string,
  step: "current" | "new",
  /** The request that asked for it: its language is the letter's when the profile has none. */
  request?: Headers | null
) => Promise<void>;

// Kept free of `server-only` so the Better Auth CLI can load it to generate the schema.
// Passwordless: email OTP only. Accounts come from the claim link and invitations, which write them directly, and from a
// first sign-in by the code — only for an address `canSignUp` allows (the admin's domains): every other way to make an
// account through Better Auth is refused in the hook, however the request got there.
export const buildAuthOptions = ({
  canSignIn,
  canSignUp,
  db,
  plugins = [],
  sendSignInCode,
  sendAccountCode,
}: {
  /** Whether this account may have a session: the one way in for everything, a code or a link alike. */
  canSignIn: (userId: string) => Promise<boolean>;
  canSignUp: (email: string) => Promise<boolean>;
  db: Db;
  plugins?: BetterAuthPlugin[];
  sendSignInCode: SendCode;
  sendAccountCode: SendAccountCode;
}) =>
  ({
    // Ids as the users made by the claim and by invitations have them: the people's pages take a UUID.
    advanced: { database: { generateId: () => crypto.randomUUID() } },
    database: drizzleAdapter(db, { provider: "pg" }),
    databaseHooks: {
      session: {
        create: {
          before: async (created) =>
            (await canSignIn(created.userId)) ? { data: created } : false,
        },
      },
      user: {
        create: {
          before: async (created) =>
            (await canSignUp(created.email)) ? { data: created } : false,
        },
      },
    },
    plugins: [
      emailOTP({
        allowedAttempts: 5,
        // Changing the email takes a code from the current address and one from the new: the mailbox is the account.
        changeEmail: { enabled: true, verifyCurrentEmail: true },
        expiresIn: CODE_TTL_SECONDS,
        sendVerificationOTP: async ({ email, otp, type }, ctx) => {
          if (type === "sign-in") {
            await sendSignInCode(email, otp);
          } else if (type === "email-verification") {
            await sendAccountCode(email, otp, "current", ctx?.headers);
          } else if (type === "change-email") {
            await sendAccountCode(email, otp, "new", ctx?.headers);
          }
        },
        storeOTP: "hashed",
      }),
      ...plugins,
    ],
    session: {
      expiresIn: 30 * DAY_SECONDS,
      // No «fresh session» rule: it would turn the device list and the email change away for anyone who signed in
      // more than a day ago — nearly everyone, on a 30-day session. What guards the account is the email change
      // itself, which takes a code from the current mailbox (`verifyCurrentEmail`); a stolen cookie gets no further.
      freshAge: 0,
      updateAge: DAY_SECONDS,
    },
    user: {
      additionalFields: {
        // Regional preferences (D31). Null means «automatic»: the language and zone of the browser.
        dateFormat: { input: false, required: false, type: "string" },
        // The user's own notes for the model, told to it in every chat; and the key that sends a message.
        instructions: { input: false, required: false, type: "string" },
        locale: { input: false, required: false, type: "string" },
        role: {
          defaultValue: "user",
          input: false,
          required: true,
          type: "string",
        },
        sendKey: { input: false, required: false, type: "string" },
        timeZone: { input: false, required: false, type: "string" },
        weekStart: { input: false, required: false, type: "number" },
      },
    },
  }) satisfies BetterAuthOptions;
