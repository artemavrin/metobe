"use client";

import { Button } from "@metobe/ui/components/button";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { SERVERS } from "../data";

// A stand-in for the provider's sign-in page, opened in its own window. In the product this is the provider itself;
// the answer comes back to our callback, which tells the settings page and closes the window the same way.
export const Consent = ({ serverId }: { serverId: string | undefined }) => {
  const server = SERVERS.find((s) => s.id === serverId);
  const [answered, setAnswered] = useState(false);
  if (!server) return <p className="text-muted-foreground p-6 text-sm">Сервер не найден.</p>;
  const answer = (ok: boolean) => {
    setAnswered(true);
    window.opener?.postMessage({ ok, server: server.id, type: "metobe-oauth" }, window.location.origin);
    // The message goes first; the window closes a beat later.
    setTimeout(() => window.close(), 150);
  };
  return (
    <main className="bg-muted/40 flex min-h-svh flex-col">
      <p className="bg-warning/15 text-warning-foreground dark:text-warning px-4 py-2 text-center text-xs">
        Макет для прототипа: в продукте здесь откроется настоящая страница входа {server.title}
      </p>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="bg-background flex w-full max-w-sm flex-col items-center gap-5 rounded-xl border p-6 text-center shadow-sm">
          <BrandLogo label={server.title} logo={server.logo} size={56} />
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold">{server.title}</h1>
            <p className="text-muted-foreground text-sm">Metobe просит доступ к вашему аккаунту {server.title}.</p>
          </div>
          {answered ? (
            <p className="text-muted-foreground text-sm">Окно закроется само.</p>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <Button onClick={() => answer(true)}>Разрешить</Button>
              <Button onClick={() => answer(false)} variant="ghost">
                Отмена
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
