"use server";

import {
  MAX_INSTRUCTIONS,
  setImage,
  setInstructions,
  setName,
  setSendKey,
} from "@metobe/core/account";
import { isMailConfigured } from "@metobe/core/mail";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "@/lib/auth";
import { isAvatar } from "@/lib/avatar";

// The account (ARCH §17.6): name, picture, sign-in email, the sessions, and what the model is told about the user.
// Only the signed-in user's own.

const refresh = () => revalidatePath("/settings", "layout");

const session = async () =>
  getAuth().api.getSession({ headers: await headers() });

export const saveName = async (name: string) => {
  const s = await session();
  const parsed = z.string().trim().min(1).max(100).safeParse(name);
  if (!(s && parsed.success)) {
    return { ok: false as const };
  }
  await setName(s.user.id, parsed.data);
  refresh();
  return { ok: true as const };
};

/** The picture as a small data URL, or null to go back to the initials. */
export const saveAvatar = async (image: string | null) => {
  const s = await session();
  if (!s || (image !== null && !isAvatar(image))) {
    return { ok: false as const };
  }
  await setImage(s.user.id, image);
  refresh();
  return { ok: true as const };
};

export type EmailStep =
  | { ok: true }
  | { ok: false; problem: "invalid" | "same" | "code" | "mail" };

const emailSchema = z.email().max(254);

/** Step 1: a code to the current address — the account's own mailbox says yes to the change. */
export const startEmailChange = async (
  newEmail: string
): Promise<EmailStep> => {
  const s = await session();
  const parsed = emailSchema.safeParse(newEmail.trim());
  if (!(s && parsed.success)) {
    return { ok: false, problem: "invalid" };
  }
  if (parsed.data.toLowerCase() === s.user.email.toLowerCase()) {
    return { ok: false, problem: "same" };
  }
  if (!isMailConfigured()) {
    return { ok: false, problem: "mail" };
  }
  await getAuth().api.sendVerificationOTP({
    body: { email: s.user.email, type: "email-verification" },
    headers: await headers(),
  });
  return { ok: true };
};

/** Step 2: the code from the current address, and a code goes to the new one. */
export const sendNewEmailCode = async (
  newEmail: string,
  code: string
): Promise<EmailStep> => {
  const s = await session();
  const parsed = emailSchema.safeParse(newEmail.trim());
  if (!(s && parsed.success)) {
    return { ok: false, problem: "invalid" };
  }
  try {
    await getAuth().api.requestEmailChangeEmailOTP({
      body: { newEmail: parsed.data, otp: code.trim() },
      headers: await headers(),
    });
    return { ok: true };
  } catch {
    return { ok: false, problem: "code" };
  }
};

/** Step 3: the code from the new address; the email changes. */
export const confirmEmailChange = async (
  newEmail: string,
  code: string
): Promise<EmailStep> => {
  const s = await session();
  const parsed = emailSchema.safeParse(newEmail.trim());
  if (!(s && parsed.success)) {
    return { ok: false, problem: "invalid" };
  }
  try {
    await getAuth().api.changeEmailEmailOTP({
      body: { newEmail: parsed.data, otp: code.trim() },
      headers: await headers(),
    });
  } catch {
    return { ok: false, problem: "code" };
  }
  refresh();
  return { ok: true };
};

/** Signs one of the user's other sessions out. */
export const revokeSession = async (token: string) => {
  const s = await session();
  if (!s || token === s.session.token) {
    return;
  }
  await getAuth().api.revokeSession({
    body: { token },
    headers: await headers(),
  });
  revalidatePath("/settings/account");
};

/** Signs every session but this one out. */
export const revokeOtherSessions = async () => {
  await getAuth().api.revokeOtherSessions({ headers: await headers() });
  revalidatePath("/settings/account");
};

/** The user's notes for the model; empty clears them. */
export const saveInstructions = async (text: string) => {
  const s = await session();
  const parsed = z.string().max(MAX_INSTRUCTIONS).safeParse(text);
  if (!(s && parsed.success)) {
    return { ok: false as const };
  }
  await setInstructions(s.user.id, parsed.data);
  revalidatePath("/", "layout");
  return { ok: true as const };
};

export const saveSendKey = async (key: string) => {
  const s = await session();
  const parsed = z.enum(["enter", "mod-enter"]).safeParse(key);
  if (!(s && parsed.success)) {
    return { ok: false as const };
  }
  await setSendKey(s.user.id, parsed.data);
  revalidatePath("/", "layout");
  return { ok: true as const };
};
