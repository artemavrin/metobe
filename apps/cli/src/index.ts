import { createAuth } from "@metobe/core/auth";
import { issueClaimLink } from "@metobe/core/claim";
import { getEnv } from "@metobe/core/env";
import { buildLoginLink } from "@metobe/core/login-link";
import { findUserByEmail } from "@metobe/core/users";
import { runMigrations } from "@metobe/db/migrate";
import { getTranslator, localeFromEnv } from "@metobe/i18n/translator";

// Admin-facing output follows the container's LANG; English when it is unset.
const t = await getTranslator(localeFromEnv(process.env.LANG));

const commands: Record<string, (args: string[]) => Promise<void>> = {
  "claim-link": async () => {
    const link = await issueClaimLink();
    console.log(
      link ? `\n  ${t("cli.claimLink", { link })}\n` : t("cli.claimed")
    );
  },
  "login-link": async ([email]) => {
    if (!email) {
      throw new Error("usage: login-link <email>");
    }
    if (!(await findUserByEmail(email))) {
      throw new Error(t("cli.noUser", { email }));
    }
    const code = await createAuth().api.createVerificationOTP({
      body: { email, type: "sign-in" },
    });
    console.log(
      `\n  ${t("cli.loginLink", { email, link: buildLoginLink(email, code) })}\n`
    );
  },
  migrate: async () => {
    await runMigrations(getEnv().DATABASE_URL, process.env.MIGRATIONS_DIR);
    console.log("migrations applied");
  },
};

const [name = "", ...args] = process.argv.slice(2);
const command = commands[name];

if (!command) {
  console.error(
    `unknown command "${name}". Available: ${Object.keys(commands).join(", ")}`
  );
  process.exit(1);
}

try {
  await command(args);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
