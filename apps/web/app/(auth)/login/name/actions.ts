"use server";

import { nameFormSchema } from "@metobe/contracts/auth";
import { setUserName } from "@metobe/core/users";
import { redirect } from "next/navigation";

import { getContext } from "@/lib/context";
import { translateIssue } from "@/lib/validation";

export interface NameState {
  error?: string;
}

/** The one question of a first sign-in: what to call the person. Their own session is the proof of who is asking. */
export const saveName = async (
  _: NameState,
  form: FormData
): Promise<NameState> => {
  const ctx = await getContext();
  if (!ctx) {
    redirect("/login");
  }
  const parsed = nameFormSchema.safeParse({ name: form.get("name") });
  if (!parsed.success) {
    return { error: await translateIssue(parsed.error.issues[0]?.message) };
  }
  await setUserName(ctx.userId, parsed.data.name);
  redirect("/");
};
