"use client";

import { Button } from "@metobe/ui/components/button";
import { Checkbox } from "@metobe/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@metobe/ui/components/dialog";
import { cn } from "@metobe/ui/lib/utils";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Sky, SKY_CSS } from "@/components/chat/night-sky";

import { RELEASE } from "./data";
import { DEMOS } from "./demos";
import { useProto } from "./state";

/** Entrances: out of the way fast, never from nothing — Emil's curve. */
export const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const CHATS = ["План весенней рассылки", "Письмо поставщику", "Итоги встречи 28 октября", "Сравнить три тарифа", "Черновик вакансии", "Вопросы к договору"];

/**
 * The chat the window opens over: the app's frame drawn with neutral chats (never anyone's data) — blurred by the
 * overlay anyway, it only has to read as «the chat, where I was».
 */
export const Backdrop = () => (
  <div aria-hidden className="bg-background fixed inset-0 flex gap-3 p-3">
    <div className="bg-sidebar hidden w-64 shrink-0 flex-col gap-1 rounded-xl border p-3 md:flex">
      <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
        <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md text-xs">M</span>
        Metobe
      </div>
      <div className="text-muted-foreground mb-2 rounded-md border px-2 py-1.5 text-sm">Поиск</div>
      {CHATS.map((c, i) => (
        <span className={cn("truncate rounded-md px-2 py-1.5 text-sm", i === 0 && "bg-muted")} key={c}>
          {c}
        </span>
      ))}
    </div>
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-14 text-sm">
      <div className="bg-muted ml-auto w-fit rounded-2xl px-4 py-2">Составь план весенней рассылки для клиентов</div>
      <p className="leading-relaxed">Три письма за две недели: анонс, подборка и напоминание. Ниже — темы, дни отправки и короткий текст каждого.</p>
      <div className="flex flex-col gap-2">
        <span className="bg-muted h-2.5 w-11/12 rounded-full" />
        <span className="bg-muted h-2.5 w-4/5 rounded-full" />
        <span className="bg-muted h-2.5 w-3/5 rounded-full" />
      </div>
      <div className="text-muted-foreground mt-auto mb-6 rounded-3xl border px-4 py-3">Спросите что-нибудь…</div>
    </div>
  </div>
);

/** Which demo stands for a round-1 «screenshot». */
const DEMO_OF: Record<string, string> = { ask: "ask", map: "map", "new-chat": "welcome", share: "share" };

/**
 * Round 1's «screenshot»: the round-2 demo, still (inert), in a frame. The real screenshots were of the dev data —
 * removed: examples never show anyone's own chats.
 */
export const Shot = ({ name, className }: { name: string; alt: string; className?: string }) => {
  const Demo = DEMOS[DEMO_OF[name] ?? ""];
  return (
    <div className={cn("bg-background ring-foreground/10 relative aspect-[8/5] overflow-hidden rounded-lg ring-1", className)} inert>
      {Demo ? <Demo /> : null}
    </div>
  );
};

/**
 * The picture on top: the night sky of the black hole's «beyond», the version large on it. Always night — a cover
 * reads as one in both themes, and the stars are the new chat's own.
 */
export const Cover = ({ className, compact }: { className?: string; compact?: boolean }) => (
  <div className={cn("relative isolate overflow-hidden bg-[oklch(0.17_0.035_264)] text-white", compact ? "h-28" : "h-40", className)}>
    <style>{SKY_CSS}</style>
    <Sky shooting={1} tone="night" />
    {/* A glow under the words, so the stars thin out where they are read. */}
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_100%,oklch(0.45_0.17_264/0.55),transparent_60%)]" />
    <div className="absolute inset-x-6 bottom-5 flex flex-col gap-1">
      <span className="text-xs font-medium tracking-[0.18em] text-white/60 uppercase">Что нового · {RELEASE.date}</span>
      <span className={cn("font-semibold tracking-tight", compact ? "text-2xl" : "text-3xl")}>Metobe {RELEASE.version}</span>
    </div>
  </div>
);

/** «×» on the cover: white on the night, the dialog's own button left out. */
export const CloseOnCover = ({ className }: { className?: string }) => {
  const { setOpen } = useProto();
  return (
    <Button
      aria-label="Закрыть"
      className={cn("absolute top-3 right-3 z-10 text-white/70 hover:bg-white/10 hover:text-white", className)}
      onClick={() => setOpen(false)}
      size="icon-sm"
      variant="ghost"
    >
      <X />
    </Button>
  );
};

/** «Не показывать после обновлений»: the next version will not open by itself; the account menu still has it. */
export const DontShow = () => {
  const { dontShow, setDontShow } = useProto();
  return (
    <label className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap transition-colors duration-150 select-none">
      <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(Boolean(v))} />
      Не показывать после обновлений
    </label>
  );
};

/** The window itself: over the chat, the size each variant needs, the cover and the footer are theirs. */
export const WhatsNewDialog = ({
  className,
  children,
  initialFocus,
}: {
  className?: string;
  children: ReactNode;
  /** Where the focus lands on open: the main button, not the first star of the cover. */
  initialFocus?: React.RefObject<HTMLElement | null>;
}) => {
  const { open, setOpen, round } = useProto();
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 duration-200 data-open:zoom-in-[0.96]",
          EASE,
          className
        )}
        initialFocus={initialFocus}
        key={round}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Что нового в Metobe {RELEASE.version}</DialogTitle>
        <DialogDescription className="sr-only">Что появилось после обновления</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
};

/** What lies under the window once it is closed: the chat, and a way back (as the account menu will have it). */
export const Stage = ({ children }: { children: ReactNode }) => {
  const { open, reopen } = useProto();
  return (
    <>
      <Backdrop />
      {!open && (
        <div className="fixed inset-x-0 bottom-28 flex justify-center">
          <Button className="shadow-lg" onClick={reopen} variant="outline">
            Что нового в {RELEASE.version}
          </Button>
        </div>
      )}
      {children}
    </>
  );
};
