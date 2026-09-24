"use client";

// Direction: models first — one table of every model from every provider; providers are a filter strip on top.
import { Button } from "@purr/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import { Label } from "@purr/ui/components/label";
import { Badge } from "@purr/ui/components/reui/badge";
import { Frame, FrameFooter, FramePanel } from "@purr/ui/components/reui/frame";
import { Switch } from "@purr/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@purr/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@purr/ui/components/tooltip";
import { cn } from "@purr/ui/lib/utils";
import { Braces, Brain, Eye, Globe, MessageSquare, Plus, Route, Search, Wrench } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ConnectDialog, type Connected, seedConnected } from "../_p7/connect-dialog";
import { type Caps, models as nModels, type ProviderKind, providerBy } from "../_p7/mock";
import { ModelsGrid, type ModelRow } from "../_p7/models-grid";
import { ProviderMark } from "../_p7/shared";

const CAP_FILTERS: { key: keyof Caps; label: string; icon: typeof Wrench }[] = [
  { icon: Wrench, key: "tools", label: "Инструменты" },
  { icon: Eye, key: "vision", label: "Картинки" },
  { icon: Brain, key: "reasoning", label: "Рассуждение" },
  { icon: Braces, key: "structured", label: "JSON" },
];

/** `embedded`: inside the settings mode of the app shell, which brings its own header. */
export const SettingsModels = ({ embedded = false }: { embedded?: boolean }) => {
  const [connected, setConnected] = useState<Connected[]>(seedConnected);
  const [dialog, setDialog] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [caps, setCaps] = useState<string[]>([]);
  const [onlyOn, setOnlyOn] = useState(false);
  const [q, setQ] = useState("");

  const all = useMemo<ModelRow[]>(
    () =>
      connected.flatMap((c) =>
        providerBy(c.kind).models.map((model) => ({ key: `${c.kind}:${model.id}`, kind: c.kind, model, on: c.models.has(model.id) }))
      ),
    [connected]
  );
  const rows = useMemo(
    () =>
      all
        .filter((r) => !providers.length || providers.includes(r.kind))
        .filter((r) => caps.every((k) => r.model.caps[k as keyof Caps] === true))
        .filter((r) => !onlyOn || r.on)
        .filter((r) => `${r.model.title} ${r.model.id} ${r.model.vendor}`.toLowerCase().includes(q.toLowerCase())),
    [all, providers, caps, onlyOn, q]
  );
  const enabled = all.filter((r) => r.on).length;

  const onToggle = useCallback((row: ModelRow, on: boolean) => {
    setConnected((list) =>
      list.map((c) => {
        if (c.kind !== row.kind) return c;
        const next = new Set(c.models);
        if (on) next.add(row.model.id);
        else next.delete(row.model.id);
        return { ...c, models: next };
      })
    );
  }, []);

  const setVisible = (on: boolean) => {
    const keys = new Set(rows.map((r) => r.key));
    setConnected((list) =>
      list.map((c) => {
        const next = new Set(c.models);
        for (const m of providerBy(c.kind).models) {
          if (!keys.has(`${c.kind}:${m.id}`)) continue;
          if (on) next.add(m.id);
          else next.delete(m.id);
        }
        return { ...c, models: next };
      })
    );
  };

  return (
    <div className={cn("bg-background text-sm", !embedded && "min-h-dvh")}>
      {!embedded && (
      <header className="flex h-14 items-center justify-between border-b px-6">
        <span className="font-semibold">Purr · Настройки</span>
        <Button size="sm" variant="outline">
          <MessageSquare /> Чат
        </Button>
      </header>
      )}

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8 pb-32">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Модели</h1>
          <p className="text-muted-foreground mt-1">
            Включено {enabled} из {all.length}. Пользователи видят в чате только включённые.
          </p>
        </div>

        {/* Providers strip: a filter and the route at a glance */}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup multiple onValueChange={setProviders} spacing={2} value={providers} variant="outline">
            {connected.map((c) => {
              const spec = providerBy(c.kind);
              return (
                <Tooltip key={c.kind}>
                  <TooltipTrigger
                    render={<ToggleGroupItem className="h-auto gap-2.5 py-1.5 pr-3 pl-1.5" value={c.kind} />}
                  >
                    <ProviderMark kind={c.kind} size="xs" />
                    <span className="flex flex-col items-start leading-tight">
                      <span className="font-medium">{spec.title}</span>
                      <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-normal">
                        {c.route.kind === "direct" ? <Globe className="size-3" /> : <Route className="size-3" />}
                        {c.models.size}/{spec.models.length} · {c.route.kind === "direct" ? "напрямую" : c.route.proxy.title}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Показать только {spec.title}</TooltipContent>
                </Tooltip>
              );
            })}
          </ToggleGroup>
          <Button className="h-auto self-stretch border-dashed" onClick={() => setDialog(true)} variant="outline">
            <Plus /> Провайдер
          </Button>
        </div>

        <Frame>
          <FramePanel className="flex flex-wrap items-center gap-3 py-2.5!">
            <InputGroup className="w-64">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput onChange={(e) => setQ(e.target.value)} placeholder="Модель, провайдер или id" value={q} />
            </InputGroup>
            <ToggleGroup multiple onValueChange={setCaps} size="sm" spacing={0} value={caps} variant="outline">
              {CAP_FILTERS.map(({ key, label, icon: Icon }) => (
                <ToggleGroupItem aria-label={label} key={key} value={key}>
                  <Icon /> {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Label className="text-muted-foreground flex items-center gap-2 font-normal">
              <Switch checked={onlyOn} onCheckedChange={setOnlyOn} size="sm" />
              Только включённые
            </Label>
            <div className="ml-auto flex items-center gap-1">
              <span className="text-muted-foreground mr-1 text-xs">Показано: {nModels(rows.length)}</span>
              <Button onClick={() => setVisible(true)} size="sm" variant="ghost">
                Включить показанные
              </Button>
              <Button onClick={() => setVisible(false)} size="sm" variant="ghost">
                Выключить
              </Button>
            </div>
          </FramePanel>
          <FramePanel className="overflow-hidden p-0!">
            <ModelsGrid onToggle={onToggle} rows={rows} showProvider />
          </FramePanel>
          <FrameFooter className="flex-row flex-wrap gap-2">
            {connected
              .filter((c) => providerBy(c.kind).hiddenCount > 0)
              .map((c) => (
                <Badge key={c.kind} size="sm" variant="outline">
                  {providerBy(c.kind).title}: ещё {providerBy(c.kind).hiddenCount} не для чата
                </Badge>
              ))}
            <span className={cn("text-muted-foreground text-xs", connected.some((c) => providerBy(c.kind).hiddenCount > 0) && "ml-auto")}>
              Цены — за 1M токенов в валюте провайдера, курсы не пересчитываем.
            </span>
          </FrameFooter>
        </Frame>
      </main>

      <ConnectDialog
        connected={connected.map((c) => c.kind)}
        onConnected={(c) => {
          setConnected((list) => [...list.filter((x) => x.kind !== c.kind), c]);
          setProviders([c.kind as ProviderKind]);
        }}
        onOpenChange={setDialog}
        open={dialog}
      />
    </div>
  );
};
