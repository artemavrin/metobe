"use client";

// «Доска»: living provider cards — a health pulse, the route in miniature, a week of usage, model chips.
// A card expands in place into the full provider (a shared-layout morph) and folds back.
import { Button } from "@metobe/ui/components/button";
import { Alert, AlertDescription, AlertTitle } from "@metobe/ui/components/reui/alert";
import { Badge } from "@metobe/ui/components/reui/badge";
import { cn } from "@metobe/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, CircleAlert, Minimize2, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { ConnectDialog } from "../../_p7/connect-dialog";
import { byNewest, type ProviderKind, providerBy } from "../../_p7/mock";
import { ProviderMark } from "../../_p7/shared";
import {
  DisconnectButton,
  HealthBadge,
  KeyField,
  type Panel,
  type PanelProvider,
  RecheckButton,
  RouteSelect,
  routeLabel,
  Sparkline,
  usageOf,
  usePanel,
  visibleInChat,
} from "../panel/common";
import { ModelSwitchList } from "./parts";

const EASE = [0.23, 1, 0.32, 1] as const;

const Pulse = ({ p }: { p: PanelProvider }) => (
  <span className="relative flex size-2.5">
    {p.health.state !== "error" && (
      <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden", p.health.state === "ok" ? "bg-success" : "bg-warning")} />
    )}
    <span
      className={cn(
        "relative size-2.5 rounded-full",
        p.health.state === "ok" && "bg-success",
        p.health.state === "error" && "bg-destructive",
        p.health.state === "checking" && "bg-warning"
      )}
    />
  </span>
);

const MiniRoute = ({ p }: { p: PanelProvider }) => (
  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
    Metobe
    <span className={cn("h-px w-5", p.health.state === "error" ? "bg-destructive/60" : "bg-primary/50")} />
    <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px]", p.route.kind === "proxy" && "border-info/40 text-info")}>{routeLabel(p)}</span>
    <span className={cn("h-px w-5", p.health.state === "error" ? "bg-destructive/60" : "bg-primary/50")} />
    {providerBy(p.kind).title}
  </span>
);

