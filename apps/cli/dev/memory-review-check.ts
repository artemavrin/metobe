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
import { localMidnight } from "@metobe/core/memory-extract";
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
    remind: now + 2 * DAY - 3_600_000,
    text: "Прислать смету на склад",
    to: selfId,
  },
  {
    by: selfId,
    days: 3,
    due: now + 5 * DAY,
    remind: now + 3 * 3_600_000,
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
    remindAt: s.remind ? new Date(s.remind) : undefined,
    text: s.text,
  });
}
const code = await createAuth().api.createVerificationOTP({
  body: { email, type: "sign-in" },
});
// A birthday two days ahead (born thirty years ago), and a weekly day — for «Не упустить» to show.
const dayKeyOf = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
    year: "numeric",
  }).format(new Date(ms));
const ahead = dayKeyOf(now + 2 * DAY);
const born = `${Number(ahead.slice(0, 4)) - 30}${ahead.slice(4)}`;
await addRecord(id, {
  entities: [{ entityId: olga.id, role: "subject" }],
  kind: "rule",
  occurred: {
    at: localMidnight(born, "Europe/Moscow") as Date,
    precision: "day",
  },
  rule: { days: 0, kind: "date", repeat: "year", workingDays: false },
  text: "У Ольги Ли день рождения",
});
// A second card of the same person under a short name, with a promise: «Один человек?» and «Объединить с…».
const olya = await createEntity(id, {
  aliases: [],
  kind: "person",
  name: "Ольга",
});
await addRecord(id, {
  entities: [
    { entityId: olya.id, role: "debtor" },
    { entityId: selfId, role: "creditor" },
  ],
  givenAt: new Date(now - 3 * DAY),
  kind: "commitment",
  text: "Прислать счёт",
});
// Done promises with a deadline, for «Надёжность»: two kept in time, two a few days late (done now).
for (const [text, days] of [
  ["Прислать смету", 2],
  ["Прислать спецификацию", 4],
  ["Согласовать макет", -3],
  ["Подписать акт", -5],
] as const) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- four rows, once
  await addRecord(id, {
    dueAt: new Date(now + days * DAY),
    entities: [
      { entityId: olga.id, role: "debtor" },
      { entityId: selfId, role: "creditor" },
    ],
    givenAt: new Date(now - 10 * DAY),
    kind: "commitment",
    status: "done",
    text,
  });
}
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
