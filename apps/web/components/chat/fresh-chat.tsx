"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

// A new chat that has become a chat: its first message moved the address to /chat/<id> with history.replaceState,
// but the router still holds the «new chat» page. «Новый чат» then leads back to the same page, and nothing changed
// — the old thread stayed on screen. So the address coming back to / starts the page anew: a fresh id, the welcome,
// and the server's data (the last chats) read again.

export const FreshChat = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [seen, setSeen] = useState(pathname);
  const [round, setRound] = useState(0);
  if (pathname !== seen) {
    setSeen(pathname);
    if (pathname === "/") {
      setRound((r) => r + 1);
    }
  }
  useEffect(() => {
    if (round > 0) {
      router.refresh();
    }
  }, [round, router]);
  return <Fragment key={round}>{children}</Fragment>;
};
