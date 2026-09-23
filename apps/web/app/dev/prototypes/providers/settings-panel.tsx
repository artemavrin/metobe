"use client";

// Direction: master–detail — providers list on the left, the selected provider with its models table on the right.
import { Button } from "@purr/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@purr/ui/components/item";
import { Alert, AlertAction, AlertDescription } from "@purr/ui/components/reui/alert";
import { Badge } from "@purr/ui/components/reui/badge";
import { Frame, FramePanel } from "@purr/ui/components/reui/frame";
import { ToggleGroup, ToggleGroupItem } from "@purr/ui/components/toggle-group";
import { cn } from "@purr/ui/lib/utils";
import { Boxes, Mail, MessageSquare, Network, Plus, RefreshCw, Search, Server, Sparkles, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ConnectDialog, type Connected, seedConnected } from "../_p7/connect-dialog";
import { models as nModels, type ProviderKind, providerBy, recommendedIds, SAMPLE_KEYS } from "../_p7/mock";
import { ModelsGrid, type ModelRow } from "../_p7/models-grid";
import { ProviderMark, RouteBadge } from "../_p7/shared";

const NAV = [
  { icon: Server, label: "Провайдеры" },
  { icon: Boxes, label: "Модели" },
  { icon: Network, label: "Прокси" },
  { icon: Users, label: "Пользователи" },
  { icon: Mail, label: "Почта" },
];

type Filter = "all" | "on" | "off";

