import { z } from "zod";

export const serviceStatusSchema = z.enum(["ok", "down"]);

export const healthResponseSchema = z.object({
  services: z.object({
    db: serviceStatusSchema,
    // Optional services (D34): «off» — not installed.
    s3: z.enum(["ok", "down", "off"]),
  }),
  status: serviceStatusSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
