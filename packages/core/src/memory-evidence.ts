import type { MemoryWritePlan } from "./memory";

// What words may change, by who says them (И1, MEMORY-PLAN §5.2) — one table for every source, kept by the code on
// the writer's plan, so a slip of the model does not get written:
//
//   the person's own words      — everything;
//   someone else's words (a letter, a meeting's line, a forward or paste with nothing of the person's own) — their own
//                                  promises and requests, facts about themselves; settling their commitment — only
//                                  «ждёт проверки»; no assessments and no rules: those are the person's alone;
//   the assistant's retelling   — only «ждёт проверки» (`memory-retold.ts`, a call of its own).
//
// A material where the person speaks too (a forward with their comment, a meeting they were at) is read as theirs:
// which line an item came from the model does not say. No database here.

/** Kinds only the person sets: their own judgement of someone, and their standing rules. */
const OWNER_ONLY = new Set(["assessment", "rule"]);

const allowed = (records: MemoryWritePlan["records"]) =>
  records.filter((r) => !OWNER_ONLY.has(r.kind));

/** The plan as the voices of the material allow it: nothing to take away when the person speaks. */
export const limitByVoice = (
  plan: MemoryWritePlan,
  ownerSpoke: boolean
): MemoryWritePlan => {
  if (ownerSpoke) {
    return plan;
  }
  return {
    ...plan,
    drafts: plan.drafts.flatMap((d) => {
      const records = allowed(d.records);
      return records.length > 0 ? [{ ...d, records }] : [];
    }),
    records: allowed(plan.records),
    statuses: plan.statuses.map((s) =>
      s.status === "done" ? { ...s, status: "unconfirmed" as const } : s
    ),
  };
};
