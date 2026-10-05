"use server";

import { serviceMailInputSchema } from "@metobe/contracts/email";
import {
  checkServiceMail,
  getServiceMail,
  saveServiceMail,
  sendTestLetter,
  setSenderName,
  turnOffServiceMail,
} from "@metobe/core/mail";
import type { MailResult } from "@metobe/core/mail";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// The service's mail (D15): admins only.

const requireAdmin = async () => {
  const { admin, user } = await getSettingsViewer();
  if (!(admin && user)) {
    throw new Error("forbidden");
  }
  return user;
};

const refresh = () => revalidatePath("/settings/mail");

type SaveMailResult = MailResult | { ok: false; problem: "invalid" };

/** The mailbox the service sends from: checked first, kept only when the server took it. */
export const saveMail = async (input: unknown): Promise<SaveMailResult> => {
  await requireAdmin();
  const parsed = serviceMailInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, problem: "invalid" };
  }
  const result = await saveServiceMail(parsed.data);
  if (result.ok) {
    refresh();
  }
  return result;
};

export const recheck = async () => {
  await requireAdmin();
  await checkServiceMail();
  refresh();
};

export const renameSender = async (name: string) => {
  await requireAdmin();
  await setSenderName(z.string().max(100).parse(name));
  refresh();
};

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** A letter to the admin themselves: whether the mail gets through, end to end. */
export const sendTest = async (): Promise<MailResult | null> => {
  const user = await requireAdmin();
  const mail = await getServiceMail();
  if (!mail) {
    return null;
  }
  const t = await getTranslations("email.test");
  const text = t("body", { address: mail.address });
  const result = await sendTestLetter({
    html: `<p>${escapeHtml(text)}</p>`,
    subject: t("subject"),
    text,
    to: user.email,
  });
  refresh();
  return result;
};

export const turnOff = async () => {
  await requireAdmin();
  await turnOffServiceMail();
  refresh();
};
