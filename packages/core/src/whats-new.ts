import "server-only";
import { user } from "@metobe/db/schema/auth";
import { eq } from "drizzle-orm";

import { getDb } from "./db";
import { APP_VERSION } from "./version";
import { latestNote, noteToShow } from "./whats-new-notes";
import type { ReleaseNote } from "./whats-new-notes";

// The person's «Что нового»: the window to open after an update, and what the account menu offers to read again.
// A first visit marks the running version as seen — a new account has nothing to catch up on.

export interface WhatsNew {
  /** Open by itself now: the version updated past what this person has seen. */
  show: ReleaseNote | null;
  /** «Что нового» in the account menu: the newest notes of this build. */
  latest: ReleaseNote | null;
}

export const getWhatsNew = async (userId: string): Promise<WhatsNew> => {
  const { db } = getDb();
  const [row] = await db
    .select({ off: user.whatsNewOff, seen: user.whatsNewSeen })
    .from(user)
    .where(eq(user.id, userId));
  if (row && row.seen === null) {
    await db
      .update(user)
      .set({ whatsNewSeen: APP_VERSION })
      .where(eq(user.id, userId));
  }
  return {
    latest: latestNote(APP_VERSION),
    show: row ? noteToShow(row, APP_VERSION) : null,
  };
};

/** The window was closed: this version is seen; `off` — «Не показывать после обновлений» was ticked. */
export const closeWhatsNew = async (
  userId: string,
  version: string,
  off: boolean
) => {
  await getDb()
    .db.update(user)
    .set({ whatsNewOff: off, whatsNewSeen: version })
    .where(eq(user.id, userId));
};
