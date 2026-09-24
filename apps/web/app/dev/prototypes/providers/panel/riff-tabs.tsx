"use client";

// Riff «Вкладки»: the provider page splits into Модели / Подключение / Расход.
import { Button } from "@purr/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import { Alert, AlertDescription, AlertTitle } from "@purr/ui/components/reui/alert";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@purr/ui/components/tabs";
import { ToggleGroup, ToggleGroupItem } from "@purr/ui/components/toggle-group";
import { CircleAlert, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ConnectDialog } from "../../_p7/connect-dialog";
import { byNewest, fmtPrice, providerBy } from "../../_p7/mock";
import { ModelsGrid, type ModelRow } from "../../_p7/models-grid";
import { NO_AUTOFILL, ProviderMark, RouteBadge } from "../../_p7/shared";
import {
  DisconnectButton,
  HealthBadge,
  KeyField,
  type Panel,
  type PanelProvider,
  ProvidersColumn,
  RecheckButton,
  RouteSelect,
  Sparkline,
  usageOf,
  usePanel,
  visibleInChat,
} from "./common";

export const PanelTabs = () => {
  const panel = usePanel();
  const [dialog, setDialog] = useState(false);
  const p = panel.current;
  return (
    <div className="flex h-full min-h-0 text-sm">
      <ProvidersColumn onAdd={() => setDialog(true)} panel={panel} />
      <main className="min-w-0 flex-1 overflow-y-auto">{p && <Detail key={p.kind} p={p} panel={panel} />}</main>
      <ConnectDialog connected={panel.list.map((x) => x.kind)} onConnected={panel.add} onOpenChange={setDialog} open={dialog} />
    </div>
  );
};

