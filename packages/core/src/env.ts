import "server-only";
import { z } from "zod";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  DATABASE_URL: z.url(),
  // The bot that writes to users (D43): one for the installation. Without it there is no Telegram channel.
  TELEGRAM_BOT_TOKEN: z.string().min(20).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

// Parsed lazily so that importing core never crashes a process that does not need env.
export const getEnv = (): Env => {
  cached ??= envSchema.parse(process.env);
  return cached;
};
