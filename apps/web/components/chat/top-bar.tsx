"use client";

import { createContext, use } from "react";
import { createPortal } from "react-dom";

// The bar over the screen, beside the sidebar's button: a chat puts its name and menu there (ChatHeader); any other
// page of the shell puts its own — a title, its main button — through <TopBar>, without the shell knowing the page.

export const TopBarSlot = createContext<HTMLElement | null>(null);

/** What a page shows in the bar over it; nothing until the bar is there. */
export const TopBar = ({ children }: { children: React.ReactNode }) => {
  const slot = use(TopBarSlot);
  return slot ? createPortal(children, slot) : null;
};
