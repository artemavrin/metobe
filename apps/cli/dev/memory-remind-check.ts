// Development only (D43): a throwaway user with a reminder whose moment has just passed, for the running worker's minute
// tick to tell (the mail goes to Mailpit). `seed` makes it and prints its id; `drop <id>` removes it.
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/memory-remind-check.ts seed|drop <id>
import { getDb } from "@metobe/core/db";
import { addRecord, ensureSelf } from "@metobe/core/memory";

const [mode, given] = process.argv.slice(2);
const { sql } = getDb();
if (mode === "drop") {
  await sql`delete from "user" where id = ${String(given)}`;
  console.log("dropped", given);
  process.exit(0);
}
const id = `remind-check-${crypto.randomUUID().slice(0, 8)}`;
await sql`insert into "user" (id, name, email, locale, time_zone) values (${id}, 'Проверка напоминаний', ${`${id}@example.test`}, 'ru', 'Europe/Moscow')`;
const self = await ensureSelf(id, "Проверка напоминаний");
await addRecord(id, {
  dueAt: new Date(),
  entities: [{ entityId: self.id, role: "debtor" }],
  kind: "commitment",
  remindAt: new Date(Date.now() - 60_000),
  text: "Позвонить Ольге про договор",
});
console.log(JSON.stringify({ email: `${id}@example.test`, id }));
process.exit(0);
