// Development only (Д2 «Сверка»): a throwaway user with four long-open promises, for a browser check of /memory/review.
// Prints the user's email and a sign-in code, waits, and removes the user on Enter-less timeout (see `HOLD_MS`).
//
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/memory-review-check.ts seed|drop <id>

import { createAuth } from "@metobe/core/auth";
import { getDb } from "@metobe/core/db";
import {
  addRecord,
  createEntity,
  ensureSelf,
  lastChanges,
  listRecords,
} from "@metobe/core/memory";
import { memoryStale } from "@metobe/core/memory-due";
import { user } from "@metobe/db/schema/auth";

const DAY = 86_400_000;
const [mode, given] = process.argv.slice(2);
const { db, sql } = getDb();

if (mode === "drop") {
  await sql`delete from "user" where id = ${String(given)}`;
  console.log("dropped", given);
  process.exit(0);
}

if (mode === "state") {
  const rows = await listRecords(String(given), { kinds: ["commitment"] });
  const stale = await memoryStale(String(given), "Europe/Moscow");
  console.log(
    JSON.stringify({
      stale: stale.map((r) => r.text),
      statuses: rows.map((r) => [
        r.text,
        r.status,
        r.dueAt?.toISOString() ?? null,
      ]),
    })
  );
  process.exit(0);
}

const id = `review-check-${crypto.randomUUID().slice(0, 8)}`;
const email = `${id}@example.test`;
await db
  .insert(user)
  .values({ email, id, name: "Проверка сверки", timeZone: "Europe/Moscow" });
const self = await ensureSelf(id, "Проверка сверки");
const olga = await createEntity(id, {
  aliases: [],
  kind: "person",
  name: "Ольга Ли",
  role: "юрист",
});
const selfId = self.id;
const now = Date.now();
const seeds = [
  {
    by: olga.id,
    days: 5,
    due: now + 2 * DAY,
    text: "Прислать смету на склад",
    to: selfId,
  },
  {
    by: selfId,
    days: 3,
    due: now + 5 * DAY,
    text: "Подготовить отчёт по закупкам",
    to: olga.id,
  },
  {
    by: olga.id,
    days: 2,
    due: now + 9 * DAY,
    text: "Согласовать график дежурств",
    to: selfId,
  },
  {
    by: selfId,
    days: 1,
    due: now + 9 * DAY,
    text: "Выслать акт сверки",
    to: olga.id,
  },
  {
    by: olga.id,
    days: 52,
    due: now - 44 * DAY,
    text: "Прислать договор на проверку",
    to: selfId,
  },
  {
    by: selfId,
    days: 47,
    due: null,
    text: "Согласовать отпуск на январь",
    to: olga.id,
  },
  {
    by: olga.id,
    days: 41,
    due: null,
    text: "Передать доступы к складской системе",
    to: selfId,
  },
  {
    by: selfId,
    days: 35,
    due: now - 3 * DAY,
    text: "Ответить на письмо о поставке",
    to: olga.id,
  },
];
for (const s of seeds) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- four rows, once
  await addRecord(id, {
    dueAt: s.due ? new Date(s.due) : undefined,
    entities: [
      { entityId: s.by, role: "debtor" },
      { entityId: s.to, role: "creditor" },
    ],
    givenAt: new Date(now - s.days * DAY),
    kind: "commitment",
    text: s.text,
  });
}
const code = await createAuth().api.createVerificationOTP({
  body: { email, type: "sign-in" },
});
const changes = await lastChanges(id);
const records = await listRecords(id);
console.log(
  JSON.stringify({
    changes: changes.size,
    code,
    email,
    id,
    records: records.length,
  })
);
process.exit(0);
