"use server";

import { claimFormSchema } from "@metobe/contracts/auth";
import { redeemClaimToken } from "@metobe/core/claim";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { translateIssue } from "@/lib/validation";

export interface ClaimState {
  error?: string;
}

export const claim = async (
  _: ClaimState,
  form: FormData
): Promise<ClaimState> => {
  const parsed = claimFormSchema.safeParse({
    email: form.get("email"),
    name: form.get("name"),
    token: form.get("token"),
  });
  if (!parsed.success) {
    return { error: await translateIssue(parsed.error.issues[0]?.message) };
  }
  const result = await redeemClaimToken(parsed.data);
  if (!result.ok) {
    const t = await getTranslations("claim");
    return {
      error:
        result.reason === "already-claimed"
          ? t("alreadyClaimed")
          : t("invalidToken", {
              command: "docker compose exec app metobe claim-link",
            }),
    };
  }
  // The claim link itself is the proof: sign the new superuser in without sending email.
  const otp = await getAuth().api.createVerificationOTP({
    body: { email: parsed.data.email, type: "sign-in" },
  });
  await getAuth().api.signInEmailOTP({
    body: { email: parsed.data.email, otp },
    headers: await headers(),
  });
  redirect("/");
};
