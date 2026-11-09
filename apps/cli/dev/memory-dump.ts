// Development only (ARCH §19): prints one person's memory in the clear, to see what the silent writer put in. Not
// part of the image or the `metobe` CLI — on an installation nobody reads another's memory (D39).
//
//   pnpm --filter @metobe/cli exec tsx --conditions=react-server --env-file=../../.env dev/memory-dump.ts you@example.com

import { listEntities, listRecords } from "@metobe/core/memory";
import { findUserByEmail } from "@metobe/core/users";

const [email] = process.argv.slice(2);
if (!email) {
  console.error("usage: memory-dump.ts <email>");
  process.exit(1);
}
const person = await findUserByEmail(email);
if (!person) {
  console.error(`no user ${email}`);
  process.exit(1);
}
const entities = await listEntities(person.id);
const names = new Map(entities.map((e) => [e.id, e.name || "я"]));
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "—";

console.log(`\nКарточки (${entities.length}):`);
for (const e of entities) {
  console.log(
    `  ${e.kind.padEnd(7)} ${e.name || "(я)"}${e.role ? ` — ${e.role}` : ""}`
  );
}
const records = await listRecords(person.id, {
  includeDeleted: true,
  includeSuperseded: true,
});
console.log(`\nЗаписи (${records.length}):`);
for (const r of records) {
  const marks = [
    r.deletedAt ? "удалена" : null,
    r.supersededAt ? "заменена" : null,
    r.status,
  ].filter(Boolean);
  const when = [
    r.occurredAt ? `было ${day(r.occurredAt)} (${r.occurredPrecision})` : null,
    r.validFrom ? `с ${day(r.validFrom)}` : null,
    r.givenAt ? `дано ${day(r.givenAt)}` : null,
    r.dueAt ? `срок ${day(r.dueAt)}` : null,
  ].filter(Boolean);
  const who = r.entities
    .map((l) => `${names.get(l.entityId) ?? "?"}:${l.role}`)
    .join(", ");
  console.log(
    `  ${r.kind.padEnd(10)} ${r.text}\n             ${[...when, who, ...marks].filter(Boolean).join(" · ")}`
  );
}
process.exit(0);
