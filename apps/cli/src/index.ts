import { createAuth } from "@purr/core/auth";
import { issueClaimLink } from "@purr/core/claim";
import { getEnv } from "@purr/core/env";
import { buildLoginLink } from "@purr/core/login-link";
import { findUserByEmail } from "@purr/core/users";
import { runMigrations } from "@purr/db/migrate";

const commands: Record<string, (args: string[]) => Promise<void>> = {
  "claim-link": async () => {
    const link = await issueClaimLink();
    console.log(
      link
        ? `\n  Создайте аккаунт администратора: ${link}\n  Ссылка одноразовая и действует 24 часа.\n`
        : "Администратор уже создан."
    );
  },
  "login-link": async ([email]) => {
    if (!email) {
      throw new Error("usage: login-link <email>");
    }
    if (!(await findUserByEmail(email))) {
      throw new Error(`Пользователя ${email} нет. Сначала пригласите его.`);
    }
    const code = await createAuth().api.createVerificationOTP({
      body: { email, type: "sign-in" },
    });
    console.log(
      `\n  Ссылка для входа ${email}: ${buildLoginLink(email, code)}\n  Действует 10 минут.\n`
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
