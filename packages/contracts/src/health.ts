import { z } from "zod";

export const serviceStatusSchema = z.enum(["ok", "down"]);

export const healthResponseSchema = z.object({
  services: z.object({
    db: serviceStatusSchema,
  }),
  status: serviceStatusSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
