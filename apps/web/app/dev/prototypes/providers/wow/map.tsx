"use client";

// «Схема»: a live route map. Metobe → direct / a proxy → each provider; request dots run along the lines,
// a broken key is a red dashed line. Changing a route re-draws the line. The selected node opens below.
import { Alert, AlertDescription, AlertTitle } from "@metobe/ui/components/reui/alert";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@metobe/ui/components/reui/frame";
import { cn } from "@metobe/ui/lib/utils";
import { CircleAlert, Globe, Plus, Route } from "lucide-react";
import { useState } from "react";

import { ConnectDialog } from "../../_p7/connect-dialog";
import { PROXIES, providerBy } from "../../_p7/mock";
import { ProviderMark } from "../../_p7/shared";
import {
  DisconnectButton,
  HealthBadge,
  HealthDot,
  KeyField,
  type PanelProvider,
  RecheckButton,
  RouteSelect,
  usePanel,
  visibleInChat,
} from "../panel/common";
import { ModelSwitchList } from "./parts";

const W = 1000;
const H = 300;
const X = { lane: 500, provider: 850, metobe: 130 };

const LANES = [{ id: "direct", title: "Напрямую" }, ...PROXIES.map((p) => ({ id: p.id, title: p.title }))];
const laneOf = (p: PanelProvider) => (p.route.kind === "direct" ? "direct" : p.route.proxy.id);
const spread = (i: number, n: number) => (n <= 1 ? H / 2 : 50 + (i * (H - 100)) / (n - 1));

