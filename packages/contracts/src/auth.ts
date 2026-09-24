import { z } from "zod";

// Messages are translation keys (namespace «validation»), not text: the caller translates them (D31).

export const emailSchema = z
  .email("email")
  .transform((value) => value.trim().toLowerCase());

export const signInCodeSchema = z.string().regex(/^\d{6}$/u, "code");

export const claimFormSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "name").max(100),
  token: z.string().min(1),
});

export const verifyFormSchema = z.object({
  code: signInCodeSchema,
  email: emailSchema,
});
