"use client";

// Riff «Инспектор»: the models table takes the width; a model opens in an inspector on the right,
// provider connection lives in a sheet.
import { Button } from "@purr/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import { Alert, AlertDescription, AlertTitle } from "@purr/ui/components/reui/alert";
import { Badge } from "@purr/ui/components/reui/badge";
import { Frame, FramePanel } from "@purr/ui/components/reui/frame";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@purr/ui/components/sheet";
import { Switch } from "@purr/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@purr/ui/components/toggle-group";
import { cn } from "@purr/ui/lib/utils";
import { CircleAlert, Plug, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ConnectDialog } from "../../_p7/connect-dialog";
import { byNewest, type Caps, fmtContext, type Model, providerBy } from "../../_p7/mock";
import { ModelsGrid, type ModelRow } from "../../_p7/models-grid";
import { NO_AUTOFILL, ProviderMark, RouteBadge } from "../../_p7/shared";
import {
  DisconnectButton,
  HealthBadge,
  KeyField,
  type Panel,
  PriceFields,
  type PanelProvider,
  ProvidersColumn,
  RecheckButton,
  RouteSelect,
  usePanel,
  visibleInChat,
} from "./common";

/** Admin's corrections on top of what the provider reports (`capabilities_source: manual`). */
type Override = { caps?: Partial<Caps>; price?: { input: number; output: number } };

export const PanelInspector = () => {
  const panel = usePanel();
  const [dialog, setDialog] = useState(false);
  const p = panel.current;
  return (
    <div className="flex h-full min-h-0 text-sm">
      <ProvidersColumn onAdd={() => setDialog(true)} panel={panel} />
      {p && <Detail key={p.kind} p={p} panel={panel} />}
      <ConnectDialog connected={panel.list.map((x) => x.kind)} onConnected={panel.add} onOpenChange={setDialog} open={dialog} />
    </div>
  );
};

