// Reading a person's memory queue to the end (ARCH §19.8.1), free of the database and Redis so it can be tested.
// The caller holds the person's lock; this reads the queued messages in order, one at a time.

export interface Drain<W extends { id: string }> {
  /** The earliest queued message, or null — the queue is read. */
  next: () => Promise<W | null>;
  /** Reads it: `off` — no model now, leave the rest queued. A failure is thrown. */
  read: (write: W) => Promise<"off" | "skipped" | "done">;
  /** Counts a failed read; `failed` — given up, the queue goes on without it. */
  fail: (id: string, error: string) => Promise<{ failed: boolean }>;
  /** Holds the lock longer; false — it was lost, another reader may be at the queue now. */
  hold: () => Promise<boolean>;
  /** A failure that is nobody's fault (data protection down): not counted, the queue waits and tries later. */
  waits?: (error: unknown) => boolean;
}

export type DrainEnd = "read" | "off" | "lost" | "waiting";

/**
 * Reads until the queue is empty. A failed read under its limit is thrown again: the job is retried later and that
 * message stays first, so no later one overtakes it. Given up — the queue goes on.
 */
export const drainQueue = async <W extends { id: string }>(
  drain: Drain<W>
): Promise<DrainEnd> => {
  const write = await drain.next();
  if (!write) {
    return "read";
  }
  try {
    if ((await drain.read(write)) === "off") {
      return "off";
    }
  } catch (error) {
    if (drain.waits?.(error)) {
      return "waiting";
    }
    const message = error instanceof Error ? error.message : String(error);
    const { failed } = await drain.fail(write.id, message);
    if (!failed) {
      throw error;
    }
  }
  if (!(await drain.hold())) {
    return "lost";
  }
  // One message at a time, in order: the next only after this one is in.
  return drainQueue(drain);
};
