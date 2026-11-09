// What the memory keeps (ARCH §19, D39). Words only here: the columns the plan queries stay in the clear, the texts
// are sealed (core/memory-crypto).

/** `self` is the person themselves — one per owner; without it «who owes whom» has no one to point at. */
export const memoryEntityKinds = ["self", "person", "org", "project"] as const;
export type MemoryEntityKind = (typeof memoryEntityKinds)[number];

/** A fact, an assessment («often misses deadlines»), an event, a commitment and a rule are different things (D39). */
export const memoryRecordKinds = [
  "fact",
  "assessment",
  "event",
  "commitment",
  "rule",
] as const;
export type MemoryRecordKind = (typeof memoryRecordKinds)[number];

/** How exactly the time of an event is known; no precision — not known at all (`recorded_at` is its upper bound). */
export const memoryPrecisions = ["day", "week", "month", "year"] as const;
export type MemoryPrecision = (typeof memoryPrecisions)[number];

export const memoryStatuses = ["open", "done"] as const;
export type MemoryStatus = (typeof memoryStatuses)[number];

/** How an entity takes part in a record. */
export const memoryRoles = [
  "about",
  "participant",
  "debtor",
  "creditor",
  "subject",
] as const;
export type MemoryRole = (typeof memoryRoles)[number];

export const memoryWriteStatuses = [
  "queued",
  "skipped",
  "done",
  "failed",
  "undone",
] as const;
export type MemoryWriteStatus = (typeof memoryWriteStatuses)[number];
