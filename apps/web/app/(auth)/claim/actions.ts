"use server";

import { claimFormSchema } from "@purr/contracts/auth";
import { redeemClaimToken } from "@purr/core/claim";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

export interface ClaimState {
  error?: string;
}

const reasons = {
  "already-claimed": "Администратор уже создан. Войдите через страницу входа.",
  "invalid-token":
    "Ссылка недействительна или устарела. Выпустите новую: docker compose -f docker/compose.yml --env-file .env exec app purr claim-link",
};

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
    return { error: parsed.error.issues[0]?.message };
  }
  const result = await redeemClaimToken(parsed.data);
  if (!result.ok) {
    return { error: reasons[result.reason] };
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
