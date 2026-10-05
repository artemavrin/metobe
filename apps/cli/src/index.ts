import { createAuth } from "@metobe/core/auth";
import { issueClaimLink } from "@metobe/core/claim";
import { getEnv } from "@metobe/core/env";
import { buildLoginLink } from "@metobe/core/login-link";
import { importEnvMail } from "@metobe/core/mail";
import { importEnvProxy } from "@metobe/core/net";
import { ensureSecretsCanary, rotateSecrets } from "@metobe/core/secrets";
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
  // First start: SMTP_URL / SMTP_FROM from install.sh become the service's mail in /settings/mail (D15).
  "mail:import-env": async () => {
    const imported = await importEnvMail();
    if (imported) {
      console.log(
        `mail: ${imported.address} via ${imported.host} imported from the environment`
      );
    }
  },
  migrate: async () => {
    await runMigrations(getEnv().DATABASE_URL, process.env.MIGRATIONS_DIR);
    console.log("migrations applied");
  },
  // First start: HTTPS_PROXY / ALL_PROXY from install.sh becomes a proxy record bound to nothing (ARCH §18.1).
  "proxies:import-env": async () => {
    const imported = await importEnvProxy();
    if (imported) {
      console.log(
        `proxies: ${imported.type} proxy ${imported.host} imported from the environment`
      );
    }
  },
  // Run by the entrypoint before the app starts: a wrong SECRETS_KEY stops the container with a clear message.
  "secrets:check": async () => {
    const result = await ensureSecretsCanary();
    console.log(
      result === "created"
        ? "secrets: key registered for this installation"
        : "secrets: key ok"
    );
  },
  "secrets:rotate": async () => {
    const { rotated } = await rotateSecrets();
    console.log(
      `secrets: ${rotated} re-encrypted with the current key. SECRETS_KEY_PREVIOUS can now be removed.`
    );
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
