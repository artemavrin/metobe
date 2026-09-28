"use client";

import type { ChatServer } from "@metobe/core/mcp";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { CircleCheck, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { connectServer } from "@/app/(app)/(chat)/actions";
import { BrandLogo } from "@/components/brand-logo";
import { ConnectDialog } from "@/components/chat/connect-dialog";
import { MailboxForm } from "@/components/mail/mailbox-form";
import {
  OAuthWindowDialog,
  useOAuthWindow,
} from "@/components/mcp/oauth-window";
import { MAIL_KEY } from "@/lib/connect-tool";
import type { AskPart } from "@/lib/connection-asks";

// «Подключите X, чтобы продолжить» (prototype P8, «Плашка»): the answer stopped on a service the user has no account
// on. One line across the answer — who and why — and the way in: the fields in a dialog, as from «@», or the
// provider's window for OAuth. The user's answer goes back as the call's output, and the answer carries on.

const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 fill-mode-both duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

/** The service's picture: its logo, or the mail's envelope. */
const Mark = ({
  mail,
  title,
  logo,
  size,
}: {
  mail: boolean;
  title: string;
  logo?: string | null;
  size: number;
}) =>
  mail ? (
    <span
      className="bg-background text-muted-foreground grid shrink-0 place-items-center rounded-md border"
      style={{ height: size, width: size }}
    >
      <Mail className="size-[55%]" />
    </span>
  ) : (
    <BrandLogo label={title} logo={logo ?? undefined} size={size} />
  );

/** After the answer: a line saying how it went. */
const Outcome = ({
  server,
  title,
  connected,
  mail,
}: {
  server?: ChatServer;
  title: string;
  connected: boolean;
  mail: boolean;
}) => {
  const t = useTranslations("chat.connectRequest");
  return (
    <p
      className={`text-muted-foreground flex min-w-0 items-center gap-2 text-sm ${ENTER}`}
    >
      {connected ? (
        <CircleCheck className="text-success size-4 shrink-0" />
      ) : (
        <Mark logo={server?.logo} mail={mail} size={18} title={title} />
      )}
      <span className="truncate">
        {connected
          ? t("connected", { server: title })
          : t("skipped", { server: title })}
      </span>
    </p>
  );
};

export const ConnectRequest = ({
  part,
  servers,
  onAnswer,
  onServerReady,
}: {
  part: AskPart;
  /** The chat's MCP servers: who is asked for, how one signs in, whether it is connected already. */
  servers: ChatServer[];
  onAnswer: (toolCallId: string, connected: boolean) => void;
  onServerReady: (id: string) => void;
}) => {
  const t = useTranslations("chat.connectRequest");
  const [dialog, setDialog] = useState(false);
  const tm = useTranslations("mail.list");
  const mail = part.input?.server === MAIL_KEY;
  const server = servers.find((s) => s.key === part.input?.server);
  const title = mail
    ? tm("group")
    : (server?.title ?? part.input?.server ?? "");
  const done = () => {
    if (server) {
      onServerReady(server.id);
    }
    onAnswer(part.toolCallId, true);
  };
  const oauth = useOAuthWindow({ onDone: done });
  if (part.state === "output-available") {
    return (
      <Outcome
        connected={part.output.connected}
        mail={mail}
        server={server}
        title={title}
      />
    );
  }
  if (part.state !== "input-available") {
    return null;
  }
  const connect = () => {
    if (mail) {
      setDialog(true);
      return;
    }
    if (!server || server.signIn === "ready") {
      // Connected meanwhile (from «@» or another tab), or gone from the catalog: the server tells which.
      onAnswer(part.toolCallId, Boolean(server));
      return;
    }
    if (server.auth !== "oauth") {
      setDialog(true);
      return;
    }
    oauth.start(server, (returnTo) =>
      connectServer({ catalogId: server.id, returnTo })
    );
  };
  let action = t("connect");
  if (!mail && server?.signIn === "ready") {
    action = t("carryOn");
  } else if (server?.auth === "oauth") {
    action = t("signIn");
  }
  return (
    <>
      <div
        className={`bg-muted/60 flex w-full flex-col gap-2 rounded-xl px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 ${ENTER}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Mark logo={server?.logo} mail={mail} size={32} title={title} />
          <div className="flex min-w-0 flex-1 flex-col text-sm">
            <span className="font-medium">
              {t("needed", { server: title })}
            </span>
            <span className="text-muted-foreground">{part.input.reason}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1">
          <Button
            onClick={() => onAnswer(part.toolCallId, false)}
            size="sm"
            variant="ghost"
          >
            {t("notNow")}
          </Button>
          <Button onClick={connect} size="sm">
            {action}
          </Button>
        </div>
      </div>
      <ConnectDialog
        onClose={() => setDialog(false)}
        onConnect={async (secret, username) => {
          if (!server) {
            return "error";
          }
          const result = await connectServer({
            catalogId: server.id,
            returnTo: window.location.pathname,
            secret,
            username,
          });
          if (result.state !== "ok") {
            return result.state === "refused" ? "refused" : "error";
          }
          setDialog(false);
          done();
          return "ok";
        }}
        reason={part.input.reason}
        server={dialog && !mail ? (server ?? null) : null}
      />
      <Dialog
        onOpenChange={(open) => !open && setDialog(false)}
        open={dialog && mail}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tm("add")}</DialogTitle>
            <DialogDescription>{part.input.reason}</DialogDescription>
          </DialogHeader>
          <MailboxForm
            onCancel={() => setDialog(false)}
            onSaved={() => {
              setDialog(false);
              onAnswer(part.toolCallId, true);
            }}
          />
        </DialogContent>
      </Dialog>
      <OAuthWindowDialog flow={oauth} />
    </>
  );
};
