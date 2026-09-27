"use client";

import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { CircleCheck, CircleX } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";

import { OAUTH_CHANNEL } from "@/lib/oauth-window";
import type { OAuthMessage } from "@/lib/oauth-window";

/**
 * The sign-in window's first and last page: first «opening the provider's page» while the address is fetched, last
 * the result — told to the page that opened the window (on this site's channel, and to the opener when it is still
 * there), then the window closes. If it cannot close, it says what happened and leads back.
 */
export const Relay = ({
  pending,
  ok,
  server,
  popup,
}: {
  pending: boolean;
  ok: boolean;
  server: string | undefined;
  popup: boolean;
}) => {
  const t = useTranslations("mcpOAuth");
  useEffect(() => {
    if (pending) {
      return;
    }
    const message: OAuthMessage = { ok, server, type: "metobe-oauth" };
    try {
      const channel = new BroadcastChannel(OAUTH_CHANNEL);
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin: it only reaches this site
      channel.postMessage(message);
      channel.close();
    } catch {
      // No BroadcastChannel: the opener below, or the link on the page.
    }
    try {
      window.opener?.postMessage(message, window.location.origin);
    } catch {
      // The opener is gone or elsewhere.
    }
    if (popup || window.opener) {
      // The message goes first; the window closes a beat later.
      const timer = setTimeout(() => window.close(), 150);
      return () => clearTimeout(timer);
    }
  }, [pending, ok, server, popup]);

  const back = server
    ? `/settings/connections/${server}`
    : "/settings/connections";
  if (pending) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6">
        <Spinner className="size-5" />
        <p className="text-muted-foreground text-sm">{t("relay.opening")}</p>
      </main>
    );
  }
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="animate-in fade-in zoom-in-95 flex max-w-sm flex-col items-center gap-3 text-center duration-200">
        {ok ? (
          <CircleCheck className="text-success size-8" />
        ) : (
          <CircleX className="text-destructive size-8" />
        )}
        <h1 className="text-lg font-semibold">
          {ok ? t("relay.done") : t("relay.failed")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {ok ? t("relay.doneText") : t("relay.failedText")}
        </p>
        <Button
          nativeButton={false}
          render={<Link href={back} />}
          variant="outline"
        >
          {t("relay.back")}
        </Button>
      </div>
    </main>
  );
};
