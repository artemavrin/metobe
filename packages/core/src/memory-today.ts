import "server-only";
import type {
  MemorySuggestion,
  MemorySuggestionReason,
} from "@metobe/contracts/memory";

import { listDismissals, listEntities, listRecords } from "./memory";
import type { MemoryEntity, MemoryRecord } from "./memory";

// «На сегодня» on the new chat screen (ARCH §19.6, P17), first step: open commitments that need the person now —
// past their day, due today or tomorrow, said to be done by someone else, marked important. Gathered by plain reads
// when the screen opens, without a model; the words are the page's. Rules («раз в две недели») come later.

/** Days in the person's zone: `2026-11-09`. */
const dayKey = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(at);

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  );

const ORDER: Record<MemorySuggestionReason, number> = {
  important: 4,
  overdue: 0,
  today: 2,
  tomorrow: 3,
  unconfirmed: 1,
};

/** Why it is in the list today, if it is: the first that fits of past due, said done, today, tomorrow, important. */
const reasonOf = (
  r: MemoryRecord,
  days: number | null
): MemorySuggestionReason | null => {
  if (days !== null && days < 0) {
    return "overdue";
  }
  if (r.status === "unconfirmed") {
    return "unconfirmed";
  }
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "tomorrow";
  }
  return r.important ? "important" : null;
};

/** Taken away while its deadline and status were these: not again until one of them changes. */
const isDismissed = (
  r: MemoryRecord,
  gone: { dueAt: Date | null; status: string | null } | undefined
) =>
  Boolean(gone) &&
  gone?.status === r.status &&
  (gone?.dueAt?.getTime() ?? null) === (r.dueAt?.getTime() ?? null);

/** Who is on the other side: the debtor when the person is owed, the creditor when the person owes. */
const sidesOf = (r: MemoryRecord, cards: Map<string, MemoryEntity>) => {
  const card = (role: "debtor" | "creditor") =>
    cards.get(r.entities.find((e) => e.role === role)?.entityId ?? "");
  const debtor = card("debtor");
  const creditor = card("creditor");
  if (creditor?.kind === "self") {
    return { side: "theirs" as const, who: debtor };
  }
  if (debtor?.kind === "self") {
    return { side: "mine" as const, who: creditor };
  }
  return { side: "between" as const, who: debtor };
};

/** The rows, «важно» first, then past due (the longest first), said done, today, tomorrow, the rest important. */
export const todaySuggestions = async (
  ownerId: string,
  timeZone: string,
  now = new Date()
): Promise<MemorySuggestion[]> => {
  const [records, entities, dismissed] = await Promise.all([
    listRecords(ownerId, { kinds: ["commitment"] }),
    listEntities(ownerId),
    listDismissals(ownerId),
  ]);
  const cards = new Map(entities.map((e) => [e.id, e]));
  const today = dayKey(now, timeZone);
  const rows = records.flatMap((r): MemorySuggestion[] => {
    if (r.status !== "open" && r.status !== "unconfirmed") {
      return [];
    }
    if (isDismissed(r, dismissed.get(r.id))) {
      return [];
    }
    const days = r.dueAt ? daysBetween(today, dayKey(r.dueAt, timeZone)) : null;
    const reason = reasonOf(r, days);
    if (!reason) {
      return [];
    }
    const { side, who } = sidesOf(r, cards);
    return [
      {
        days: days !== null && days < 0 ? -days : 0,
        dueAt: r.dueAt?.toISOString() ?? null,
        id: r.id,
        important: r.important,
        reason,
        side,
        status: r.status,
        text: r.text,
        who:
          who && who.kind !== "self"
            ? { id: who.id, kind: who.kind, name: who.name }
            : null,
      },
    ];
  });
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own array
  return rows.sort(
    (a, b) =>
      Number(b.important) - Number(a.important) ||
      ORDER[a.reason] - ORDER[b.reason] ||
      b.days - a.days ||
      (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999")
  );
};