const Detail = ({ panel, p }: { panel: Panel; p: PanelProvider }) => {
  const spec = providerBy(p.kind);
  const [tab, setTab] = useState(p.health.state === "error" ? "connection" : "models");
  return (
    <div className="flex flex-col gap-5 p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ProviderMark kind={p.kind} size="lg" />
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              {spec.title} <HealthBadge health={p.health} />
            </h1>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs whitespace-nowrap">
              <RouteBadge route={p.route} />
              <span>ключ ••••{p.keyTail}</span>
              {p.health.state === "ok" && <span>проверен {p.health.checked}</span>}
              <span>· в чате {visibleInChat(p)}</span>
            </div>
          </div>
        </div>
        <RecheckButton p={p} panel={panel} />
      </header>

      {p.health.state === "error" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Ключ не работает с {p.health.since}</AlertTitle>
          <AlertDescription>{p.health.message}</AlertDescription>
          <div className="col-start-2 mt-2">
            <Button onClick={() => setTab("connection")} size="sm" variant="outline">
              Заменить ключ
            </Button>
          </div>
        </Alert>
      )}

      <Tabs onValueChange={(v) => setTab(String(v))} value={tab}>
        <TabsList variant="line">
          <TabsTrigger value="models">Модели · {p.models.size}</TabsTrigger>
          <TabsTrigger value="connection">Подключение</TabsTrigger>
          <TabsTrigger value="usage">Расход</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="models">
          <ModelsTab p={p} panel={panel} />
        </TabsContent>
        <TabsContent className="flex flex-col gap-4 pt-4" value="connection">
          <Frame stacked>
            <FrameHeader>
              <FrameTitle>Ключ</FrameTitle>
              <FrameDescription>Хранится зашифрованным. Замена вступает в силу после проверки.</FrameDescription>
            </FrameHeader>
            <FramePanel>
              <KeyField onDone={() => setTab("models")} p={p} panel={panel} />
            </FramePanel>
          </Frame>
          <Frame stacked>
            <FrameHeader>
              <FrameTitle>Маршрут</FrameTitle>
              <FrameDescription>Как запросы к {spec.title} выходят в интернет.</FrameDescription>
            </FrameHeader>
            <FramePanel className="flex items-center gap-3">
              <RouteSelect p={p} panel={panel} />
              <span className="text-muted-foreground text-xs">Остальные провайдеры это не затрагивает.</span>
            </FramePanel>
          </Frame>
          <Frame stacked>
            <FrameHeader>
              <FrameTitle>Отключение</FrameTitle>
              <FrameDescription>Ключ удалится, модели пропадут из чата, история останется.</FrameDescription>
            </FrameHeader>
            <FramePanel>
              <DisconnectButton p={p} panel={panel} />
            </FramePanel>
          </Frame>
        </TabsContent>
        <TabsContent className="pt-4" value="usage">
          <UsageTab p={p} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

type Filter = "all" | "on" | "off";

const ModelsTab = ({ panel, p }: { panel: Panel; p: PanelProvider }) => {
  const spec = providerBy(p.kind);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useMemo<ModelRow[]>(
    () =>
      [...spec.models]
        .sort(byNewest)
        .map((model) => ({ key: model.id, kind: p.kind, model, on: p.models.has(model.id) }))
        .filter((r) => (filter === "on" ? r.on : filter === "off" ? !r.on : true))
        .filter((r) => `${r.model.title} ${r.model.id} ${r.model.vendor}`.toLowerCase().includes(q.toLowerCase())),
    [spec, p, filter, q]
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-64">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput {...NO_AUTOFILL} onChange={(e) => setQ(e.target.value)} placeholder="Найти модель" value={q} />
        </InputGroup>
        <ToggleGroup onValueChange={(v) => setFilter((v[0] as Filter) ?? "all")} size="sm" spacing={0} value={[filter]} variant="outline">
          <ToggleGroupItem value="all">Все</ToggleGroupItem>
          <ToggleGroupItem value="on">Включённые</ToggleGroupItem>
          <ToggleGroupItem value="off">Выключенные</ToggleGroupItem>
        </ToggleGroup>
        <div className="ml-auto flex gap-1">
          <Button onClick={() => panel.setModels(p.kind, new Set([...p.models, ...rows.map((r) => r.model.id)]))} size="sm" variant="ghost">
            Включить показанные
          </Button>
          <Button onClick={() => panel.setModels(p.kind, new Set())} size="sm" variant="ghost">
            Выключить все
          </Button>
        </div>
      </div>
      <Frame>
        <FramePanel className="overflow-hidden p-0!">
          <ModelsGrid onToggle={(r, on) => panel.toggleModel(p.kind, r.model.id, on)} rows={rows} />
        </FramePanel>
      </Frame>
      {p.health.state === "error" && <p className="text-destructive text-xs">Пока ключ не работает, включённые модели в чате не видны.</p>}
    </div>
  );
};

const UsageTab = ({ p }: { p: PanelProvider }) => {
  const spec = providerBy(p.kind);
  const rows = spec.models
    .filter((m) => p.models.has(m.id))
    .map((m) => ({ m, u: usageOf(p.kind, m, true) }))
    .sort((a, b) => b.u.requests - a.u.requests);
  const total = rows.reduce((a, r) => a + r.u.cost, 0);
  const requests = rows.reduce((a, r) => a + r.u.requests, 0);
  const cur = spec.models[0]?.price?.currency === "RUB" ? "₽" : "$";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 divide-x rounded-xl border">
        {[
          ["Запросов за 7 дней", requests.toLocaleString("ru")],
          ["Стоимость", `${cur === "$" ? "$" : ""}${total.toFixed(2)}${cur === "₽" ? " ₽" : ""}`],
          ["Активных моделей", String(rows.length)],
        ].map(([label, value]) => (
          <div className="flex flex-col gap-0.5 px-4 py-3" key={label}>
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="text-lg font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </div>
      <Frame>
        <FramePanel className="p-0!">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground bg-muted/40 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Модель</th>
                <th className="px-3 py-2 font-medium">7 дней</th>
                <th className="px-3 py-2 text-right font-medium">Запросов</th>
                <th className="px-3 py-2 text-right font-medium">Стоимость</th>
                <th className="px-3 py-2 text-right font-medium">Цена за 1M</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ m, u }) => (
                <tr key={m.id}>
                  <td className="px-3 py-2.5 font-medium">{m.title}</td>
                  <td className="px-3 py-2.5">
                    <Sparkline days={u.days} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{u.requests}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {cur === "$" ? `$${u.cost.toFixed(2)}` : `${u.cost.toFixed(2)} ₽`}
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">{fmtPrice(m)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="text-muted-foreground px-3 py-8 text-center" colSpan={5}>
                    Нет включённых моделей — нечего считать
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </FramePanel>
      </Frame>
      <p className="text-muted-foreground text-xs">По нашей истории запросов (`model_runs`). У AI Gateway стоимость уточняется фактической после ответа провайдера.</p>
    </div>
  );
};
