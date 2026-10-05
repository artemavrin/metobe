"use server";

import { inviteFormSchema } from "@metobe/contracts/members";
import { sendSignInCode } from "@metobe/core/auth";
import { redeemInvitation } from "@metobe/core/invitations";
import { mayAskForCode } from "@metobe/core/rate-limit";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { getPrefs } from "@/lib/prefs";
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
  const t = await getTranslations("invite");
  // A link for no address makes someone a code is sent to: counted like any request for one.
  if (!(await mayAskForCode(parsed.data.email, await clientIp()))) {
    const tLogin = await getTranslations("login");
    return { error: tLogin("tooMany") };
  }
  const result = await redeemInvitation(parsed.data);
  if (!result.ok) {
    const messages = {
      "email-taken": t("emailTaken"),
      "invalid-token": t("invalidToken"),
      "needs-mail": t("needsMail"),
      "wrong-email": t("wrongEmail"),
    } as const;
    return { error: messages[result.reason] };
  }
  if (!result.verified) {
    // The link was for no one in particular: the person is made, and the mailbox they typed is checked by a code,
    // as at any sign-in. Whoever typed another's address stays outside, without the code.
    const otp = await getAuth().api.createVerificationOTP({
      body: { email: parsed.data.email, type: "sign-in" },
    });
    const prefs = await getPrefs();
    await sendSignInCode(parsed.data.email, otp, prefs.locale);
    redirect(`/login/verify?email=${encodeURIComponent(parsed.data.email)}`);
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
