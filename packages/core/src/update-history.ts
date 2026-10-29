import "server-only";
import type { UpdateRun } from "@metobe/contracts/updates";
import { user } from "@metobe/db/schema/auth";
import { updates } from "@metobe/db/schema/updates";
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "./db";

// The history of «О системе» (D35): every finished run of the updater, newest first, with who started it.

/** The run, once it ended: the updater writes it after any rollback of the base is through. */
export const recordUpdate = async (run: UpdateRun) => {
  if (run.status === "running") {
    return;
  }
  await getDb()
    .db.insert(updates)
    .values({
      backup: run.backup,
      byUserId: run.byUserId,
      error: run.error,
      finishedAt: run.finishedAt ? new Date(run.finishedAt) : new Date(),
      fromVersion: run.from,
      id: run.id,
      operation: run.operation,
      restored: run.restored,
      rollbackBackup: run.rollbackBackup,
      startedAt: new Date(run.startedAt),
      status: run.status,
      toVersion: run.to,
      trigger: run.trigger,
    });
};

export interface UpdateEntry {
  id: string;
  from: string;
  to: string;
  status: "done" | "failed";
  by: string | null;
  startedAt: string;
  finishedAt: string;
  operation: "install" | "rollback";
  trigger: "manual" | "patch" | "nightly" | "rollback";
  backupFile: string | null;
  backupSize: number | null;
  rollbackBackupFile: string | null;
}

export const listUpdates = async (limit = 20): Promise<UpdateEntry[]> => {
  const rows = await getDb()
    .db.select({
      backup: updates.backup,
      by: user.name,
      finishedAt: updates.finishedAt,
      from: updates.fromVersion,
      id: updates.id,
      operation: updates.operation,
      rollbackBackup: updates.rollbackBackup,
      startedAt: updates.startedAt,
      status: updates.status,
      to: updates.toVersion,
      trigger: updates.trigger,
    })
    .from(updates)
    .leftJoin(user, eq(user.id, updates.byUserId))
    .orderBy(desc(updates.finishedAt))
    .limit(limit);
  return rows.map((r) => ({
    backupFile: r.backup?.file ?? null,
    backupSize: r.backup?.size ?? null,
    by: r.by,
    finishedAt: r.finishedAt.toISOString(),
    from: r.from,
    id: r.id,
    operation: r.operation,
    rollbackBackupFile: r.rollbackBackup?.file ?? null,
    startedAt: r.startedAt.toISOString(),
    status: r.status,
    to: r.to,
    trigger: r.trigger,
  }));
};

/** Only the most recent successful install can be rolled back, and only while its target is still running. */
export const getRollbackCandidate = async (id: string, current: string) => {
  const [candidate] = await getDb()
    .db.select({
      backup: updates.backup,
      from: updates.fromVersion,
      id: updates.id,
      operation: updates.operation,
      status: updates.status,
      to: updates.toVersion,
    })
    .from(updates)
    .where(eq(updates.id, id))
    .limit(1);
  const [latest] = await getDb()
    .db.select({ id: updates.id, to: updates.toVersion })
    .from(updates)
    .where(and(eq(updates.status, "done"), eq(updates.operation, "install")))
    .orderBy(desc(updates.finishedAt))
    .limit(1);
  if (
    !candidate ||
    !latest ||
    candidate.id !== latest.id ||
    candidate.status !== "done" ||
    candidate.operation !== "install" ||
    candidate.to !== current ||
    !candidate.backup
  ) {
    return null;
  }
  return {
    backup: candidate.backup,
    from: candidate.from,
    id: candidate.id,
    to: candidate.to,
  };
};
