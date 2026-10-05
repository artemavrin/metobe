"use server";

import { nameFormSchema } from "@metobe/contracts/auth";
import { setUserName } from "@metobe/core/users";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { translateIssue } from "@/lib/validation";

export interface NameState {
  error?: string;
}

/** The one question of a first sign-in: what to call the person. Their own session is the proof of who is asking. */
export const saveName = async (
  _: NameState,
  form: FormData
): Promise<NameState> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  const parsed = nameFormSchema.safeParse({ name: form.get("name") });
  if (!parsed.success) {
    return { error: await translateIssue(parsed.error.issues[0]?.message) };
  }
  await setUserName(session.user.id, parsed.data.name);
  redirect("/");
};
