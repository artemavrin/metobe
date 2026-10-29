import { z } from "zod";

export const serviceStatusSchema = z.enum(["ok", "down"]);

export const healthResponseSchema = z.object({
  services: z.object({
    db: serviceStatusSchema,
    // Optional services (D34): «off» — not installed.
    s3: z.enum(["ok", "down", "off"]),
  }),
  status: serviceStatusSchema,
  /** The running build: the updater (D35) checks the new version came up. */
  version: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
