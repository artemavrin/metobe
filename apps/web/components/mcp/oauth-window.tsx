"use client";

import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { Spinner } from "@metobe/ui/components/spinner";
import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import {
  isOAuthMessage,
  OAUTH_CHANNEL,
  OAUTH_POPUP_RETURN,
  popupFeatures,
} from "@/lib/oauth-window";

// OAuth in the provider's own window, our modal over the page while it works (lib/oauth-window). Nothing leaves the
// page, so a chat keeps what was typed. A blocked window falls back to the same sign-in in this tab.

/** Starts a sign-in: the provider's page to open, or «already fine», or refused / failed. */
export type OAuthBegin = (
  returnTo: string
) => Promise<
  | { state: "ok" }
  | { state: "signIn"; url: string }
  | { state: "refused" }
  | { state: "error" }
>;

export type OAuthPhase =
  | "opening"
  | "waiting"
  | "done"
  | "failed"
  | "blocked"
  | "error";

interface Target {
  id: string;
  title: string;
  logo?: string | null;
}

const RELAY = "/mcp-oauth?pending=1";
const NAME = "metobe-oauth";

export const useOAuthWindow = ({
  onDone,
}: {
  onDone: (id: string) => void;
}) => {
  const [target, setTarget] = useState<Target | null>(null);
  const [phase, setPhase] = useState<OAuthPhase>("opening");
  const [open, setOpen] = useState(false);
  // A window that looks closed may only be cut off from us by the provider's page: a hint, not a verdict.
  const [maybeClosed, setMaybeClosed] = useState(false);
  const popup = useRef<Window | null>(null);
  const begin = useRef<OAuthBegin | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  const go = async (win: Window | null, t: Target, start: OAuthBegin) => {
    popup.current = win;
    setMaybeClosed(false);
    if (!win) {
      setPhase("blocked");
      return;
    }
    setPhase("opening");
    const result = await start(OAUTH_POPUP_RETURN).catch(() => ({
      state: "error" as const,
    }));
    if (result.state === "signIn") {
      win.location.href = result.url;
      setPhase("waiting");
    } else if (result.state === "ok") {
      win.close();
      setPhase("done");
      done.current(t.id);
    } else {
      win.close();
      setPhase("error");
    }
  };

  /** From the click itself, so a popup blocker lets the window through; the provider's address comes after. */
  const start = (t: Target, starter: OAuthBegin) => {
    const win = window.open(RELAY, NAME, popupFeatures());
    setTarget(t);
    begin.current = starter;
    setOpen(true);
    void go(win, t, starter);
  };

  const reopen = () => {
    if (!(target && begin.current)) {
      return;
    }
    popup.current?.close();
    void go(window.open(RELAY, NAME, popupFeatures()), target, begin.current);
  };

  /** The window was blocked: the same sign-in in this tab, back here after it. */
  const inThisTab = async () => {
    if (!(target && begin.current)) {
      return;
    }
    setPhase("opening");
    const result = await begin
      .current(window.location.pathname + window.location.search)
      .catch(() => ({ state: "error" as const }));
    if (result.state === "signIn") {
      window.location.assign(result.url);
    } else if (result.state === "ok") {
      setPhase("done");
      done.current(target.id);
    } else {
      setPhase("error");
    }
  };

  useEffect(() => {
    if (!(open && target)) {
      return;
    }
    const receive = (data: unknown) => {
      if (!isOAuthMessage(data) || (data.server && data.server !== target.id)) {
        return;
      }
      if (data.ok) {
        setPhase("done");
        done.current(target.id);
      } else {
        setPhase("failed");
      }
    };
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(OAUTH_CHANNEL);
      channel.addEventListener("message", (e) => receive(e.data));
    } catch {
      // No BroadcastChannel: the opener's message below still comes.
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin) {
        receive(e.data);
      }
    };
    window.addEventListener("message", onMessage);
    const timer = setInterval(() => {
      if (popup.current?.closed) {
        popup.current = null;
        setMaybeClosed(true);
      }
    }, 500);
    return () => {
      channel?.close();
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
  }, [open, target]);

  // Done: the modal says so for a beat and goes by itself.
  useEffect(() => {
    if (!(open && phase === "done")) {
      return;
    }
    const timer = setTimeout(() => setOpen(false), 900);
    return () => clearTimeout(timer);
  }, [open, phase]);

  const cancel = () => {
    popup.current?.close();
    popup.current = null;
    setOpen(false);
  };

  return { cancel, inThisTab, maybeClosed, open, phase, reopen, start, target };
};

export type OAuthWindow = ReturnType<typeof useOAuthWindow>;

/** Our modal while the provider's window works: what is going on, and what to do when it went wrong. */
export const OAuthWindowDialog = ({ flow }: { flow: OAuthWindow }) => {
  const t = useTranslations("mcpOAuth");
  const { target, phase } = flow;
  if (!target) {
    return null;
  }
  const server = target.title;
  return (
    <Dialog onOpenChange={(o) => !o && flow.cancel()} open={flow.open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <BrandLogo
              label={target.title}
              logo={target.logo ?? undefined}
              size={40}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle>{t("title", { server })}</DialogTitle>
              <DialogDescription
                className="animate-in fade-in duration-150"
                key={phase}
              >
                {t(`phase.${phase}`, { server })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {(phase === "opening" || phase === "waiting") && (
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Spinner />{" "}
              {t(phase === "opening" ? "opening" : "waiting", { server })}
            </p>
            {phase === "waiting" && flow.maybeClosed && (
              <p className="text-muted-foreground text-xs">
                {t("maybeClosed")}
              </p>
            )}
          </div>
        )}
        {phase === "done" && (
          <p className="text-success animate-in fade-in zoom-in-95 flex items-center gap-2 text-sm font-medium duration-200">
            <CircleCheck className="size-4" /> {t("signedIn")}
          </p>
        )}
        <DialogFooter>
          <Button onClick={() => flow.cancel()} variant="ghost">
            {phase === "done" ? t("close") : t("cancel")}
          </Button>
          {phase === "waiting" && (
            <Button onClick={() => flow.reopen()} variant="outline">
              {t("reopen")}
            </Button>
          )}
          {(phase === "failed" || phase === "error") && (
            <Button onClick={() => flow.reopen()}>{t("retry")}</Button>
          )}
          {phase === "blocked" && (
            <Button onClick={() => flow.inThisTab()}>{t("thisTab")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
