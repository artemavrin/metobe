// Development only (D42, ARCH §19.9.9): cards of the person's own types, from chat messages, read by the running worker
// with the real «Память» and «Решения» models. A bus, another bus said in other words, a pet, and a thing in passing.
// A throwaway user in the dev database, removed at the end. Costs a few calls of the slot's model.
//
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/memory-things-check.ts

import { setTimeout as sleep } from "node:timers/promises";

import { getDb } from "@metobe/core/db";
import { listEntities } from "@metobe/core/memory";
import { queueMemoryWrite } from "@metobe/core/memory-queue";
import { user } from "@metobe/db/schema/auth";
import { chats, messages } from "@metobe/db/schema/chat";

const TIME_ZONE = "Europe/Moscow";
const SAID = [
  "Автобус 412 встал на ремонт до пятницы",
  "Машина 305 вернулась с ТО, завтра выходит на линию",
  "Кота Барсика в четверг везу к ветеринару",
  "Купил новый ноутбук, завтра настрою",
];

const { db, sql } = getDb();
const ownerId = `things-check-${crypto.randomUUID().slice(0, 8)}`;
await db.insert(user).values({
  email: `${ownerId}@example.test`,
  id: ownerId,
  name: "Проверка вещей",
  timeZone: TIME_ZONE,
});
try {
  const [chat] = await db
    .insert(chats)
    .values({ title: "Проверка вещей", userId: ownerId })
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
    if (
      rows.length === SAID.length &&
      rows.every((r) => r.status !== "queued")
    ) {
      console.log("writes:", rows.map((r) => r.status).join(", "));
      break;
    }
    if (Date.now() > deadline) {
      throw new Error("still queued after 4 min — is the worker running?");
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling the worker: one look at a time
    await sleep(2000);
  }
  const all = await listEntities(ownerId);
  const cards = all.filter((e) => e.kind !== "self");
  for (const c of cards) {
    console.log(`  ${c.kind}${c.type ? ` «${c.type}»` : ""}: ${c.name}`);
  }
  const things = cards.filter((c) => c.kind === "custom");
  const buses = things.filter((c) => /412|305/u.test(c.name));
  const ok =
    buses.length === 2 &&
    buses[0]?.type !== null &&
    buses[0]?.type === buses[1]?.type &&
    things.some((c) => /барсик/iu.test(c.name)) &&
    !cards.some((c) => /ноутбук/iu.test(c.name));
  console.log(
    ok ? "OK: two buses of one type, a pet, no card for the laptop" : "FAIL"
  );
  process.exitCode = ok ? 0 : 1;
} finally {
  await sql`delete from "user" where id = ${ownerId}`;
  await sql.end();
  process.exit();
}
