"use server";

import { toolApprovals } from "@metobe/contracts/catalog";
import { mailboxInputSchema, mailTools } from "@metobe/contracts/email";
import {
  removeMailbox,
  saveMailbox,
  setMailboxPolicy,
} from "@metobe/core/mailboxes";
import type { SaveResult } from "@metobe/core/mailboxes";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "@/lib/auth";

// A user's own mailboxes (ARCH §17.7): added from «Мои подключения» or from the chat's «connect X to go on» — the
// same form. The password goes from the form straight here, never through the model.

const userId = async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
};

const refresh = () => revalidatePath("/settings", "layout");

/** Checks both servers with the login and saves the box; nothing is kept that they did not take. */
export const addMailbox = async (input: unknown): Promise<SaveResult> => {
  const id = await userId();
  const parsed = mailboxInputSchema.safeParse(input);
  if (!(id && parsed.success)) {
    return { ok: false, problem: "unreachable" };
  }
  const result = await saveMailbox(id, parsed.data);
  if (result.ok) {
    refresh();
  }
  return result;
};

export const deleteMailbox = async (mailboxId: string) => {
  const id = await userId();
  const parsed = z.uuid().safeParse(mailboxId);
  if (!(id && parsed.success)) {
    return false;
  }
  const removed = await removeMailbox(id, parsed.data);
  refresh();
  return removed;
};

/** «Ask first?» for one tool of one of the user's boxes. */
export const setMailboxToolPolicy = async (
  mailboxId: string,
  tool: string,
  policy: string
) => {
  const id = await userId();
  const parsed = z
    .object({
      id: z.uuid(),
      policy: z.enum(toolApprovals),
      tool: z.enum(mailTools),
    })
    .safeParse({ id: mailboxId, policy, tool });
  if (!(id && parsed.success)) {
    return false;
  }
  const done = await setMailboxPolicy(
    id,
    parsed.data.id,
    parsed.data.tool,
    parsed.data.policy
  );
  refresh();
  return done;
};
