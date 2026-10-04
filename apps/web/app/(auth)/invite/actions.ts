"use server";

import { inviteFormSchema } from "@metobe/contracts/members";
import { redeemInvitation } from "@metobe/core/invitations";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { translateIssue } from "@/lib/validation";

export interface InviteState {
  error?: string;
}

export const accept = async (
  _: InviteState,
  form: FormData
): Promise<InviteState> => {
  const parsed = inviteFormSchema.safeParse({
    email: form.get("email"),
    name: form.get("name"),
    token: form.get("token"),
  });
  if (!parsed.success) {
    return { error: await translateIssue(parsed.error.issues[0]?.message) };
  }
  const result = await redeemInvitation(parsed.data);
  if (!result.ok) {
    const t = await getTranslations("invite");
    const messages = {
      "email-taken": t("emailTaken"),
      "invalid-token": t("invalidToken"),
      "wrong-email": t("wrongEmail"),
    } as const;
    return { error: messages[result.reason] };
  }
  // The invitation link itself is the proof: sign the new person in without sending email.
  const otp = await getAuth().api.createVerificationOTP({
    body: { email: parsed.data.email, type: "sign-in" },
  });
  await getAuth().api.signInEmailOTP({
    body: { email: parsed.data.email, otp },
    headers: await headers(),
  });
  redirect("/");
};
