import { apply, tick } from "./billing";
import type { BillingAction, OrgBillingState } from "./billing";

// The job body: for every organization, tick and commit each action. The store decides how «commit» is atomic;
// in Postgres it is one transaction: lock the organization, claim the key, write the effect (see README).

export interface BillingStore {
  orgIds(): Promise<string[]>;
  load(orgId: string): Promise<OrgBillingState>;
  /** Claims the action's key and writes its effect in one step; 'duplicate' when the key was already claimed. */
  commit(
    orgId: string,
    action: BillingAction
  ): Promise<"applied" | "duplicate">;
}

export interface RunReport {
  orgs: number;
  applied: BillingAction[];
  duplicates: number;
  failed: { orgId: string; error: unknown }[];
}

/** One failing organization does not stop the others; it is retried on the next run (every action is idempotent). */
export const runBilling = async (
  store: BillingStore,
  now: Date
): Promise<RunReport> => {
  const report: RunReport = { applied: [], duplicates: 0, failed: [], orgs: 0 };
  for (const orgId of await store.orgIds()) {
    report.orgs += 1;
    try {
      const state = await store.load(orgId);
      for (const action of tick(state, now)) {
        if ((await store.commit(orgId, action)) === "applied") {
          report.applied.push(action);
        } else {
          report.duplicates += 1;
        }
      }
    } catch (error) {
      report.failed.push({ error, orgId });
    }
  }
  return report;
};

/** In-memory store; `yieldEvery` makes concurrent runs interleave like two workers would. */
export class MemoryStore implements BillingStore {
  readonly orgs = new Map<string, OrgBillingState>();
  /** Keys claimed; the unique index of `billing_actions`. */
  readonly keys = new Set<string>();
  fail: ((a: BillingAction) => boolean) | null = null;

  constructor(states: OrgBillingState[]) {
    for (const s of states) {
      this.orgs.set(s.orgId, s);
    }
  }

  async orgIds() {
    await Promise.resolve();
    return [...this.orgs.keys()];
  }

  async load(orgId: string) {
    await Promise.resolve();
    const s = this.orgs.get(orgId);
    if (!s) {
      throw new Error(`no org ${orgId}`);
    }
    return { ...s, applied: new Set(this.keys) };
  }

  async commit(orgId: string, action: BillingAction) {
    await Promise.resolve();
    if (this.fail?.(action)) {
      throw new Error("boom");
    }
    if (this.keys.has(action.key)) {
      return "duplicate" as const;
    }
    const s = this.orgs.get(orgId);
    if (!s) {
      throw new Error(`no org ${orgId}`);
    }
    this.keys.add(action.key);
    this.orgs.set(orgId, apply(s, action));
    return "applied" as const;
  }
}
