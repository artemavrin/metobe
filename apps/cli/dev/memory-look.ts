// Development only: what the memory made of a chat's messages — the writes and the commitments with a reminder (no texts
// of the memory are printed, only the kinds, times and flags).
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/memory-look.ts <chat id>
import { getDb } from "@metobe/core/db";

const [chat] = process.argv.slice(2);
const { sql } = getDb();
const writes =
  await sql`select id, status, source, sent_at from memory_writes where chat_id = ${String(chat)} order by sent_at`;
console.log("writes:", JSON.stringify(writes));
const recs = await sql`
  select r.kind, r.status, r.due_at, r.remind_at, r.reminded_at, r.write_id
  from memory_records r where r.write_id in (select id from memory_writes where chat_id = ${String(chat)}) order by r.recorded_at`;
console.log("records:", JSON.stringify(recs));
const msgs =
  await sql`select role, parts, created_at from messages where chat_id = ${String(chat)} order by created_at limit 6`;
console.log(
  "messages:",
  JSON.stringify(
    msgs.map((m) => ({
      at: m.created_at,
      role: m.role,
      text: (m.parts as { type: string; text?: string }[])
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join(" ")
        .slice(0, 200),
    }))
  )
);
process.exit(0);
