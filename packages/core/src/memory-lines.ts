import type { MemoryRecordView } from "@metobe/contracts/memory";

import type { MemoryEntity, MemoryRecord } from "./memory";

// A record as the model reads it: its kind in a person's words, its text, what goes with it (who owes whom, the days).
// Shared by what the chat is given (`memory-read`) and what a card's account is written from (`memory-summary`).

/** A day in a zone, `2026-11-09`; null — none. */
export const day = (d: Date | string | null, timeZone: string) =>
  d
    ? new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone,
        year: "numeric",
      }).format(new Date(d))
    : null;

/**
 * A record's kind as the model reads it. The words it reads are the words it answers in: «commitment» and «fact» came
 * back to the user as «обязательство» and «запись» (`apps/cli/dev/memory-voice-check.ts`), so the block names things
 * the way a person would.
 */
const SAID_AS: Record<MemoryRecord["kind"], string> = {
  assessment: "the user's view",
  commitment: "promise",
  event: "happened",
  fact: "known",
  rule: "rule",
};

/** A record as the model reads it: its text and what goes with it, compact. */
export const lineOf = (
  r: MemoryRecord | MemoryRecordView,
  names: Map<string, Pick<MemoryEntity, "kind" | "name">>,
  timeZone: string
) => {
  const ids = r.entities.map((e) => ("entityId" in e ? e.entityId : e.id));
  const who = (role: string) => {
    const at = r.entities.findIndex((e) => e.role === role);
    const entity = at === -1 ? undefined : names.get(ids[at] ?? "");
    if (!entity) {
      return null;
    }
    return entity.kind === "self" ? "the user" : entity.name;
  };
  const notes = [
    r.kind === "commitment" &&
      `by ${who("debtor") ?? "?"} to ${who("creditor") ?? "?"}`,
    r.status && r.status !== "open" && r.status,
    r.important && "important",
    r.dueAt && `due ${day(r.dueAt, timeZone)}`,
    r.givenAt && `given ${day(r.givenAt, timeZone)}`,
    r.occurredAt &&
      `on ${day(r.occurredAt, timeZone)}${r.occurredPrecision && r.occurredPrecision !== "day" ? ` (${r.occurredPrecision})` : ""}`,
    r.validFrom && `since ${day(r.validFrom, timeZone)}`,
    r.validTo && `until ${day(r.validTo, timeZone)}`,
    "supersededAt" in r && r.supersededAt && "replaced by a later message",
  ].filter(Boolean);
  return `${SAID_AS[r.kind]}: «${r.text}»${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`;
};
