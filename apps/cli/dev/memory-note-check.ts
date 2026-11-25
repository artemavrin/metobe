// Development only (P22 «Записать…», ARCH §19.9.5): notes typed on a card, read by the running worker with the real
// «Память» model through the `note` source — no name in them, the card says whom they are about. Makes a throwaway
// user in the dev database and removes it at the end. Costs a few calls of the slot's model.
//
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/memory-note-check.ts

import { getDb } from "@metobe/core/db";
import { createEntity, undoWrite } from "@metobe/core/memory";
import { recordSource, writeNote } from "@metobe/core/memory-page";
import { testMember } from "@metobe/core/test-organization";
import { user } from "@metobe/db/schema/auth";

const TIME_ZONE = "Europe/Moscow";
/** A note, and what it has to become: the kind and, for a promise, who owes whom («card» — the card's person). */
const NOTES = [
  {
    kind: "commitment",
    owes: "card",
    text: "обещала прислать план работ к пятнице",
  },
  {
    kind: "commitment",
    owes: "self",
    text: "я обещал согласовать ей отпуск на январь",
  },
  { kind: "event", text: "вчера виделись, обсудили сроки портала" },
  { kind: "fact", text: "предпочитает короткие сообщения, не звонки" },
] as const;

const { db, sql } = getDb();
const ownerId = `note-check-${crypto.randomUUID().slice(0, 8)}`;
const member = await testMember(db);
await db.insert(user).values({
  ...member,
  email: `${ownerId}@example.test`,
  id: ownerId,
  name: "Проверка заметок",
  timeZone: TIME_ZONE,
});
try {
  const card = await createEntity(ownerId, {
    aliases: [],
    kind: "person",
    name: "Ирина Белова",
    role: "заместитель",
  });
  let ok = true;
  // One at a time, as a person types them.
  for (const note of NOTES) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one note after another, as typed
    const result = await writeNote(ownerId, card.id, note.text, TIME_ZONE);
    const [first] = result?.records ?? [];
    const debtor = first?.entities.find((e) => e.role === "debtor");
    const right =
      result?.status === "done" &&
      first?.kind === note.kind &&
      first.entities.some((e) => e.id === card.id) &&
      (!("owes" in note) ||
        (note.owes === "card"
          ? debtor?.id === card.id
          : debtor?.kind === "self"));
    ok &&= right;
    console.log(
      `${right ? "✓" : "✗"} «${note.text}» → ${result?.status} ${first?.kind ?? ""} «${first?.text ?? ""}» ${debtor ? `debtor ${debtor.name}` : ""}`
    );
    if (first) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one note after another, as typed
      const source = await recordSource(ownerId, first.id);
      const shown = source?.note && source.said === note.text;
      ok &&= Boolean(shown);
      console.log(`  «Откуда»: ${shown ? "the note" : JSON.stringify(source)}`);
    }
  }
  // «Отменить» takes the last note's records back.
  const last = await writeNote(
    ownerId,
    card.id,
    "сын пошёл в первый класс",
    TIME_ZONE
  );
  const undone = last?.writeId ? await undoWrite(ownerId, last.writeId) : false;
  ok &&= Boolean(undone);
  console.log(`undo: ${undone ? "✓" : "✗"}`);
  console.log(ok ? "OK" : "FAIL");
  process.exitCode = ok ? 0 : 1;
} finally {
  await sql`delete from "user" where id = ${ownerId}`;
  await sql.end();
  // The queue's Redis connection keeps the process alive.
  process.exit();
}
