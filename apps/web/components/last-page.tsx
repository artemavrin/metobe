"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { notePath } from "@/lib/last-page";

/** Remembers the last page that is not settings, with its query, and the settings screens shown since: where and how the settings window closes. */
export const LastPage = () => {
  const pathname = usePathname();
  useEffect(() => {
    notePath(pathname, `${window.location.pathname}${window.location.search}`);
  }, [pathname]);
  return null;
};
