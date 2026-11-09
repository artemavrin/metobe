// Development only (ARCH §19.8.1): three messages in a row from one person, queued at once, read by the running
// worker with the real «Память» model. Before the queue they raced: two «Павел» cards and a promise left open. Makes a
// throwaway user in the dev database and removes it at the end. Costs a few calls of the slot's model.
//
//   pnpm --filter @metobe/cli exec tsx --conditions=react-server --env-file=../../.env dev/memory-queue-check.ts

import { setTimeout as sleep } from "node:timers/promises";

import { getDb } from "@metobe/core/db";
import { listEntities, listRecords } from "@metobe/core/memory";
import { queueMemoryWrite } from "@metobe/core/memory-queue";
import { user } from "@metobe/db/schema/auth";
import { chats, messages } from "@metobe/db/schema/chat";

const TIME_ZONE = "Europe/Moscow";
const SAID = [
  "Созвонился с Павлом Гуровым из ООО «Вектор», обсудили поставку оборудования.",
  "Павел обещал прислать прайс к пятнице.",
  "Он уже прислал прайс, всё в порядке.",
];

const { db, sql } = getDb();
const ownerId = `queue-check-${crypto.randomUUID().slice(0, 8)}`;
await db.insert(user).values({
  email: `${ownerId}@example.test`,
  id: ownerId,
  name: "Проверка очереди",
  timeZone: TIME_ZONE,
});
try {
  const [chat] = await db
    .insert(chats)
    .values({ title: "Проверка очереди", userId: ownerId })
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
  // All three at once, as a chat with three quick answers would queue them.
  await Promise.all(
    ids.map((messageId) =>
      queueMemoryWrite({ chatId, messageId, ownerId, timeZone: TIME_ZONE })
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
  const entities = await listEntities(ownerId);
  const people = entities.filter((e) => e.kind === "person");
  console.log(
    "cards:",
    entities.map((e) => `${e.kind} ${e.name || "(я)"}`).join("; ")
  );
  const promises = await listRecords(ownerId, { kinds: ["commitment"] });
  console.log(
    "commitments:",
    promises.map((r) => `${r.text} — ${r.status}`).join("; ") || "—"
  );
  const pavel = people.filter((e) => e.name.includes("Павел"));
  const ok =
    pavel.length === 1 &&
    promises.length === 1 &&
    promises[0]?.status === "done";
  console.log(ok ? "OK: one Павел, the promise settled" : "FAIL");
  process.exitCode = ok ? 0 : 1;
} finally {
  await sql`delete from "user" where id = ${ownerId}`;
  await sql.end();
  // The queue's Redis connection keeps the process alive.
  process.exit();
}
