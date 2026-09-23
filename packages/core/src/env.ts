import "server-only";
import { z } from "zod";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  DATABASE_URL: z.url(),
  SMTP_FROM: z.string().default("Purr <no-reply@localhost>"),
  // Temporary until SMTP moves to admin settings (M6); unset means "email login is not configured".
  SMTP_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

// Parsed lazily so that importing core never crashes a process that does not need env.
export const getEnv = (): Env => {
  cached ??= envSchema.parse(process.env);
  return cached;
};
