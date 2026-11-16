"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { rememberPage } from "@/lib/last-page";

/** Remembers the last page that is not settings, with its query: where the settings window returns to. */
export const LastPage = () => {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname.startsWith("/settings")) {
      rememberPage(`${window.location.pathname}${window.location.search}`);
    }
  }, [pathname]);
  return null;
};
