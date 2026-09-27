"use client";

import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metobe/ui/components/dialog";
import { Spinner } from "@metobe/ui/components/spinner";
import { CircleCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { type Server, toolsWord } from "./data";
import { Mark } from "./parts";

// «Погружение · 2»: leaving is its own section, as removing is everywhere in the settings; OAuth signs in in the
// provider's own window over the page — a login page cannot sit inside our modal (providers refuse frames, and a
// password field without an address bar is how phishing looks), so the modal waits while the window does the work.

/** Leaving, as removing anything in the settings: its own section at the end, a red button, a confirmation. */
export const LeaveSection = ({ server, onLeave }: { server: Server; onLeave: () => void }) => (
  <Section title="Отключение">
    <Rows>
      <Row
        action={
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="destructive" />}>Отключить {server.title}</DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Отключить {server.title}?</DialogTitle>
                <DialogDescription>
                  Ваша учётка удалится, {toolsWord(server.toolCount)} {server.title} пропадут из ваших чатов. История чатов останется. Подключить снова можно в любой момент.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost" />}>Отмена</DialogClose>
                <DialogClose render={<Button onClick={onLeave} variant="destructive" />}>Отключить</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
        hint="Учётка удалится, тулы пропадут из ваших чатов. История чатов останется."
        label={`Отключить ${server.title}`}
      />
    </Rows>
  </Section>
);

export type OAuthPhase = "waiting" | "done" | "cancelled" | "closed" | "blocked";

/**
 * The provider's window: opened from the click itself (a popup blocker lets that through), watched until it answers
 * through postMessage — or is closed without an answer. Blocked — the modal offers the same page in this tab.
 */
export const useOAuthWindow = ({ onDone, onFallback }: { onDone: (s: Server) => void; onFallback: (s: Server) => void }) => {
  const [server, setServer] = useState<Server | null>(null);
  const [phase, setPhase] = useState<OAuthPhase>("waiting");
  const [open, setOpen] = useState(false);
  const popup = useRef<Window | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const openWindow = (s: Server) => {
    const w = 480;
    const h = 620;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    popup.current?.close();
    const win = window.open(`/dev/prototypes/my-connections/oauth?server=${s.id}`, "metobe-oauth", `popup,width=${w},height=${h},left=${left},top=${top}`);
    popup.current = win;
    setPhase(win ? "waiting" : "blocked");
  };

  const start = (s: Server) => {
    setServer(s);
    setOpen(true);
    openWindow(s);
  };

  useEffect(() => {
    if (!open || !server) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "metobe-oauth" || e.data.server !== server.id) return;
      if (e.data.ok) {
        setPhase("done");
        done.current(server);
      } else {
        setPhase("cancelled");
      }
    };
    window.addEventListener("message", onMessage);
    // Closed without a word: the window's own × — say so instead of waiting forever.
    const timer = setInterval(() => {
      if (popup.current?.closed) {
        popup.current = null;
        setPhase((p) => (p === "waiting" ? "closed" : p));
      }
    }, 400);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
  }, [open, server]);

  // Done: the modal says so for a beat and goes by itself.
  useEffect(() => {
    if (phase !== "done" || !open) return;
    const t = setTimeout(() => setOpen(false), 900);
    return () => clearTimeout(t);
  }, [phase, open]);

  const cancel = () => {
    popup.current?.close();
    popup.current = null;
    setOpen(false);
  };
  const retry = () => server && openWindow(server);
  const fallback = () => {
    if (!server) return;
    setOpen(false);
    onFallback(server);
  };
  return { cancel, fallback, open, phase, retry, server, start };
};

export type OAuthWindow = ReturnType<typeof useOAuthWindow>;

const TEXT: Record<OAuthPhase, (title: string) => string> = {
  blocked: () => "Браузер не дал открыть окно. Можно войти в этой вкладке — после входа вернётесь сюда.",
  cancelled: (title) => `В окне ${title} вход отменили.`,
  closed: (title) => `Окно ${title} закрыли до конца входа.`,
  done: (title) => `Готово: ${title} подключён.`,
  waiting: (title) => `Мы открыли окно ${title}. Войдите там и разрешите доступ — это окно обновится само.`,
};

/** Our modal while the provider's window works: what is going on, and what to do if it went wrong. */
export const OAuthDialog = ({ flow }: { flow: OAuthWindow }) => {
  const s = flow.server;
  if (!s) return null;
  const { phase } = flow;
  return (
    <Dialog onOpenChange={(o) => !o && flow.cancel()} open={flow.open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Mark server={s} size={40} />
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle>Вход в {s.title}</DialogTitle>
              <DialogDescription className="animate-in fade-in duration-150" key={phase}>
                {TEXT[phase](s.title)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {phase === "waiting" && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner /> Ждём ответа из окна {s.title}…
          </p>
        )}
        {phase === "done" && (
          <p className="text-success animate-in fade-in zoom-in-95 flex items-center gap-2 text-sm font-medium duration-200">
            <CircleCheck className="size-4" /> Вход выполнен
          </p>
        )}
        <DialogFooter>
          <Button onClick={flow.cancel} variant="ghost">
            {phase === "done" ? "Закрыть" : "Отмена"}
          </Button>
          {phase === "waiting" && (
            <Button onClick={flow.retry} variant="outline">
              Открыть окно снова
            </Button>
          )}
          {(phase === "cancelled" || phase === "closed") && <Button onClick={flow.retry}>Попробовать снова</Button>}
          {phase === "blocked" && <Button onClick={flow.fallback}>Войти в этой вкладке</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
