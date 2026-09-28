"use client";

import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { cn } from "@metobe/ui/lib/utils";
import { useEffect, useState } from "react";

import { Mark } from "../my-connections/parts";
import { OAuthDialog } from "../my-connections/oauth-flow";
import { ChatFrame } from "./chat";
import { Connected, Dismissed, ENTER, metaOf, SignIn } from "./parts";
import { useRequest } from "./state";

// «Плашка»: the feed keeps one quiet line — who is needed and why — and the button; the fields open in a dialog, as
// connecting from «@» does now. The thread stays compact; the form gets the room and the focus of a modal.

export const Strip = () => {
  const r = useRequest();
  const [open, setOpen] = useState(false);
  const s = r.scenario.server;
  // Connected: the dialog has done its job.
  useEffect(() => {
    if (r.phase === "connected") setOpen(false);
  }, [r.phase]);
  let line;
  if (r.phase === "connected") line = <Connected r={r} />;
  else if (r.phase === "dismissed") line = <Dismissed r={r} />;
  else
    line = (
      <div className={cn("bg-muted/60 flex w-full flex-col gap-2 rounded-xl px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3", ENTER)}>
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <Mark server={s} size={24} />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">Нужен вход в {s.title}.</span>{" "}
            <span className="text-muted-foreground">{r.scenario.reason}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1">
          <Button onClick={r.dismiss} size="sm" variant="ghost">
            Не сейчас
          </Button>
          <Button
            onClick={() => (s.auth === "oauth" ? r.connect({ login: "", secret: "", setLogin: () => {}, setSecret: () => {} }) : setOpen(true))}
            size="sm"
          >
            {s.auth === "oauth" ? `Войти через ${s.title}` : "Подключить"}
          </Button>
        </div>
      </div>
    );
  return (
    <>
      <ChatFrame inFeed={line} request={r} />
      <Dialog onOpenChange={(o) => r.phase !== "connecting" && setOpen(o)} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Mark server={s} size={40} />
              <div className="flex min-w-0 flex-col gap-1">
                <DialogTitle>Подключить {s.title}</DialogTitle>
                <DialogDescription>{metaOf(r)}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">{r.scenario.reason}</p>
          <SignIn layout="stacked" r={r} />
        </DialogContent>
      </Dialog>
      <OAuthDialog flow={r.oauth} />
    </>
  );
};
