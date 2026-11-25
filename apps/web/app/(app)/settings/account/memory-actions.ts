"use server";

import { forgetAll } from "@metobe/core/memory";
import { setMemoryOff } from "@metobe/core/memory-write";
import { revalidatePath } from "next/cache";

import { getActiveContext } from "@/lib/context";

// The person's own memory (ARCH §19.1): their switch and «Забыть всё».

/** On or off; off, nothing of theirs is written or read, and «Память» leaves the sidebar. */
export const saveMemoryOn = async (on: boolean) => {
  const s = await getActiveContext();
  if (!s) {
    return { ok: false as const };
  }
  await setMemoryOff(s.user.id, !on);
  revalidatePath("/", "layout");
  return { ok: true as const };
};

/** Everything in the memory, and its key, goes for good; chats stay. */
export const forgetMemory = async () => {
  const s = await getActiveContext();
  if (!s) {
    return { ok: false as const };
  }
  await forgetAll(s.user.id);
  revalidatePath("/", "layout");
  return { ok: true as const };
};
