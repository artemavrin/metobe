"use server";

import { turnOffTaskMail } from "@metobe/core/task-mail";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/** «Отключить» on the page a letter's link opens: the signed link is the proof, no sign-in. */
export const turnOffTaskMailAction = async (taskId: string, token: string) => {
  if (!z.uuid().safeParse(taskId).success) {
    return { ok: false };
  }
  const ok = await turnOffTaskMail(taskId, token);
  revalidatePath(`/mail-off/${taskId}`);
  return { ok };
};