export const WowMap = () => {
  const panel = usePanel();
  const [dialog, setDialog] = useState(false);
  const [hoverLane, setHoverLane] = useState<string | null>(null);
  const p = panel.current;
  const list = panel.list;
  const nodes = [...list.map((x) => x.kind), "add" as const];
  const yProvider = (i: number) => spread(i, nodes.length);
  const yLane = (i: number) => spread(i, LANES.length);
  const total = list.reduce((a, x) => a + visibleInChat(x), 0);

  const pathOf = (x: PanelProvider, i: number) => {
    const yl = yLane(LANES.findIndex((l) => l.id === laneOf(x)));
    const yp = yProvider(i);
    return `M${X.metobe + 70},${H / 2} C${X.metobe + 220},${H / 2} ${X.lane - 180},${yl} ${X.lane - 60},${yl} L${X.lane + 60},${yl} C${X.lane + 180},${yl} ${X.provider - 180},${yp} ${X.provider - 70},${yp}`;
  };

  return (
    <div className="flex flex-col gap-6 px-6 pt-8 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Провайдеры и маршруты</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          По умолчанию всё напрямую. Точки — запросы в реальном времени. Нажмите на провайдера, чтобы открыть его.
        </p>
      </div>

      <div className="bg-muted/30 relative mx-auto aspect-[10/3] w-full max-w-5xl rounded-2xl border">
        <svg aria-hidden className="absolute inset-0 size-full" viewBox={`0 0 ${W} ${H}`}>
          <style>{`
            .route { transition: d 600ms cubic-bezier(0.23,1,0.32,1), opacity 200ms ease-out, stroke 200ms ease-out; }
            @keyframes route-check { to { stroke-dashoffset: -24 } }
            @media (prefers-reduced-motion: reduce) { .flow { display: none } .route { transition: none } }
          `}</style>
          {list.map((x, i) => {
            const d = pathOf(x, i);
            const dim = (p && p.kind !== x.kind && !hoverLane) || (hoverLane && hoverLane !== laneOf(x));
            const broken = x.health.state === "error";
            const checking = x.health.state === "checking";
            const flows = broken || checking ? 0 : Math.min(3, visibleInChat(x));
            return (
              <g key={x.kind} opacity={dim ? 0.3 : 1} style={{ transition: "opacity 200ms ease-out" }}>
                <path
                  className="route"
                  d={d}
                  fill="none"
                  stroke={broken ? "var(--destructive)" : checking ? "var(--warning)" : "var(--primary)"}
                  strokeDasharray={broken || checking ? "6 6" : undefined}
                  strokeOpacity={broken ? 0.8 : 0.45}
                  strokeWidth={p?.kind === x.kind ? 2.5 : 1.75}
                  style={{ ...(checking ? { animation: "route-check 600ms linear infinite" } : {}), d: `path("${d}")` }}
                />
                {Array.from({ length: flows }, (_, k) => (
                  <circle className="flow" fill="var(--primary)" key={`${k}-${d}`} r={3}>
                    <animateMotion begin={`${(k * 2.6) / flows}s`} dur="2.6s" path={d} repeatCount="indefinite" />
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>

        {/* Metobe */}
        <div className="bg-background absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl border px-3 py-2 shadow-sm" style={{ left: `${(X.metobe / W) * 100}%`, top: "50%" }}>
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-xs font-semibold">P</span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Metobe</span>
            <span className="text-muted-foreground text-[11px]">в чате {total}</span>
          </span>
        </div>

        {/* Lanes: direct and each proxy */}
        {LANES.map((l, i) => {
          const through = list.filter((x) => laneOf(x) === l.id);
          const proxy = PROXIES.find((x) => x.id === l.id);
          return (
            <div
              className={cn(
                "bg-background absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-xs transition-colors duration-150",
                hoverLane === l.id && "border-primary/50"
              )}
              key={l.id}
              onMouseEnter={() => setHoverLane(l.id)}
              onMouseLeave={() => setHoverLane(null)}
              style={{ left: `${(X.lane / W) * 100}%`, top: `${(yLane(i) / H) * 100}%` }}
            >
              {proxy ? <Route className="text-muted-foreground size-3.5" /> : <Globe className="text-muted-foreground size-3.5" />}
              <span className="font-medium">{l.title}</span>
              {proxy && (
                <span className="text-muted-foreground">
                  {proxy.country} · {proxy.latency} мс
                </span>
              )}
              <span className="text-muted-foreground">· {through.length}</span>
            </div>
          );
        })}

        {/* Providers */}
        {nodes.map((k, i) => {
          const style = { left: `${(X.provider / W) * 100}%`, top: `${(yProvider(i) / H) * 100}%` };
          if (k === "add")
            return (
              <button
                className="text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background/70 absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs transition-colors"
                key="add"
                onClick={() => setDialog(true)}
                style={style}
                type="button"
              >
                <Plus className="size-3.5" /> Подключить
              </button>
            );
          const x = list.find((y) => y.kind === k) as PanelProvider;
          const active = p?.kind === k;
          return (
            <button
              className={cn(
                "bg-background absolute flex w-48 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left shadow-sm transition-[box-shadow,border-color] duration-150 ease-out",
                active ? "border-primary ring-primary/20 ring-3" : "hover:border-foreground/25",
                x.health.state === "error" && !active && "border-destructive/50"
              )}
              key={k}
              onClick={() => panel.setSelected(k)}
              style={style}
              type="button"
            >
              <ProviderMark kind={k} size="sm" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {providerBy(k).title} <HealthDot health={x.health} />
                </span>
                <span className={cn("text-[11px]", x.health.state === "error" ? "text-destructive" : "text-muted-foreground")}>
                  {x.health.state === "error" ? "ключ не работает" : `в чате ${visibleInChat(x)}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {p && (
        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both mx-auto grid w-full max-w-5xl grid-cols-[1fr_360px] gap-4 duration-200 ease-out" key={p.kind}>
          <Frame stacked>
            <FrameHeader className="flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ProviderMark kind={p.kind} />
                <FrameTitle className="flex items-center gap-2 text-base">
                  {providerBy(p.kind).title} <HealthBadge health={p.health} />
                </FrameTitle>
              </div>
              <FrameDescription>в чате {visibleInChat(p)} из {providerBy(p.kind).models.length}</FrameDescription>
            </FrameHeader>
            <FramePanel className="flex flex-col gap-3">
              {p.health.state === "error" && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>Ключ не работает с {p.health.since}</AlertTitle>
                  <AlertDescription>{p.health.message} Замените ключ справа.</AlertDescription>
                </Alert>
              )}
              <ModelSwitchList className="max-h-80" p={p} panel={panel} />
            </FramePanel>
          </Frame>
          <Frame stacked>
            <FrameHeader className="flex-row items-center justify-between">
              <FrameTitle className="text-base">Подключение</FrameTitle>
              <RecheckButton p={p} panel={panel} size="xs" />
            </FrameHeader>
            <FramePanel className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Маршрут</span>
                <RouteSelect className="w-full" p={p} panel={panel} />
                <span className="text-muted-foreground text-xs">Смените — линия на схеме перестроится.</span>
              </div>
              <KeyField p={p} panel={panel} />
              <div className="border-t pt-4">
                <DisconnectButton p={p} panel={panel} />
              </div>
            </FramePanel>
          </Frame>
        </div>
      )}

      <ConnectDialog connected={list.map((x) => x.kind)} onConnected={panel.add} onOpenChange={setDialog} open={dialog} />
    </div>
  );
};