const Detail = ({ panel, p }: { panel: Panel; p: PanelProvider }) => {
  const spec = providerBy(p.kind);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  const withOverride = (m: Model): Model => {
    const o = overrides[m.id];
    if (!o) return m;
    return { ...m, caps: { ...m.caps, ...o.caps }, price: o.price && m.price ? { ...m.price, ...o.price } : m.price };
  };
  const rows = useMemo<ModelRow[]>(
    () =>
      [...spec.models]
        .sort(byNewest)
        .map((m) => withOverride(m))
        .map((model) => ({ key: model.id, kind: p.kind, model, on: p.models.has(model.id) }))
        .filter((r) => `${r.model.title} ${r.model.id} ${r.model.vendor}`.toLowerCase().includes(q.toLowerCase())),
    // withOverride reads overrides
    [spec, p, q, overrides]
  );
  const openRow = rows.find((r) => r.key === open);

  return (
    <>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-6">
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
                  <span>· в чате {visibleInChat(p)}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <RecheckButton p={p} panel={panel} />
              <Button onClick={() => setSheet(true)} size="sm" variant="outline">
                <Plug /> Подключение
              </Button>
            </div>
          </header>

          {p.health.state === "error" && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Ключ не работает с {p.health.since}</AlertTitle>
              <AlertDescription>{p.health.message}</AlertDescription>
              <div className="col-start-2 mt-2">
                <Button onClick={() => setSheet(true)} size="sm" variant="outline">
                  Заменить ключ
                </Button>
              </div>
            </Alert>
          )}

          <div className="flex items-center gap-2">
            <InputGroup className="w-64">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput {...NO_AUTOFILL} onChange={(e) => setQ(e.target.value)} placeholder="Найти модель" value={q} />
            </InputGroup>
            <span className="text-muted-foreground text-xs">Нажмите на модель, чтобы открыть подробности</span>
          </div>
          <Frame>
            <FramePanel className="overflow-hidden p-0!">
              <ModelsGrid
                activeKey={open ?? undefined}
                onRowClick={(r) => setOpen(r.key)}
                onToggle={(r, on) => panel.toggleModel(p.kind, r.model.id, on)}
                rows={rows}
              />
            </FramePanel>
          </Frame>
        </div>
      </main>

      {openRow && (
        <aside className="animate-in fade-in slide-in-from-right-2 flex w-80 shrink-0 flex-col border-l duration-150 ease-out" key={openRow.key}>
          <ModelInspector
            onClose={() => setOpen(null)}
            onOverride={(o) =>
              setOverrides((all) => ({ ...all, [openRow.key]: o ? { ...all[openRow.key], ...o } : {} }))
            }
            onToggle={(on) => panel.toggleModel(p.kind, openRow.model.id, on)}
            original={spec.models.find((m) => m.id === openRow.key) as Model}
            override={overrides[openRow.key]}
            row={openRow}
          />
        </aside>
      )}

      <Sheet onOpenChange={setSheet} open={sheet}>
        <SheetContent className="w-[440px] sm:max-w-[440px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ProviderMark kind={p.kind} size="xs" /> Подключение {spec.title}
            </SheetTitle>
            <SheetDescription>Ключ, маршрут и отключение провайдера.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-6 px-4">
            <KeyField onDone={() => setSheet(false)} p={p} panel={panel} />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Маршрут</span>
              <RouteSelect className="w-full" p={p} panel={panel} />
            </div>
            <div className="flex flex-col gap-2 border-t pt-4">
              <span className="text-sm font-medium">Отключение</span>
              <span className="text-muted-foreground text-xs">Ключ удалится, модели пропадут из чата, история останется.</span>
              <DisconnectButton p={p} panel={panel} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

const CAP_ROWS: { key: keyof Caps; label: string }[] = [
  { key: "tools", label: "Инструменты" },
  { key: "vision", label: "Картинки на входе" },
  { key: "reasoning", label: "Рассуждение" },
  { key: "structured", label: "Структурированный ответ" },
];

const ModelInspector = ({
  row,
  original,
  override,
  onOverride,
  onToggle,
  onClose,
}: {
  row: ModelRow;
  original: Model;
  override?: Override;
  onOverride: (o: Override | null) => void;
  onToggle: (on: boolean) => void;
  onClose: () => void;
}) => {
  const m = row.model;
  const cur = m.price?.currency === "RUB" ? "₽" : "$";
  const touched = Boolean(override && (Object.keys(override.caps ?? {}).length || override.price));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">{m.title}</span>
          <span className="text-muted-foreground truncate font-mono text-[11px]">{m.id}</span>
        </div>
        <Button aria-label="Закрыть" onClick={onClose} size="icon-sm" variant="ghost">
          <X />
        </Button>
      </div>
      <div className="flex flex-col gap-5 p-4">
        <label className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="font-medium">В чате</span>
            <span className="text-muted-foreground text-xs">Видна всем пользователям в выборе модели</span>
          </span>
          <Switch checked={row.on} onCheckedChange={onToggle} />
        </label>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Контекст</span>
            <span className="text-sm font-medium tabular-nums">{fmtContext(m.context)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Выпущена</span>
            <span className="text-sm font-medium">{m.released ? new Date(m.released).toLocaleDateString("ru") : "неизвестно"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Вендор</span>
            <span className="text-sm font-medium">{m.vendor}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2 font-medium">
            Возможности
            {override?.caps && Object.keys(override.caps).length > 0 && (
              <Badge size="sm" variant="warning-light">
                исправлено вручную
              </Badge>
            )}
          </span>
          {CAP_ROWS.map(({ key, label }) => {
            const manual = override?.caps?.[key];
            const value = manual === undefined ? "auto" : manual ? "yes" : "no";
            const source = original.caps[key];
            return (
              <div className="flex items-center justify-between gap-2" key={key}>
                <span className="flex flex-col">
                  <span>{label}</span>
                  <span className="text-muted-foreground text-[11px]">
                    провайдер: {source === null ? "не сообщает" : source ? "да" : "нет"}
                  </span>
                </span>
                <ToggleGroup
                  onValueChange={(v) => {
                    const next = { ...override?.caps };
                    if (v[0] === "auto" || !v[0]) delete next[key];
                    else next[key] = v[0] === "yes";
                    onOverride({ caps: next });
                  }}
                  size="sm"
                  spacing={0}
                  value={[value]}
                  variant="outline"
                >
                  <ToggleGroupItem value="auto">Авто</ToggleGroupItem>
                  <ToggleGroupItem value="yes">Да</ToggleGroupItem>
                  <ToggleGroupItem value="no">Нет</ToggleGroupItem>
                </ToggleGroup>
              </div>
            );
          })}
        </div>

        {m.price && (
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2 font-medium">
              Цена за 1M токенов, {cur}
              {override?.price && (
                <Badge size="sm" variant="warning-light">
                  своя цена
                </Badge>
              )}
            </span>
            <PriceFields
              key={JSON.stringify(m.price)}
              onCommit={(v) => onOverride({ price: v })}
              price={{ input: m.price.input, output: m.price.output }}
            />
            <span className="text-muted-foreground text-xs">
              По прайсу провайдера: {original.price?.input} / {original.price?.output}. Своя цена не перетирается при синхронизации.
            </span>
          </div>
        )}

        {touched && (
          <Button className="w-fit" onClick={() => onOverride(null)} size="sm" variant="ghost">
            <RotateCcw /> Сбросить к данным провайдера
          </Button>
        )}
      </div>
    </div>
  );
};
