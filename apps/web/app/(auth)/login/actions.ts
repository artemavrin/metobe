"use server";

import { emailSchema, verifyFormSchema } from "@purr/contracts/auth";
import { findUserByEmail } from "@purr/core/users";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export interface SendCodeState {
  email?: string;
  error?: string;
  sent: boolean;
}
export interface VerifyState {
  error?: string;
}

export const sendCode = async (
  _: SendCodeState,
  form: FormData
): Promise<SendCodeState> => {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, sent: false };
  }
  const email = parsed.data;
  // Same answer whether the user exists or not, so the form cannot be used to probe emails.
  if (await findUserByEmail(email)) {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  }
  return { email, sent: true };
};

export const verifyCode = async (
  _: VerifyState,
  form: FormData
): Promise<VerifyState> => {
  const parsed = verifyFormSchema.safeParse({
    code: form.get("code"),
    email: form.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }
  try {
    await auth.api.signInEmailOTP({
      body: { email: parsed.data.email, otp: parsed.data.code },
      headers: await headers(),
    });
  } catch {
    return { error: "Код неверный или устарел. Запросите новый." };
  }
  redirect("/");
};
