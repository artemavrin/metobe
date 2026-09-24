"use client";

// «Панель 2»: the panel's structure (providers | provider) in the onboarding's look — soft page, raised cards,
// a status row on top, facts you can act on, models as calm rows that open in place.
import { Button } from "@purr/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import { Badge } from "@purr/ui/components/reui/badge";
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { Separator } from "@purr/ui/components/separator";
import { Switch } from "@purr/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@purr/ui/components/toggle-group";
import { cn } from "@purr/ui/lib/utils";
import { Braces, Brain, ChevronDown, Eye, KeyRound, Plus, Search, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import { ConnectDialog } from "../_p7/connect-dialog";
import { byNewest, type Caps, fmtContext, fmtPrice, isNew, type Model, models as nModels, providerBy } from "../_p7/mock";
import { NO_AUTOFILL, ProviderMark } from "../_p7/shared";
import {
  DisconnectButton,
  HealthDot,
  KeyField,
  type Panel,
  type PanelProvider,
  PriceFields,
  RecheckButton,
  RouteSelect,
  routeLabel,
  Sparkline,
  usageOf,
  usePanel,
  visibleInChat,
} from "./panel/common";

const SURFACE = "bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))]";

/** Height-animated disclosure without measuring: grid rows 0fr → 1fr. Content mounts on first open and stays for the close. */
const Collapse = ({ open, children }: { open: boolean; children: React.ReactNode }) => {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return (
  <div
    aria-hidden={!open}
    className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
    inert={!open}
  >
    <div className="min-h-0 overflow-hidden">{seen ? children : null}</div>
  </div>
  );
};

export const Panel2 = () => {
  const panel = usePanel();
  const [dialog, setDialog] = useState(false);
  const p = panel.current;
  return (
    <div className="bg-muted/40 flex h-full min-h-0 text-sm">
      <aside className="flex w-72 shrink-0 flex-col gap-1 overflow-y-auto border-r px-3 py-5">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="font-semibold">Провайдеры</span>
          <span className="text-muted-foreground text-xs tabular-nums">{panel.list.length}</span>
        </div>
        {panel.list.map((x) => {
          const active = x.kind === p?.kind;
          return (
            <button
              className={cn(
                "flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-[background-color,box-shadow] duration-150 ease-out",
                active ? "bg-background ring-border shadow-sm ring-1" : "hover:bg-background/60"
              )}
              key={x.kind}
              onClick={() => panel.setSelected(x.kind)}
              type="button"
            >
              <ProviderMark kind={x.kind} size="default" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{providerBy(x.kind).title}</span>
                <span className={cn("flex items-center gap-1.5 truncate text-xs", x.health.state === "error" ? "text-destructive" : "text-muted-foreground")}>
                  <HealthDot health={x.health} />
                  {x.health.state === "error" ? "ключ не работает" : `${visibleInChat(x)} в чате · ${routeLabel(x)}`}
                </span>
              </span>
            </button>
          );
        })}
        <button
          className="text-muted-foreground hover:text-foreground hover:border-foreground/25 mt-2 flex items-center gap-3 rounded-xl border border-dashed px-2.5 py-2.5 text-left transition-colors"
          onClick={() => setDialog(true)}
          type="button"
        >
          <span className="bg-background flex size-10 items-center justify-center rounded-lg border">
            <Plus className="size-4" />
          </span>
          Подключить провайдера
        </button>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {p && <Detail key={p.kind} p={p} panel={panel} />}
      </main>
      <ConnectDialog connected={panel.list.map((x) => x.kind)} onConnected={panel.add} onOpenChange={setDialog} open={dialog} />
    </div>
  );
};

const Detail = ({ panel, p }: { panel: Panel; p: PanelProvider }) => {
  const spec = providerBy(p.kind);
  const broken = p.health.state === "error";
  const [keyOpen, setKeyOpen] = useState(broken);
  const [prices, setPrices] = useState<Record<string, { input: number; output: number }>>({});
  const models = useMemo(
    () => [...spec.models].sort(byNewest).map((m) => (prices[m.id] && m.price ? { ...m, price: { ...m.price, ...prices[m.id] } } : m)),
    [spec, prices]
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both mx-auto flex max-w-3xl flex-col gap-5 px-8 py-8 duration-200 ease-out">
      {/* The provider card */}
      <Frame className={cn(SURFACE, "shadow-sm")} spacing="lg" stacked>
        <div className="flex h-6 items-center justify-between px-(--frame-panel-header-px) pt-3 pb-4 box-content">
          <span className={cn("flex items-center gap-2 text-xs font-medium", broken ? "text-destructive" : "text-muted-foreground")}>
            <HealthDot health={p.health} />
            {p.health.state === "ok" && `Работает · проверен ${p.health.checked}`}
            {p.health.state === "checking" && "Проверяем ключ и маршрут…"}
            {p.health.state === "error" && `Ключ не работает с ${p.health.since}`}
          </span>
          <span className="flex items-center gap-1">
            <RecheckButton p={p} panel={panel} size="xs" />
            <DisconnectButton compact p={p} panel={panel} />
          </span>
        </div>
        <Separator className="opacity-60" />
        <FrameHeader className="flex-row items-center gap-4 pt-4!">
          <ProviderMark kind={p.kind} size="xl" />
          <div className="flex flex-col gap-1">
            <FrameTitle className="text-xl">{spec.title}</FrameTitle>
            <FrameDescription>{spec.blurb}</FrameDescription>
          </div>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-4">
          {broken && p.health.state === "error" && (
            <div className="border-destructive/25 bg-destructive/5 flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
              <span className="text-sm">{p.health.message}</span>
              {!keyOpen && (
                <Button className="shrink-0" onClick={() => setKeyOpen(true)} size="sm">
                  Заменить ключ
                </Button>
              )}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Fact label="Ключ">
              <span className="flex items-center justify-between gap-2">
                <span className={cn("flex items-center gap-1.5 font-mono", broken && "text-destructive")}>
                  <KeyRound className="text-muted-foreground size-3.5" />
                  ••••{p.keyTail}
                </span>
                <Button onClick={() => setKeyOpen((v) => !v)} size="xs" variant="ghost">
                  {keyOpen ? "Отмена" : "Заменить"}
                </Button>
              </span>
            </Fact>
            <Fact label="Маршрут">
              <RouteSelect className="h-7 w-full border-0 bg-transparent! px-0 shadow-none" p={p} panel={panel} />
            </Fact>
            <Fact label="В чате">
              <span className="flex items-baseline gap-1.5">
                <span className="text-lg font-semibold tabular-nums">{visibleInChat(p)}</span>
                <span className="text-muted-foreground text-xs">из {nModels(spec.models.length)}</span>
              </span>
            </Fact>
          </div>
          <Collapse open={keyOpen}>
            <div className="bg-background rounded-xl border p-4">
              <KeyField onDone={() => setKeyOpen(false)} p={p} panel={panel} />
            </div>
          </Collapse>
        </FramePanel>
      </Frame>

      <ModelsCard models={models} onPrice={(id, v) => setPrices((all) => ({ ...all, [id]: v }))} p={p} panel={panel} prices={prices} />

      <UsageCard p={p} />
    </div>
  );
};

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="bg-background flex min-h-18 flex-col justify-between gap-1 rounded-xl border px-3 py-2.5">
    <span className="text-muted-foreground text-xs">{label}</span>
    {children}
  </div>
);

type Filter = "all" | "on";

const ModelsCard = ({
  panel,
  p,
  models,
  prices,
  onPrice,
}: {
  panel: Panel;
  p: PanelProvider;
  models: Model[];
  prices: Record<string, { input: number; output: number }>;
  onPrice: (id: string, v: { input: number; output: number }) => void;
}) => {
  const spec = providerBy(p.kind);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const vendors = new Set(spec.models.map((m) => m.vendor)).size > 1;
  const shown = models
    .filter((m) => filter === "all" || p.models.has(m.id))
    .filter((m) => `${m.title} ${m.id} ${m.vendor}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Frame className={cn(SURFACE, "shadow-sm")} spacing="lg" stacked>
      <FrameHeader className="flex-row items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <FrameTitle className="text-base">Модели</FrameTitle>
          <FrameDescription>
            {p.models.size} из {spec.models.length} в чате · новые сверху
          </FrameDescription>
        </div>
        <div className="flex items-center gap-2">
          {spec.models.length > 6 && (
            <InputGroup className="bg-background w-52">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput {...NO_AUTOFILL} onChange={(e) => setQ(e.target.value)} placeholder="Найти" value={q} />
            </InputGroup>
          )}
          <ToggleGroup className="bg-background rounded-lg" onValueChange={(v) => setFilter((v[0] as Filter) ?? "all")} size="sm" spacing={0} value={[filter]} variant="outline">
            <ToggleGroupItem value="all">Все</ToggleGroupItem>
            <ToggleGroupItem value="on">В чате</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </FrameHeader>
      <FramePanel className="p-1!">
        <ul className="flex flex-col">
          {shown.map((m) => {
            const on = p.models.has(m.id);
            const expanded = open === m.id;
            return (
              <li className={cn("rounded-lg transition-colors duration-150", expanded && "bg-muted/40")} key={m.id}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setOpen(expanded ? null : m.id)}
                    type="button"
                  >
                    <ChevronDown className={cn("text-muted-foreground size-3.5 shrink-0 transition-transform duration-200 ease-out", !expanded && "-rotate-90")} />
                    <span className={cn("truncate font-medium", !on && "text-muted-foreground")}>{m.title}</span>
                    {isNew(m) && (
                      <Badge size="sm" variant="info-light">
                        новая
                      </Badge>
                    )}
                    {vendors && <span className="text-muted-foreground truncate text-xs">{m.vendor}</span>}
                    <span className="text-muted-foreground ml-auto hidden shrink-0 text-xs tabular-nums sm:inline">{fmtContext(m.context)}</span>
                    <span className={cn("text-muted-foreground w-28 shrink-0 text-right text-xs tabular-nums", prices[m.id] && "text-warning-foreground dark:text-warning")}>
                      {fmtPrice(m)}
                    </span>
                  </button>
                  <Switch aria-label={`${m.title} в чате`} checked={on} onCheckedChange={(v) => panel.toggleModel(p.kind, m.id, v)} />
                </div>
                <Collapse open={expanded}>
                  <ModelDetails custom={Boolean(prices[m.id])} m={m} onPrice={(v) => onPrice(m.id, v)} />
                </Collapse>
              </li>
            );
          })}
          {!shown.length && <li className="text-muted-foreground px-3 py-8 text-center">Ничего не нашлось</li>}
        </ul>
      </FramePanel>
      <FrameFooter className="flex-row items-center justify-between">
        <span className="flex gap-1">
          <Button onClick={() => panel.setModels(p.kind, new Set([...p.models, ...shown.map((m) => m.id)]))} size="xs" variant="ghost">
            Включить показанные
          </Button>
          <Button onClick={() => panel.setModels(p.kind, new Set())} size="xs" variant="ghost">
            Выключить все
          </Button>
        </span>
        {spec.hiddenCount > 0 && <FrameDescription className="text-xs">ещё {spec.hiddenCount} не для чата</FrameDescription>}
      </FrameFooter>
    </Frame>
  );
};

const CAPS: { key: keyof Caps; label: string; icon: typeof Wrench }[] = [
  { icon: Wrench, key: "tools", label: "Инструменты" },
  { icon: Eye, key: "vision", label: "Картинки" },
  { icon: Brain, key: "reasoning", label: "Рассуждение" },
  { icon: Braces, key: "structured", label: "JSON" },
];

const ModelDetails = ({ m, custom, onPrice }: { m: Model; custom: boolean; onPrice: (v: { input: number; output: number }) => void }) => (
  <div className="grid grid-cols-[1fr_auto] gap-6 px-3 pt-1 pb-4 pl-9">
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {CAPS.map(({ key, label, icon: Icon }) => {
          const v = m.caps[key];
          return (
            <Badge key={key} size="lg" variant={v === true ? "success-light" : v === false ? "outline" : "warning-light"}>
              <Icon /> {label}
              {v === null ? " · не проверено" : v ? "" : " · нет"}
            </Badge>
          );
        })}
      </div>
      <span className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>Контекст {fmtContext(m.context)}</span>
        <span>Выпущена {m.released ? new Date(m.released).toLocaleDateString("ru") : "—"}</span>
        <span className="font-mono">{m.id}</span>
      </span>
    </div>
    {m.price && (
      <div className="flex w-56 flex-col gap-1.5">
        <span className="flex items-center gap-2 text-xs font-medium">
          Цена за 1M, {m.price.currency === "RUB" ? "₽" : "$"}
          {custom && (
            <Badge size="sm" variant="warning-light">
              своя
            </Badge>
          )}
        </span>
        <PriceFields key={fmtPrice(m)} onCommit={onPrice} price={{ input: m.price.input, output: m.price.output }} />
      </div>
    )}
  </div>
);

const UsageCard = ({ p }: { p: PanelProvider }) => {
  const spec = providerBy(p.kind);
  const enabled = spec.models.filter((m) => p.models.has(m.id));
  const on = p.health.state !== "error";
  const week = enabled.reduce((acc, m) => usageOf(p.kind, m, on).days.map((d, i) => d + (acc[i] ?? 0)), [0, 0, 0, 0, 0, 0, 0]);
  const requests = week.reduce((a, b) => a + b, 0);
  const cost = enabled.reduce((a, m) => a + usageOf(p.kind, m, on).cost, 0);
  const rub = spec.models[0]?.price?.currency === "RUB";
  return (
    <Frame className={cn(SURFACE, "shadow-sm")} spacing="lg">
      <FramePanel className="flex items-center justify-between gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs">Расход за 7 дней</span>
          <span className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tabular-nums">{rub ? `${cost.toFixed(0)} ₽` : `$${cost.toFixed(2)}`}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{requests.toLocaleString("ru")} запросов</span>
          </span>
        </div>
        <Sparkline bar="w-2.5 rounded-sm" className="h-9 gap-1" days={week} />
      </FramePanel>
    </Frame>
  );
};
