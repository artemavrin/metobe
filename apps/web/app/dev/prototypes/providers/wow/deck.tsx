"use client";

// «Колода»: the onboarding's language for everyday settings. Each provider is a card in a deck; ← → deal the next
// one, «Подключение» flips the card to its back (key, route, disconnect). The last card connects a new provider.
import { Button } from "@purr/ui/components/button";
import { Alert, AlertDescription, AlertTitle } from "@purr/ui/components/reui/alert";
import { Badge } from "@purr/ui/components/reui/badge";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { Separator } from "@purr/ui/components/separator";
import { cn } from "@purr/ui/lib/utils";
import { ArrowLeft, ArrowRight, CircleAlert, Plus, RotateCw, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ConnectForm, ProviderList } from "../../_p7/connect";
import type { Connected } from "../../_p7/connect-dialog";
import { type ProviderKind, providerBy } from "../../_p7/mock";
import { ProviderMark, RouteBadge } from "../../_p7/shared";
import {
  DisconnectButton,
  HealthBadge,
  HealthDot,
  KeyField,
  type Panel,
  type PanelProvider,
  RecheckButton,
  RouteSelect,
  usePanel,
  visibleInChat,
} from "../panel/common";
import { ModelSwitchList } from "./parts";

const SURFACE = "bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))]";
type Slot = ProviderKind | "add";

