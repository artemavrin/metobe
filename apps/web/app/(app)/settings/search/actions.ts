"use server";

import { checkSearxng } from "@metobe/core/web";
import {
  saveSearchCheck,
  searxngUrl,
  setSearxngUrl,
  setWebTool,
} from "@metobe/core/web-settings";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// The web search (ARCH §8.1): admins only.

const requireAdmin = async () => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    throw new Error("forbidden");
  }
};

const refresh = () => revalidatePath("/settings/search");

/** Checks the SearXNG the chat searches with, and keeps what it found. */
export const recheck = async () => {
  await requireAdmin();
  const url = await searxngUrl();
  if (url) {
    await saveSearchCheck(await checkSearxng(url));
  }
  refresh();
};

export const toggleTool = async (tool: string, on: boolean) => {
  await requireAdmin();
  await setWebTool(z.enum(["web_search", "web_fetch"]).parse(tool), on);
  refresh();
};

const addressSchema = z
  .url({ protocol: /^https?$/u })
  .or(z.literal("").transform(() => null));

/** A SearXNG address — empty goes back to the default — checked right after it is saved. */
export const saveAddress = async (url: string) => {
  await requireAdmin();
  const parsed = addressSchema.safeParse(url.trim());
  if (!parsed.success) {
    return { ok: false as const };
  }
  await setSearxngUrl(parsed.data);
  await recheck();
  return { ok: true as const };
};
