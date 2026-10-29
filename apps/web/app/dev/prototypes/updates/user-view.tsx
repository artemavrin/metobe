"use client";

import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, Clock, Sparkles, X } from "lucide-react";

import { NEXT, STEPS } from "./data";
import { useProto } from "./state";

// The chat as a person sees it while the admin updates: nothing while the version downloads and the base is copied;
// a quiet banner while the answers finish (a new message waits and goes by itself); a few seconds of «reconnecting»;
// then «Metobe обновлён» with what is new. A failed update rolls back unseen — for them the service simply came back.

const drain = STEPS.findIndex((s) => s.key === "drain");
const restart = STEPS.findIndex((s) => s.key === "restart");

export const UserView = () => {
  const { phase, step, nightly } = useProto();
  const paused = phase === "updating" && step >= drain && step < restart;
  const down = phase === "updating" && step >= restart;
  const updated = phase === "done";
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pt-6 pb-32">
      {phase === "scheduled" && (
        <Banner icon={<Clock className="size-4" />}>Сегодня в {nightly} Metobe обновится — около минуты без связи.</Banner>
      )}
      {paused && (
        <Banner icon={<Spinner className="size-4" />}>
          Metobe обновляется. Ответы допишутся, а новое сообщение отправится само — через минуту.
        </Banner>
      )}
      <div className="flex flex-1 flex-col gap-6 py-8">
        <div className="bg-muted ml-auto max-w-[80%] rounded-2xl px-4 py-2.5 text-sm">Сравни тарифы двух облаков для нашей нагрузки</div>
        <div className="flex flex-col gap-2 text-sm leading-relaxed">
          <p>Для двух ВМ по 2 vCPU и 4 ГБ разница в основном в цене диска и трафика. Yandex Cloud выходит дешевле на хранение…</p>
          {(phase === "updating" && step <= drain) || phase === "scheduled" || phase === "available" ? (
            <span className="bg-foreground/60 inline-block h-4 w-1.5 animate-pulse rounded-sm" />
          ) : null}
        </div>
        {(paused || down || updated) && (
          <div className="bg-muted ml-auto flex max-w-[80%] items-center gap-2 rounded-2xl px-4 py-2.5 text-sm">
            А с учётом бэкапов?
            {!updated && <Clock aria-label="Отправится после обновления" className="text-muted-foreground size-3.5" />}
          </div>
        )}
      </div>
      <div className={cn("relative rounded-2xl border p-3 transition-opacity", down && "opacity-60")}>
        <p className="text-muted-foreground px-1 pb-8 text-sm">{paused ? "Сообщение уйдёт после обновления" : "Спросите что-нибудь…"}</p>
        <Button aria-label="Отправить" className="absolute right-3 bottom-3 rounded-full" disabled={down} size="icon-sm">
          <ArrowUp />
        </Button>
      </div>
      {down && (
        <div className="bg-background/70 fixed inset-0 z-40 flex items-center justify-center backdrop-blur-[2px]">
          <div className="bg-popover flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg">
            <Spinner className="size-4" />
            <span className="text-sm">Metobe перезапускается — переподключимся сами</span>
          </div>
        </div>
      )}
      {updated && (
        <div className="bg-popover fixed right-6 bottom-24 z-40 flex max-w-sm items-start gap-3 rounded-xl border p-4 shadow-lg">
          <Sparkles className="text-primary mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Metobe обновлён до {NEXT.version}</span>
            <span className="text-muted-foreground text-xs">Скиллы через /, ⌘K по чатам и настройкам, «Мои файлы».</span>
            <Button className="-ml-2 self-start" size="sm" variant="ghost">
              Что нового
            </Button>
          </div>
          <Button aria-label="Закрыть" className="-mt-1 -mr-1" size="icon-sm" variant="ghost">
            <X />
          </Button>
        </div>
      )}
    </div>
  );
};

const Banner = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-muted/60 text-muted-foreground flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm">
    {icon}
    <span className="text-foreground">{children}</span>
  </div>
);
