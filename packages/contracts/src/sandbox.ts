import { z } from "zod";

// The sandbox service (D47): the app and the worker ask it, by an internal token, for a box per chat, run code in it
// and move files in and out. Only the service sees Docker.

/** Who waits: a person in a chat goes before a task's run. */
export const sandboxClasses = ["chat", "task"] as const;
export type SandboxClass = (typeof sandboxClasses)[number];

/**
 * What the admin sets on the settings page (P35); the app keeps it and hands it to the service, which takes it
 * without a restart. Boxes already running keep the memory and network they were made with.
 */
export const sandboxLimitsSchema = z
  .object({
    /** The service's own cap: a box needs it for the image's libraries (pool.ts). */
    fileMb: z.number().int().min(1).max(100),
    idleSeconds: z.number().int().min(60).max(3600),
    memoryMb: z.number().int().min(1024).max(8192),
    /** Boxes reach the internet (Docker's bridge); off — no network at all. */
    network: z.boolean(),
    perUser: z.number().int().min(1).max(32),
    runSeconds: z.number().int().min(10).max(600),
    total: z.number().int().min(1).max(32),
  })
  .refine((l) => l.perUser <= l.total, { path: ["perUser"] });
export type SandboxLimits = z.infer<typeof sandboxLimitsSchema>;

/** The service's own when its `.env` sets nothing: what the page shows while the service is down and nothing is saved. */
export const SANDBOX_DEFAULT_LIMITS: SandboxLimits = {
  fileMb: 25,
  idleSeconds: 300,
  memoryMb: 1024,
  network: false,
  perUser: 1,
  runSeconds: 60,
  total: 4,
};

export const acquireRequestSchema = z.object({
  class: z.enum(sandboxClasses),
  /** The chat (or a task's run) the box belongs to: the next answer in this chat finds the same box. */
  key: z.string().min(1).max(200),
  /** The admin's limits, sent with each request: a restarted service has them back with the first box. */
  limits: sandboxLimitsSchema.optional(),
  userId: z.string().min(1).max(200),
});
export type AcquireRequest = z.infer<typeof acquireRequestSchema>;

export interface AcquireResponse {
  boxId: string;
  /** A new box; otherwise the chat's box from its last answer, with its files. */
  fresh: boolean;
}

export const execRequestSchema = z.object({
  /** Python source, run as `python3 -` in /workspace. */
  code: z.string().max(200_000),
  timeoutSeconds: z.number().int().min(1).max(600).optional(),
});
export type ExecRequest = z.infer<typeof execRequestSchema>;

export interface ExecResponse {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** The output was longer than kept: its start and end are kept, the middle is cut. */
  truncated: boolean;
  /** Killed at the time limit. */
  timedOut: boolean;
  /** The code ran out of memory (a MemoryError, or killed without its time being up). */
  outOfMemory: boolean;
  /** The box itself died (under gVisor: out of memory for the whole box); its files are gone, the next call gets a new one. */
  boxLost: boolean;
}

export interface SandboxFileEntry {
  path: string;
  size: number;
}

export interface SandboxStatus {
  /** `runsc` — gVisor; `runc` only when the admin set it for development. */
  runtime: string;
  image: string;
  ready: boolean;
  /** Why not ready, for the admin. */
  problem?: "docker" | "runtime" | "image";
  limits: SandboxLimits;
  /** The server's memory, as Docker counts it. */
  hostMemoryMb?: number;
  boxes: {
    key: string;
    userId: string;
    class: SandboxClass;
    busy: boolean;
    createdAt: string;
    /** When an idle box goes away. */
    idleUntil?: string;
  }[];
  waiting: number;
}
