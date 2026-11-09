import type { MemoryRecord } from "./memory";

// Groups (ARCH §19): «моя команда», «отдел продаж», «подрядчики» — a card of kind `group`. Who is in one is not kept on
// the card: it is a fact linking a person (`about`) to the group (`group`) — «Павел Орлов — в моей команде». Live
// facts only: a deleted one, a replaced one or one ended («ушёл из команды» sets `valid_to`) no longer counts. Free of
// the DB, so «Не упустить», the writer and the «Память» page read the same thing.

/** Who is in each group now, by the group's card id. */
export const groupMembers = (facts: MemoryRecord[], now = new Date()) => {
  const members = new Map<string, Set<string>>();
  for (const f of facts) {
    if (
      f.kind !== "fact" ||
      f.deletedAt ||
      f.supersededAt ||
      (f.validTo && f.validTo <= now)
    ) {
      continue;
    }
    const groups = f.entities.filter((e) => e.role === "group");
    const people = f.entities.filter((e) => e.role === "about");
    for (const g of groups) {
      const set = members.get(g.entityId) ?? new Set<string>();
      for (const p of people) {
        set.add(p.entityId);
      }
      members.set(g.entityId, set);
    }
  }
  return members;
};

/** The facts that put this person in this group — what «ушёл из команды» ends. */
export const membershipFacts = (
  facts: MemoryRecord[],
  personId: string,
  groupId: string,
  now = new Date()
) =>
  facts.filter(
    (f) =>
      f.kind === "fact" &&
      !f.deletedAt &&
      !f.supersededAt &&
      !(f.validTo && f.validTo <= now) &&
      f.entities.some((e) => e.role === "group" && e.entityId === groupId) &&
      f.entities.some((e) => e.role === "about" && e.entityId === personId)
  );
