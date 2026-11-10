// Development only (ARCH §19.8.3): how long opening a big memory takes. The writer opens all of a person's memory for
// every message and picks the candidates in the process; past 50 ms a cache per person is worth it. Makes a throwaway
// user in the dev database with 300 cards and 5 000 records, times `listEntities`, `listRecords` and the pick, and
// removes the user at the end. No model is called.
//
//   pnpm --filter @metobe/cli exec tsx --conditions=react-server --env-file=../../.env dev/memory-decrypt-bench.ts

import { getDb } from "@metobe/core/db";
import {
  addRecord,
  createEntity,
  listEntities,
  listRecords,
} from "@metobe/core/memory";
import {
  candidateCards,
  candidateCommitments,
} from "@metobe/core/memory-candidates";
import { user } from "@metobe/db/schema/auth";

const CARDS = 300;
const RECORDS = 5000;
const ROUNDS = 5;
const KINDS = ["fact", "event", "commitment", "fact", "event"] as const;

const { db, sql } = getDb();
const ownerId = `bench-${crypto.randomUUID().slice(0, 8)}`;
await db.insert(user).values({
  email: `${ownerId}@example.test`,
  id: ownerId,
  name: "Замер памяти",
  timeZone: "Europe/Moscow",
});

const time = async <T>(what: () => Promise<T>) => {
  const started = performance.now();
  const value = await what();
  return { ms: performance.now() - started, value };
};

try {
  const filled = performance.now();
  const ids: string[] = [];
  for (let i = 0; i < CARDS; i += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one by one, as the memory grows
    const card = await createEntity(ownerId, {
      kind: "person",
      name: `Сотрудник ${i} Фамилия${i}`,
      role: `менеджер в компании ${i % 40}`,
    });
    ids.push(card.id);
  }
  const batch = 50;
  for (let i = 0; i < RECORDS; i += batch) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- fifty at a time, not to drown the pool
    await Promise.all(
      Array.from({ length: Math.min(batch, RECORDS - i) }, (_, j) => {
        const n = i + j;
        const kind = KINDS[n % KINDS.length] ?? "fact";
        const who = ids[(n * 7) % CARDS] as string;
        return addRecord(ownerId, {
          entities:
            kind === "commitment"
              ? [
                  { entityId: who, role: "debtor" },
                  {
                    entityId: ids[(n * 11) % CARDS] as string,
                    role: "creditor",
                  },
                ]
              : [{ entityId: who, role: "about" }],
          kind,
          occurred:
            kind === "event"
              ? { at: new Date(Date.now() - n * 3_600_000), precision: "day" }
              : undefined,
          text: `Запись ${n}: обсудили поставку, договорились о сроках и цене, ${"подробности ".repeat(n % 6)}`,
        });
      })
    );
  }
  console.log(
    `filled: ${CARDS} cards, ${RECORDS} records in ${Math.round((performance.now() - filled) / 1000)} s`
  );

  const rows: { entities: number; pick: number; records: number }[] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- rounds one after another, to time each
    const entities = await time(() => listEntities(ownerId));
    // oxlint-disable-next-line eslint/no-await-in-loop -- rounds one after another, to time each
    const records = await time(() => listRecords(ownerId));
    const started = performance.now();
    const text = "Сотрудник 12 обещал прислать смету по поставке";
    const cards = candidateCards({
      entities: entities.value,
      records: records.value,
      text,
    });
    candidateCommitments({
      cards,
      records: records.value,
      selfId: null,
      text,
    });
    rows.push({
      entities: Math.round(entities.ms),
      pick: Math.round(performance.now() - started),
      records: Math.round(records.ms),
    });
  }
  console.log("ms per round (cards, records, pick):");
  for (const r of rows) {
    console.log(`  ${r.entities}  ${r.records}  ${r.pick}`);
  }
  const sorted = rows.map((r) => r.records).toSorted((a, b) => a - b);
  console.log(`records p50: ${sorted[Math.floor(ROUNDS / 2)]} ms`);
} finally {
  await sql`delete from "user" where id = ${ownerId}`;
  await sql.end();
}