export const WowBoard = () => {
  const panel = usePanel();
  const [open, setOpen] = useState<ProviderKind | null>(null);
  const [dialog, setDialog] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        setOpen(null);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const opened = panel.list.find((p) => p.kind === open);

  return (
    <div className="relative min-h-full px-6 pt-8 pb-24">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Провайдеры</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            В чате {panel.list.reduce((a, p) => a + visibleInChat(p), 0)} моделей от {panel.list.filter((p) => p.health.state !== "error").length} работающих провайдеров.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {panel.list.map((p) => (
            <Card key={p.kind} onOpen={() => setOpen(p.kind)} p={p} />
          ))}
          <motion.button
            className="text-muted-foreground hover:text-foreground hover:border-foreground/30 flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed transition-colors"
            onClick={() => setDialog(true)}
            type="button"
            whileTap={{ scale: 0.98 }}
          >
            <Plus className="size-5" />
            <span className="text-sm font-medium">Подключить провайдера</span>
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {opened && (
          <>
            <motion.div
              animate={{ opacity: 1 }}
              className="bg-background/60 absolute inset-0 z-10 backdrop-blur-[2px]"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="backdrop"
              onClick={() => setOpen(null)}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              className="bg-background absolute inset-4 z-20 flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
              layoutId={`card-${opened.kind}`}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <Expanded onClose={() => setOpen(null)} p={opened} panel={panel} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConnectDialog connected={panel.list.map((x) => x.kind)} onConnected={panel.add} onOpenChange={setDialog} open={dialog} />
    </div>
  );
};

const Card = ({ p, onOpen }: { p: PanelProvider; onOpen: () => void }) => {
  const spec = providerBy(p.kind);
  const enabled = [...spec.models].sort(byNewest).filter((m) => p.models.has(m.id));
  const week = enabled.reduce((acc, m) => usageOf(p.kind, m, true).days.map((d, i) => d + (acc[i] ?? 0)), [] as number[]);
  const requests = week.reduce((a, b) => a + b, 0);
  return (
    <motion.button
      className={cn(
        "bg-background group flex min-h-56 flex-col gap-4 rounded-2xl border p-5 text-left shadow-xs transition-shadow duration-200 hover:shadow-md",
        p.health.state === "error" && "border-destructive/40"
      )}
      layoutId={`card-${p.kind}`}
      onClick={onOpen}
      transition={{ duration: 0.35, ease: EASE }}
      type="button"
      whileTap={{ scale: 0.99 }}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-3">
          <ProviderMark kind={p.kind} size="default" />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">{spec.title}</span>
            <span className={cn("flex items-center gap-1.5 text-xs", p.health.state === "error" ? "text-destructive" : "text-muted-foreground")}>
              <Pulse p={p} />
              {p.health.state === "error" ? "ключ не работает" : p.health.state === "checking" ? "проверяем" : "работает"}
            </span>
          </span>
        </span>
        <ChevronRight className="text-muted-foreground size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
      </span>
      <MiniRoute p={p} />
      <span className="flex items-end justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold tabular-nums">{visibleInChat(p)}</span>
          <span className="text-muted-foreground text-xs">моделей в чате из {spec.models.length}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <Sparkline days={p.health.state === "error" ? [0, 0, 0, 0, 0, 0, 0] : week.length ? week : [0, 0, 0, 0, 0, 0, 0]} />
          <span className="text-muted-foreground text-[11px] tabular-nums">{p.health.state === "error" ? "нет запросов" : `${requests} запросов за 7 дней`}</span>
        </span>
      </span>
      <span className="mt-auto flex flex-wrap gap-1">
        {enabled.slice(0, 3).map((m) => (
          <Badge key={m.id} size="sm" variant="outline">
            {m.title}
          </Badge>
        ))}
        {enabled.length > 3 && (
          <Badge size="sm" variant="secondary">
            +{enabled.length - 3}
          </Badge>
        )}
        {!enabled.length && <span className="text-muted-foreground text-xs">Модели не включены</span>}
      </span>
    </motion.button>
  );
};

const Expanded = ({ panel, p, onClose }: { panel: Panel; p: PanelProvider; onClose: () => void }) => {
  const spec = providerBy(p.kind);
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex min-h-0 flex-1 flex-col"
      initial={{ opacity: 0 }}
      transition={{ delay: 0.12, duration: 0.2 }}
    >
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <ProviderMark kind={p.kind} size="lg" />
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              {spec.title} <HealthBadge health={p.health} />
            </h2>
            <MiniRoute p={p} />
          </div>
        </div>
        <div className="flex gap-2">
          <RecheckButton p={p} panel={panel} />
          <Button onClick={onClose} size="sm" variant="ghost">
            <Minimize2 /> Свернуть
          </Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_380px] overflow-hidden">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-6">
          {p.health.state === "error" && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Ключ не работает с {p.health.since}</AlertTitle>
              <AlertDescription>{p.health.message} Замените ключ справа.</AlertDescription>
            </Alert>
          )}
          <span className="text-sm font-medium">
            Модели · в чате {visibleInChat(p)} из {spec.models.length}
          </span>
          <ModelSwitchList p={p} panel={panel} />
        </div>
        <aside className="bg-muted/20 flex flex-col gap-6 overflow-y-auto border-l p-6">
          <KeyField p={p} panel={panel} />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Маршрут</span>
            <RouteSelect className="w-full" p={p} panel={panel} />
          </div>
          <div className="mt-auto flex flex-col gap-2 border-t pt-4">
            <span className="text-muted-foreground text-xs">Ключ удалится, модели пропадут из чата, история останется.</span>
            <DisconnectButton p={p} panel={panel} />
          </div>
        </aside>
      </div>
    </motion.div>
  );
};
