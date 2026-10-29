import { z } from "zod";

export const updateAutomationSchema = z.object({
  /** When on, install patch releases automatically as soon as they are published. */
  autoPatches: z.boolean(),
  /** Install the newest updater-capable release once per local day after this time; null turns it off. */
  nightlyAt: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
    .nullable(),
  timeZone: z
    .string()
    .min(1)
    .max(100)
    .refine((timeZone) => {
      try {
        const formatter = new Intl.DateTimeFormat("en-US", { timeZone });
        return Boolean(formatter);
      } catch {
        return false;
      }
    }),
});
export type UpdateAutomation = z.infer<typeof updateAutomationSchema>;

export const updateOperationSchema = z.enum(["install", "rollback"]);
export const updateTriggerSchema = z.enum([
  "manual",
  "patch",
  "nightly",
  "rollback",
]);

// An update by the updater (D35) as the app shows it: its five steps, each with what it found, and how it ended.

export const UPDATE_STEPS = [
  "pull",
  "backup",
  "drain",
  "restart",
  "check",
] as const;
export type UpdateStepKey = (typeof UPDATE_STEPS)[number];

const updateStepSchema = z.object({
  /** What the step found, for its line: the image's size, the copy's file and size, answers waited, migrations. */
  note: z
    .object({
      answers: z.number().optional(),
      cached: z.boolean().optional(),
      file: z.string().optional(),
      migrations: z.number().optional(),
      size: z.number().optional(),
    })
    .default({}),
  status: z.enum(["waiting", "running", "done", "failed"]),
});

export const updateRunSchema = z.object({
  backup: z.object({ file: z.string(), size: z.number() }).nullable(),
  byUserId: z.string().nullable(),
  error: z.string().nullable(),
  finishedAt: z.string().nullable(),
  from: z.string(),
  id: z.string(),
  operation: updateOperationSchema.default("install"),
  restored: z.enum(["image", "image+db"]).nullable(),
  /** The previous release's retained backup restored by a manual rollback. */
  rollbackBackup: z
    .object({ file: z.string(), size: z.number() })
    .nullable()
    .default(null),
  startedAt: z.string(),
  status: z.enum(["running", "done", "failed"]),
  steps: z.array(updateStepSchema),
  to: z.string(),
  trigger: updateTriggerSchema.default("manual"),
});
export type UpdateRun = z.infer<typeof updateRunSchema>;
export type UpdateStep = UpdateRun["steps"][number];
