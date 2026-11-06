"use client";

import type { TaskRunFix } from "@metobe/contracts/tasks";
import type { ChatServer } from "@metobe/core/mcp";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { Spinner } from "@metobe/ui/components/spinner";
import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { connectServer } from "@/app/(app)/(chat)/actions";
import { runTaskNowAction } from "@/app/(app)/(chat)/tasks/actions";
import { ConnectDialog } from "@/components/chat/connect-dialog";
import { MailboxForm } from "@/components/mail/mailbox-form";
import type { MailboxDraft } from "@/components/mail/mailbox-form";
import {
  OAuthWindowDialog,
  useOAuthWindow,
} from "@/components/mcp/oauth-window";

// The way out of a run that stopped for want of access (P13): «Войти в X» — the same sign-in as from a chat (an OAuth
// window, or a token in a dialog) — or «Войти в почту» with the mailbox's form, as in its settings. Once in, the task
// runs again at once: «Доступ есть, идёт запуск…», and the page shows the run going.

/** A mailbox to connect again, as its form takes it. */
export type FixMailbox = MailboxDraft & { id: string };

type Stage = "idle" | "running" | "failed";

export const FixButton = ({
  taskId,
  fix,
  servers,
  mailboxes,
}: {
  taskId: string;
  fix: TaskRunFix;
  servers: ChatServer[];
  mailboxes: FixMailbox[];
}) => {
  const t = useTranslations("tasks.fix");
  const [stage, setStage] = useState<Stage>("idle");
  const [dialog, setDialog] = useState(false);
  const server =
    fix.kind === "server" ? servers.find((s) => s.id === fix.id) : undefined;
  const box =
    fix.kind === "mailbox" ? mailboxes.find((b) => b.id === fix.id) : undefined;
  const again = async () => {
    setDialog(false);
    setStage("running");
    const { ok } = await runTaskNowAction(taskId);
    setStage(ok ? "running" : "failed");
  };
  const oauth = useOAuthWindow({
    onDone: () => {
      void again();
    },
  });
  if (!(server || box)) {
    return null;
  }
  if (stage === "running") {
    return (
      <span
        aria-live="polite"
        className="text-muted-foreground flex items-center gap-2 text-sm"
      >
        <Spinner className="size-3.5" />
        {t("running")}
      </span>
    );
  }
  const signIn = () => {
    if (box || server?.auth !== "oauth") {
      setDialog(true);
      return;
    }
    oauth.start(server, (returnTo) =>
      connectServer({ catalogId: server.id, returnTo })
    );
  };
  return (
    <>
      <Button onClick={signIn} size="sm" variant="outline">
        <LogIn />
        {box ? t("mail") : t("server", { server: server?.title ?? "" })}
      </Button>
      {stage === "failed" && (
        <span className="text-destructive text-sm" role="alert">
          {t("failed")}
        </span>
      )}
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
          await again();
          return "ok";
        }}
        server={dialog && server ? server : null}
      />
      <Dialog
        onOpenChange={(open) => !open && setDialog(false)}
        open={dialog && Boolean(box)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("mailTitle", { address: box?.address ?? "" })}
            </DialogTitle>
            <DialogDescription>{t("mailText")}</DialogDescription>
          </DialogHeader>
          {box && (
            <MailboxForm
              initial={box}
              onCancel={() => setDialog(false)}
              onSaved={() => {
                void again();
              }}
              submitLabel={t("mail")}
            />
          )}
        </DialogContent>
      </Dialog>
      <OAuthWindowDialog flow={oauth} />
    </>
  );
};
