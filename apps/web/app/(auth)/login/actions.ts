"use server";

import { emailSchema, verifyFormSchema } from "@metobe/contracts/auth";
import { sendSignInCode } from "@metobe/core/auth";
import { findUserByEmail } from "@metobe/core/users";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { getPrefs, writePrefsCookies } from "@/lib/prefs";
import { translateIssue } from "@/lib/validation";

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
    return {
      error: await translateIssue(parsed.error.issues[0]?.message),
      sent: false,
    };
  }
  const email = parsed.data;
  // Same answer whether the user exists or not, so the form cannot be used to probe emails.
  // The code is issued here and mailed by us, so the email can follow the language of this page.
  if (await findUserByEmail(email)) {
    const code = await getAuth().api.createVerificationOTP({
      body: { email, type: "sign-in" },
    });
    const prefs = await getPrefs();
    await sendSignInCode(email, code, prefs.locale);
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
    return { error: await translateIssue(parsed.error.issues[0]?.message) };
  }
  try {
    await getAuth().api.signInEmailOTP({
      body: { email: parsed.data.email, otp: parsed.data.code },
      headers: await headers(),
    });
  } catch {
    const t = await getTranslations("login");
    return { error: t("codeInvalid") };
  }
  // A new device takes the language, zone and formats saved in the profile.
  const signedIn = await findUserByEmail(parsed.data.email);
  if (signedIn) {
    await writePrefsCookies(signedIn);
  }
  redirect("/");
};
