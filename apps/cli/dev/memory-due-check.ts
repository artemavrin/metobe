import { getDb } from "@metobe/core/db";
import { memoryDue, memoryStale } from "@metobe/core/memory-due";
import { memoryRecords } from "@metobe/db/schema/memory";

// Read-only check of «Сроки» and «Сверка» on the dev base: counts only, no texts.
const { db } = getDb();
const owners = await db
  .selectDistinct({ id: memoryRecords.ownerId })
  .from(memoryRecords);
const out = await Promise.all(
  owners.map(async ({ id }) => {
    const [due, stale] = await Promise.all([
      memoryDue(id, "Europe/Moscow"),
      memoryStale(id, "Europe/Moscow"),
    ]);
    return {
      days: due.days.map((d) => d.items.length).join(","),
      late: due.late.length,
      later: due.later,
      none: due.none,
      stale: stale.length,
      staleMaxQuiet: stale[0]?.quiet ?? null,
    };
  })
);
console.log(out);
process.exit(0);
