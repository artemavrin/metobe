import { z } from "zod";

// The sandbox service (D47): the app and the worker ask it, by an internal token, for a box per chat, run code in it
// and move files in and out. Only the service sees Docker.

/** Who waits: a person in a chat goes before a task's run. */
export const sandboxClasses = ["chat", "task"] as const;
export type SandboxClass = (typeof sandboxClasses)[number];

export const acquireRequestSchema = z.object({
  class: z.enum(sandboxClasses),
  /** The chat (or a task's run) the box belongs to: the next answer in this chat finds the same box. */
  key: z.string().min(1).max(200),
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
  limits: {
    total: number;
    perUser: number;
    idleSeconds: number;
    memoryMb: number;
  };
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
