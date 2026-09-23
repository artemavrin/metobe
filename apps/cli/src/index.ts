import { getEnv } from "@purr/core/env";
import { runMigrations } from "@purr/db/migrate";

const commands: Record<string, () => Promise<void>> = {
  migrate: async () => {
    await runMigrations(getEnv().DATABASE_URL, process.env.MIGRATIONS_DIR);
    console.log("migrations applied");
  },
};

const name = process.argv[2] ?? "";
const command = commands[name];

if (!command) {
  console.error(
    `unknown command "${name}". Available: ${Object.keys(commands).join(", ")}`
  );
  process.exit(1);
}

try {
  await command();
} catch (error) {
  console.error(error);
  process.exit(1);
}