export const SettingsPanel = () => {
  const [connected, setConnected] = useState<Connected[]>(seedConnected);
  const [selected, setSelected] = useState<ProviderKind>("openai");
  const [dialog, setDialog] = useState(false);
  const enabled = connected.reduce((n, c) => n + c.models.size, 0);
  const current = connected.find((c) => c.kind === selected) ?? connected[0];

  const update = useCallback((c: Connected) => setConnected((all) => all.map((x) => (x.kind === c.kind ? c : x))), []);

  return (
    <div className="bg-background flex h-dvh text-sm">
      <aside className="bg-sidebar flex w-56 shrink-0 flex-col gap-1 border-r p-2">
        <div className="flex h-10 items-center px-2 font-semibold">Purr</div>
        <Button className="justify-start" variant="ghost">
          <MessageSquare /> Чат
          <Badge className="ml-auto" size="sm" variant="secondary">
            {enabled}
          </Badge>
        </Button>
        <p className="text-muted-foreground mt-3 px-2 pb-1 text-[11px] font-medium tracking-wider uppercase">Настройки</p>
        {NAV.map(({ icon: Icon, label }, i) => (
          <Button className={cn("justify-start", i === 0 ? "bg-sidebar-accent" : "text-muted-foreground")} key={label} variant="ghost">
            <Icon /> {label}
          </Button>
        ))}
        <div className="text-muted-foreground mt-auto px-2 py-2 text-xs">Артём · админ</div>
      </aside>

      <section className="flex w-72 shrink-0 flex-col border-r">
        <div className="flex h-12 items-center justify-between border-b px-3">
          <span className="font-medium">Провайдеры</span>
          <Button onClick={() => setDialog(true)} size="sm" variant="ghost">
            <Plus /> Добавить
          </Button>
        </div>
        <ItemGroup className="gap-1 p-2">
          {connected.map((c) => (
            <Item
              className={cn("cursor-pointer", c.kind === current?.kind ? "bg-muted" : "hover:bg-muted/50")}
              key={c.kind}
              render={<button onClick={() => setSelected(c.kind)} type="button" />}
              size="sm"
            >
              <ItemMedia>
                <ProviderMark kind={c.kind} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {providerBy(c.kind).title}
                  <span className="bg-success size-1.5 rounded-full" />
                </ItemTitle>
                <ItemDescription>
                  {c.models.size} из {providerBy(c.kind).models.length} · {c.route.kind === "direct" ? "напрямую" : c.route.proxy.title}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </section>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {current && <ProviderDetail connected={current} key={current.kind} onChange={update} />}
      </main>

      <ConnectDialog
        connected={connected.map((c) => c.kind)}
        onConnected={(c) => {
          setConnected((all) => [...all.filter((x) => x.kind !== c.kind), c]);
          setSelected(c.kind);
        }}
        onOpenChange={setDialog}
        open={dialog}
      />
    </div>
  );
};

const ProviderDetail = ({ connected, onChange }: { connected: Connected; onChange: (c: Connected) => void }) => {
  const spec = providerBy(connected.kind);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo<ModelRow[]>(
    () =>
      spec.models
        .map((model) => ({ key: model.id, kind: spec.kind, model, on: connected.models.has(model.id) }))
        .filter((r) => (filter === "on" ? r.on : filter === "off" ? !r.on : true))
        .filter((r) => `${r.model.title} ${r.model.id} ${r.model.vendor}`.toLowerCase().includes(q.toLowerCase())),
    [spec, connected.models, filter, q]
  );

  const setModels = (models: Set<string>) => onChange({ ...connected, fresh: false, models });
  const onToggle = useCallback(
    (row: ModelRow, on: boolean) => {
      const next = new Set(connected.models);
      if (on) next.add(row.model.id);
      else next.delete(row.model.id);
      onChange({ ...connected, fresh: false, models: next });
    },
    [connected, onChange]
  );

  return (
    <div className="flex flex-col gap-5 p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ProviderMark kind={spec.kind} size="lg" />
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              {spec.title}
              <Badge variant="success-light">работает</Badge>
            </h1>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <RouteBadge route={connected.route} />
              <span>ключ ••••{SAMPLE_KEYS[spec.kind].slice(-4)}</span>
              <span>проверен 2 мин назад</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline">
            <RefreshCw /> Проверить
          </Button>
          <Button size="sm" variant="outline">
            Изменить
          </Button>
        </div>
      </header>

      {connected.fresh && (
        <Alert className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 ease-out" variant="success">
          <Sparkles />
          <AlertDescription>
            Нашлось {nModels(spec.models.length + spec.hiddenCount)}, включили {connected.models.size} рекомендованных.
          </AlertDescription>
          <AlertAction>
            <Button onClick={() => onChange({ ...connected, fresh: false })} size="xs" variant="ghost">
              Понятно
            </Button>
          </AlertAction>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-64">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput onChange={(e) => setQ(e.target.value)} placeholder="Найти модель" value={q} />
        </InputGroup>
        <ToggleGroup
          onValueChange={(v) => setFilter((v[0] as Filter) ?? "all")}
          size="sm"
          spacing={0}
          value={[filter]}
          variant="outline"
        >
          <ToggleGroupItem value="all">Все</ToggleGroupItem>
          <ToggleGroupItem value="on">Включённые</ToggleGroupItem>
          <ToggleGroupItem value="off">Выключенные</ToggleGroupItem>
        </ToggleGroup>
        <div className="ml-auto flex gap-1">
          <Button onClick={() => setModels(recommendedIds(spec))} size="sm" variant="ghost">
            Рекомендованные
          </Button>
          <Button onClick={() => setModels(new Set(spec.models.map((m) => m.id)))} size="sm" variant="ghost">
            Включить все
          </Button>
          <Button onClick={() => setModels(new Set())} size="sm" variant="ghost">
            Выключить все
          </Button>
        </div>
      </div>

      <Frame>
        <FramePanel className="overflow-hidden p-0!">
          <ModelsGrid onToggle={onToggle} rows={rows} />
        </FramePanel>
      </Frame>
      {spec.hiddenCount > 0 && (
        <p className="text-muted-foreground -mt-2 text-xs">
          Ещё {spec.hiddenCount} моделей не для чата: {spec.hiddenNote}.
        </p>
      )}
    </div>
  );
};
