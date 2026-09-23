import { z } from "zod";

export const emailSchema = z
  .email("Введите корректный email")
  .transform((value) => value.trim().toLowerCase());

export const signInCodeSchema = z
  .string()
  .regex(/^\d{6}$/u, "Код — это 6 цифр");

export const claimFormSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "Как к вам обращаться?").max(100),
  token: z.string().min(1),
});

export const verifyFormSchema = z.object({
  code: signInCodeSchema,
  email: emailSchema,
});
