// Development only (ARCH §19.9.3): a memory with a meeting, a fact and a promise, and three messages that move the
// meeting, change the fact and move the promise's deadline — read by the running worker with the real «Память» and
// «Решения» models. Checks that the new records take the place of the old, as the decision model says. Makes a
// throwaway user in the dev database and removes it at the end. Costs a few calls of the two slots' models.
//
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/memory-update-check.ts

import { setTimeout as sleep } from "node:timers/promises";

import { getDb } from "@metobe/core/db";
import {
  addRecord,
  createEntity,
  ensureSelf,
  listRecords,
} from "@metobe/core/memory";
import { queueMemoryWrite } from "@metobe/core/memory-queue";
import { testMember } from "@metobe/core/test-organization";
import { user } from "@metobe/db/schema/auth";
import { chats, messages } from "@metobe/db/schema/chat";

const TIME_ZONE = "Europe/Moscow";
// Days as numbers, not weekdays: the check must not depend on the day it is run.
const day = (d: string) => new Date(`${d}T00:00:00+03:00`);
const SAID = [
  "Встречу с «Вектором» перенесли на 20 ноября.",
  "Игорь Белов теперь коммерческий директор.",
  "Смету Игорю Белову нужно прислать не к 17 ноября, а к 19 ноября.",
];

const { db, sql } = getDb();
const ownerId = `update-check-${crypto.randomUUID().slice(0, 8)}`;
const member = await testMember(db);
await db.insert(user).values({
  ...member,
  email: `${ownerId}@example.test`,
  id: ownerId,
  name: "Проверка замены",
  timeZone: TIME_ZONE,
});
try {
  const self = await ensureSelf(ownerId, "Проверка замены");
  const vector = await createEntity(ownerId, {
    kind: "org",
    name: "ООО «Вектор»",
    role: "поставщик оборудования",
  });
  const igor = await createEntity(ownerId, {
    kind: "person",
    name: "Игорь Белов",
    role: "руководитель отдела продаж",
  });
  const meeting = await addRecord(ownerId, {
    entities: [{ entityId: vector.id, role: "participant" }],
    kind: "event",
    occurred: { at: day("2026-11-18"), precision: "day" },
    text: "Встреча с ООО «Вектор» 18 ноября",
  });
  const role = await addRecord(ownerId, {
    entities: [{ entityId: igor.id, role: "about" }],
    kind: "fact",
    text: "Игорь Белов — руководитель отдела продаж",
    validFrom: day("2025-01-15"),
  });
  const promise = await addRecord(ownerId, {
    dueAt: day("2026-11-17"),
    entities: [
      { entityId: self.id, role: "debtor" },
      { entityId: igor.id, role: "creditor" },
    ],
    givenAt: day("2026-11-09"),
    kind: "commitment",
    text: "Прислать смету Игорю Белову к 17 ноября",
  });

  const [chat] = await db
    .insert(chats)
    .values({ title: "Проверка замены", userId: ownerId })
    .returning({ id: chats.id });
  const chatId = chat?.id as string;
  const start = Date.now() - 10 * 60_000;
  const ids = SAID.map(() => crypto.randomUUID());
  await db.insert(messages).values(
    SAID.flatMap((text, i) => [
      {
        chatId,
        createdAt: new Date(start + i * 120_000),
        id: ids[i] as string,
        parts: [{ text, type: "text" as const }],
        role: "user" as const,
      },
      {
        chatId,
        createdAt: new Date(start + i * 120_000 + 30_000),
        id: crypto.randomUUID(),
        parts: [{ text: "Понятно.", type: "text" as const }],
        role: "assistant" as const,
      },
    ])
  );
  await Promise.all(
    ids.map((messageId) =>
      queueMemoryWrite({
        chatId,
        ownerId,
        source: "chat",
        sourceKey: messageId,
        timeZone: TIME_ZONE,
      })
    )
  );
  const deadline = Date.now() + 4 * 60_000;
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling the worker: one look at a time
    const rows = await sql<
      { status: string }[]
    >`select status from memory_writes where owner_id = ${ownerId}`;
    const waiting = rows.filter((r) => r.status === "queued").length;
    if (rows.length === SAID.length && waiting === 0) {
      console.log("writes:", rows.map((r) => r.status).join(", "));
      break;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `still queued after 4 min: ${waiting} of ${rows.length} — is the worker running?`
      );
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling the worker: one look at a time
    await sleep(2000);
  }
  const all = await listRecords(ownerId, { includeSuperseded: true });
  const of = (id: string) => all.find((r) => r.id === id);
  const live = all.filter((r) => !r.supersededAt);
  // A day as the person has it: the midnights are Moscow's.
  const iso = (d: Date | null | undefined) =>
    d
      ? new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d)
      : undefined;
  const newMeeting = live.find(
    (r) => r.kind === "event" && r.id !== meeting.id
  );
  const newRole = live.find((r) => r.kind === "fact" && r.id !== role.id);
  const checks = [
    [
      "meeting moved: the old one set aside, a new one on 20 November",
      Boolean(of(meeting.id)?.supersededAt) &&
        iso(newMeeting?.occurredAt) === "2026-11-20",
    ],
    [
      "fact changed: the old role ended, a new one is there",
      Boolean(of(role.id)?.validTo) && Boolean(newRole),
    ],
    [
      "deadline moved to 19 November, no second promise",
      iso(of(promise.id)?.dueAt) === "2026-11-19" &&
        all.filter((r) => r.kind === "commitment").length === 1,
    ],
  ] as const;
  const mine = new Set([meeting.id, role.id, promise.id]);
  for (const made of all.filter((r) => !mine.has(r.id))) {
    console.log(
      `new ${made.kind}: ${made.text}${made.occurredAt ? ` [${iso(made.occurredAt)}]` : ""}`
    );
  }
  console.log(
    `old: meeting ${of(meeting.id)?.supersededAt ? "set aside" : "live"}, role ${of(role.id)?.validTo ? "ended" : "holds"}, deadline ${iso(of(promise.id)?.dueAt)}`
  );
  for (const [name, ok] of checks) {
    console.log(ok ? "  ✓" : "  ✗", name);
  }
  const ok = checks.every(([, passed]) => passed);
  console.log(ok ? "OK" : "NOT ALL — see above");
  process.exitCode = ok ? 0 : 1;
} finally {
  await sql`delete from "user" where id = ${ownerId}`;
  await sql.end();
  // The queue's Redis connection keeps the process alive.
  process.exit();
}
