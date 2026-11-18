import { describe, expect, it } from "vitest";

import { drainQueue } from "./memory-drain";
import type { Drain } from "./memory-drain";

// ARCH §19.8.1: a person's queue is read in order, one message at a time; a failed one stays first.

interface Row {
  id: string;
  status: "queued" | "done" | "failed";
  attempts: number;
}

/** A queue in memory, with a reader that fails the messages it is told to, as often as it is told to. */
const queueOf = (ids: string[], failing: Record<string, number> = {}) => {
  const rows: Row[] = ids.map((id) => ({ attempts: 0, id, status: "queued" }));
  const read: string[] = [];
  const drain: Drain<Row> = {
    fail: (id) => {
      const row = rows.find((r) => r.id === id) as Row;
      row.attempts += 1;
      if (row.attempts >= 3) {
        row.status = "failed";
      }
      return Promise.resolve({ failed: row.status === "failed" });
    },
    hold: () => Promise.resolve(true),
    next: () =>
      Promise.resolve(rows.find((r) => r.status === "queued") ?? null),
    read: (row) => {
      read.push(row.id);
      if ((failing[row.id] ?? 0) > 0) {
        failing[row.id] = (failing[row.id] ?? 0) - 1;
        return Promise.reject(new Error(`model timed out on ${row.id}`));
      }
      row.status = "done";
      return Promise.resolve("done");
    },
  };
  return { drain, read, rows };
};

/** Here the reader's failure stands for data protection being down. */
const waits = (error: unknown) =>
  error instanceof Error && error.message.startsWith("model timed out");

describe("reading a person's memory queue (ARCH §19.8.1)", () => {
  it("reads every queued message in order, once", async () => {
    const { drain, read, rows } = queueOf(["m1", "m2", "m3"]);
    await expect(drainQueue(drain)).resolves.toBe("read");
    expect(read).toEqual(["m1", "m2", "m3"]);
    expect(rows.every((r) => r.status === "done")).toBe(true);
  });

  it("waits when data protection is down: the message stays first and loses no attempt", async () => {
    const { drain, read, rows } = queueOf(["m1", "m2"], { m1: 1 });
    await expect(drainQueue({ ...drain, waits })).resolves.toBe("waiting");
    expect(rows[0]).toMatchObject({ attempts: 0, status: "queued" });
    await expect(drainQueue({ ...drain, waits })).resolves.toBe("read");
    expect(read).toEqual(["m1", "m1", "m2"]);
  });

  it("throws on a failed read and keeps that message first for the next try", async () => {
    const { drain, read } = queueOf(["m1", "m2"], { m1: 1 });
    await expect(drainQueue(drain)).rejects.toThrow("m1");
    // m2 was not read ahead of m1.
    expect(read).toEqual(["m1"]);
    // The retried job reads m1 first, then m2.
    await expect(drainQueue(drain)).resolves.toBe("read");
    expect(read).toEqual(["m1", "m1", "m2"]);
  });

  it("gives a message up after three failed reads and goes on", async () => {
    const { drain, read, rows } = queueOf(["m1", "m2"], { m1: 5 });
    await expect(drainQueue(drain)).rejects.toThrow();
    await expect(drainQueue(drain)).rejects.toThrow();
    await expect(drainQueue(drain)).resolves.toBe("read");
    expect(read).toEqual(["m1", "m1", "m1", "m2"]);
    expect(rows.map((r) => r.status)).toEqual(["failed", "done"]);
  });

  it("stops with the rest still queued when there is no model", async () => {
    const { drain, rows } = queueOf(["m1", "m2"]);
    await expect(
      drainQueue({ ...drain, read: () => Promise.resolve("off") })
    ).resolves.toBe("off");
    expect(rows.every((r) => r.status === "queued")).toBe(true);
  });

  it("stops once the lock is lost", async () => {
    const { drain, read } = queueOf(["m1", "m2"]);
    await expect(
      drainQueue({ ...drain, hold: () => Promise.resolve(false) })
    ).resolves.toBe("lost");
    expect(read).toEqual(["m1"]);
  });
});
