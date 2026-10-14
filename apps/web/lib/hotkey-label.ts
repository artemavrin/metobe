"use client";

import { detectPlatform, formatForDisplay } from "@tanstack/react-hotkeys";
import { useSyncExternalStore } from "react";

// Shortcut hints in the keys of this computer: ⌘ ⌥ on a Mac, Ctrl Alt elsewhere. The server draws the Mac's (most
// installs are used from one), and the browser puts its own right after hydration.

type Platform = "mac" | "windows" | "linux";

// The platform never changes while the page is open: nothing to subscribe to.
const unsubscribe = (): void => undefined;
const subscribe = () => unsubscribe;

export const usePlatform = (): Platform =>
  useSyncExternalStore(subscribe, detectPlatform, () => "mac");

/**
 * A shortcut as this computer names it: «Mod+/» → «⌘/» on a Mac, «Ctrl+/» elsewhere. Mac symbols sit together, as
 * the menus write them.
 */
export const useHotkeyLabel = () => {
  const platform = usePlatform();
  return (hotkey: string) => {
    const text = formatForDisplay(hotkey as never, { platform });
    return platform === "mac" ? text.replaceAll(" ", "") : text;
  };
};