export const WowDeck = () => {
  const panel = usePanel();
  const slots: Slot[] = [...panel.list.map((p) => p.kind), "add"];
  const [slot, setSlot] = useState<Slot>(panel.selected);
  const [dir, setDir] = useState<1 | -1>(1);
  const [flipped, setFlipped] = useState(false);
  const [fresh, setFresh] = useState<ProviderKind | null>(null);
  const index = Math.max(0, slots.indexOf(slot));

  const go = useCallback(
    (to: number) => {
      const next = slots[(to + slots.length) % slots.length] as Slot;
      setDir(to > index ? 1 : -1);
      setFlipped(false);
      setSlot(next);
      if (next !== "add") panel.setSelected(next);
    },
    [slots, index, panel]
  );

  // ← → deal the deck. Captured before the prototype picker, which also listens to arrows.
  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.stopPropagation();
      goRef.current(indexRef.current + (e.key === "ArrowRight" ? 1 : -1));
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const p = slot === "add" ? undefined : panel.list.find((x) => x.kind === slot);
  const ahead = slots.slice(index + 1, index + 3);

  const nav = (
    <div className="flex h-6 items-center justify-between px-(--frame-panel-header-px) pt-3 pb-4 box-content">
      <span className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
        <Button aria-label="Предыдущий" className="-ml-1.5" onClick={() => go(index - 1)} size="icon-xs" variant="ghost">
          <ArrowLeft />
        </Button>
        <Button aria-label="Следующий" onClick={() => go(index + 1)} size="icon-xs" variant="ghost">
          <ArrowRight />
        </Button>
        <span className="ml-1">{slot === "add" ? "Новый провайдер" : `Провайдер ${index + 1} из ${panel.list.length}`}</span>
      </span>
      <span className="flex items-center gap-1.5">
        {slots.map((s, i) => (
          <button
            aria-label={s === "add" ? "Подключить провайдера" : providerBy(s).title}
            className={cn("flex h-3 items-center justify-center transition-[width] duration-300 ease-out", i === index ? "w-5" : "w-2")}
            key={s}
            onClick={() => go(i)}
            type="button"
          >
            {s === "add" ? (
              <Plus className={cn("size-3", i === index ? "text-primary" : "text-muted-foreground")} />
            ) : (
              <span
                className={cn(
                  "h-1.5 w-full rounded-full transition-colors duration-300",
                  panel.list.find((x) => x.kind === s)?.health.state === "error" ? "bg-destructive" : i === index ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </button>
        ))}
      </span>
    </div>
  );

  return (
    <div className="flex min-h-full justify-center px-6 pt-10 pb-24">
      <div className="relative isolate h-fit w-full max-w-2xl">
        {/* Next cards peek out behind, named — the deck is also the list */}
        {ahead.map((s, i) => (
          <button
            aria-label={s === "add" ? "Подключить провайдера" : providerBy(s).title}
            className={cn(SURFACE, "absolute inset-x-0 top-0 flex h-full origin-bottom items-end justify-center rounded-xl border shadow-xs transition-transform duration-300 ease-out")}
            key={s}
            onClick={() => go(index + 1 + i)}
            style={{ opacity: 1 - (i + 1) * 0.2, transform: `translateY(${(i + 1) * 26}px) scale(${1 - (i + 1) * 0.05})`, zIndex: -1 - i }}
            type="button"
          >
            <span className="text-muted-foreground flex items-center gap-1.5 pb-1.5 text-[11px] font-medium">
              {s === "add" ? (
                <>
                  <Plus className="size-3" /> Подключить провайдера
                </>
              ) : (
                <>
                  {i === 0 && "Далее: "}
                  {providerBy(s).title}
                  <HealthDot health={(panel.list.find((x) => x.kind === s) as PanelProvider).health} />
                </>
              )}
            </span>
          </button>
        ))}

        <div
          className={cn(
            "animate-in fade-in fill-mode-both duration-300 ease-out motion-reduce:animate-none",
            dir > 0 ? "slide-in-from-right-8" : "slide-in-from-left-8"
          )}
          key={slot}
          style={{ perspective: 1600 }}
        >
          {slot === "add" || !p ? (
            <Frame className={cn(SURFACE, "shadow-lg")} spacing="lg" stacked>
              {nav}
              <Separator className="opacity-60" />
              <AddFace
                connected={panel.list.map((x) => x.kind)}
                onConnected={(c) => {
                  panel.add(c);
                  setFresh(c.kind);
                  setDir(1);
                  setSlot(c.kind);
                }}
              />
            </Frame>
          ) : (
            <div
              className="grid transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
              style={{ transform: flipped ? "rotateY(180deg)" : "none", transformStyle: "preserve-3d" }}
            >
              <Frame className={cn(SURFACE, "shadow-lg [grid-area:1/1] [backface-visibility:hidden]")} spacing="lg" stacked>
                {nav}
                <Separator className="opacity-60" />
                <FrontFace fresh={fresh === p.kind} onFlip={() => setFlipped(true)} p={p} panel={panel} />
              </Frame>
              <Frame
                aria-hidden={!flipped}
                className={cn(SURFACE, "shadow-lg [grid-area:1/1] [backface-visibility:hidden] [transform:rotateY(180deg)]")}
                inert={!flipped}
                spacing="lg"
                stacked
              >
                {nav}
                <Separator className="opacity-60" />
                <BackFace onFlip={() => setFlipped(false)} p={p} panel={panel} />
              </Frame>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const FrontFace = ({ panel, p, onFlip, fresh }: { panel: Panel; p: PanelProvider; onFlip: () => void; fresh: boolean }) => {
  const spec = providerBy(p.kind);
  return (
    <>
      <FrameHeader className="flex-row items-start justify-between gap-4 pt-4!">
        <div className="flex items-center gap-3">
          <ProviderMark kind={p.kind} size="lg" />
          <div className="flex flex-col gap-1">
            <FrameTitle className="flex items-center gap-2 text-xl">
              {spec.title} <HealthBadge health={p.health} />
              {fresh && (
                <Badge size="sm" variant="info-light">
                  только что
                </Badge>
              )}
            </FrameTitle>
            <FrameDescription className="flex items-center gap-2">
              <RouteBadge route={p.route} /> в чате {visibleInChat(p)} из {spec.models.length}
            </FrameDescription>
          </div>
        </div>
        <div className="flex gap-1">
          <RecheckButton p={p} panel={panel} />
          <Button onClick={onFlip} size="sm" variant="outline">
            <RotateCw /> Подключение
          </Button>
        </div>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3">
        {p.health.state === "error" && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Ключ не работает с {p.health.since}</AlertTitle>
            <AlertDescription>{p.health.message}</AlertDescription>
            <div className="col-start-2 mt-2">
              <Button onClick={onFlip} size="sm" variant="outline">
                Заменить ключ
              </Button>
            </div>
          </Alert>
        )}
        <ModelSwitchList className="max-h-80" p={p} panel={panel} />
        {spec.hiddenCount > 0 && <p className="text-muted-foreground text-xs">Ещё {spec.hiddenCount} не для чата: {spec.hiddenNote}.</p>}
      </FramePanel>
    </>
  );
};

const BackFace = ({ panel, p, onFlip }: { panel: Panel; p: PanelProvider; onFlip: () => void }) => {
  const spec = providerBy(p.kind);
  return (
    <>
      <FrameHeader className="flex-row items-start justify-between gap-4 pt-4!">
        <div className="flex items-center gap-3">
          <ProviderMark kind={p.kind} size="lg" />
          <div className="flex flex-col gap-1">
            <FrameTitle className="text-xl">Подключение {spec.title}</FrameTitle>
            <FrameDescription>Ключ, маршрут и отключение. Изменения вступают в силу сразу.</FrameDescription>
          </div>
        </div>
        <Button onClick={onFlip} size="sm" variant="outline">
          <Undo2 /> К моделям
        </Button>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-6">
        <KeyField onDone={onFlip} p={p} panel={panel} />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Маршрут</span>
          <RouteSelect className="w-full" p={p} panel={panel} />
          <span className="text-muted-foreground text-xs">Остальные провайдеры это не затрагивает.</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <span className="text-muted-foreground text-xs">Ключ удалится, модели пропадут из чата, история останется.</span>
          <DisconnectButton p={p} panel={panel} />
        </div>
      </FramePanel>
    </>
  );
};

/** The last card: the onboarding flow, inside the deck. */
const AddFace = ({ connected, onConnected }: { connected: ProviderKind[]; onConnected: (c: Connected) => void }) => {
  const [kind, setKind] = useState<ProviderKind | null>(null);
  return (
    <>
      <FrameHeader className="gap-1 pt-4!">
        <FrameTitle className="text-xl">{kind ? `Ключ ${providerBy(kind).title}` : "Подключить провайдера"}</FrameTitle>
        <FrameDescription>{kind ? `${providerBy(kind).blurb}. Ключ проверим сразу.` : "Ключ проверим сразу, при блокировке подберём прокси."}</FrameDescription>
      </FrameHeader>
      <FramePanel>
        {kind ? (
          <div className="flex flex-col gap-3">
            <ConnectForm
              key={kind}
              kind={kind}
              large
              onDone={(route) => onConnected({ fresh: true, kind, models: new Set(), route })}
              onSwitchProvider={() => setKind(null)}
            />
            <Button className="text-muted-foreground w-fit" onClick={() => setKind(null)} size="sm" variant="ghost">
              <ArrowLeft /> Другой провайдер
            </Button>
          </div>
        ) : (
          <ProviderList connected={connected} onPick={setKind} size="sm" />
        )}
      </FramePanel>
    </>
  );
};
