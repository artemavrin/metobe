"use client";

// Riff «Компакт»: providers shrink to a rail of marks, the connection is one editable strip, the table gets
// bulk selection and inline price editing.
import { Button } from "@purr/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@purr/ui/components/popover";
import { Alert, AlertDescription } from "@purr/ui/components/reui/alert";
import { Frame, FramePanel } from "@purr/ui/components/reui/frame";
import { cn } from "@purr/ui/lib/utils";
import type { RowSelectionState } from "@tanstack/react-table";
import { CircleAlert, KeyRound, Pencil, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ConnectDialog } from "../../_p7/connect-dialog";
import { byNewest, fmtPrice, models as nModels, providerBy } from "../../_p7/mock";
import { ModelsGrid, type ModelRow, selectedKeys } from "../../_p7/models-grid";
import { NO_AUTOFILL, ProviderMark } from "../../_p7/shared";
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

export const PanelCompact = () => {
  const panel = usePanel();
  const [dialog, setDialog] = useState(false);
  const p = panel.current;
  return (
    <div className="flex h-full min-h-0 text-sm">
      <ProvidersColumn compact onAdd={() => setDialog(true)} panel={panel} />
      <main className="min-w-0 flex-1 overflow-y-auto">{p && <Detail key={p.kind} p={p} panel={panel} />}</main>
      <ConnectDialog connected={panel.list.map((x) => x.kind)} onConnected={panel.add} onOpenChange={setDialog} open={dialog} />
    </div>
  );
};

const Detail = ({ panel, p }: { panel: Panel; p: PanelProvider }) => {
  const spec = providerBy(p.kind);
  const [q, setQ] = useState("");
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [keyOpen, setKeyOpen] = useState(p.health.state === "error");
  const [prices, setPrices] = useState<Record<string, { input: number; output: number }>>({});

  const rows = useMemo<ModelRow[]>(
    () =>
      [...spec.models]
        .sort(byNewest)
        .map((m) => (prices[m.id] && m.price ? { ...m, price: { ...m.price, ...prices[m.id] } } : m))
        .map((model) => ({ key: model.id, kind: p.kind, model, on: p.models.has(model.id) }))
        .filter((r) => `${r.model.title} ${r.model.id} ${r.model.vendor}`.toLowerCase().includes(q.toLowerCase())),
    [spec, p, q, prices]
  );
  const picked = selectedKeys(selection);
  const bulk = (on: boolean) => {
    const next = new Set(p.models);
    for (const id of picked) {
      if (on) next.add(id);
      else next.delete(id);
    }
    panel.setModels(p.kind, next);
    setSelection({});
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* One strip: who, health, key, route, actions */}
      <div className="bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3">
        <span className="flex items-center gap-2">
          <ProviderMark kind={p.kind} />
          <span className="font-semibold">{spec.title}</span>
          <HealthBadge health={p.health} />
        </span>
        <span className="bg-border hidden h-5 w-px md:block" />
        <Popover onOpenChange={setKeyOpen} open={keyOpen}>
          <PopoverTrigger
            render={
              <Button className={cn("font-mono", p.health.state === "error" && "text-destructive")} size="sm" variant="ghost" />
            }
          >
            <KeyRound /> ••••{p.keyTail} <Pencil className="opacity-50" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-96">
            <KeyField onDone={() => setKeyOpen(false)} p={p} panel={panel} />
          </PopoverContent>
        </Popover>
        <RouteSelect className="h-8 w-56" p={p} panel={panel} />
        <span className="text-muted-foreground text-xs">в чате {visibleInChat(p)}</span>
        <div className="ml-auto flex items-center gap-1">
          <RecheckButton p={p} panel={panel} />
          <DisconnectButton compact p={p} panel={panel} />
        </div>
      </div>

      {p.health.state === "error" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            {p.health.message} Нажмите на ключ в строке выше, чтобы заменить его.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex h-8 items-center gap-2">
        {picked.length ? (
          <div className="bg-primary/5 border-primary/20 animate-in fade-in flex items-center gap-1 rounded-lg border py-0.5 pr-1 pl-3 duration-150 ease-out">
            <span className="mr-2 text-sm font-medium">Выбрано {nModels(picked.length)}</span>
            <Button onClick={() => bulk(true)} size="xs" variant="ghost">
              Включить
            </Button>
            <Button onClick={() => bulk(false)} size="xs" variant="ghost">
              Выключить
            </Button>
            <Button
              onClick={() => {
                setPrices((all) => Object.fromEntries(Object.entries(all).filter(([k]) => !picked.includes(k))));
                setSelection({});
              }}
              size="xs"
              variant="ghost"
            >
              Цены по прайсу
            </Button>
            <Button aria-label="Снять выделение" onClick={() => setSelection({})} size="icon-xs" variant="ghost">
              <X />
            </Button>
          </div>
        ) : (
          <>
            <InputGroup className="w-64">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput {...NO_AUTOFILL} onChange={(e) => setQ(e.target.value)} placeholder="Найти модель" value={q} />
            </InputGroup>
            <span className="text-muted-foreground text-xs">Отметьте модели, чтобы менять их разом · цену правьте по клику</span>
          </>
        )}
      </div>

      <Frame>
        <FramePanel className="overflow-hidden p-0!">
          <ModelsGrid
            onSelectionChange={setSelection}
            onToggle={(r, on) => panel.toggleModel(p.kind, r.model.id, on)}
            priceCell={(r) => (
              <PriceEditor
                custom={Boolean(prices[r.key])}
                onChange={(v) => setPrices((all) => ({ ...all, [r.key]: v }))}
                row={r}
              />
            )}
            rows={rows}
            selection={selection}
          />
        </FramePanel>
      </Frame>
    </div>
  );
};

const PriceEditor = ({ row, custom, onChange }: { row: ModelRow; custom: boolean; onChange: (v: { input: number; output: number }) => void }) => {
  const m = row.model;
  const [open, setOpen] = useState(false);
  if (!m.price) return <span className="text-muted-foreground">{fmtPrice(m)}</span>;
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "hover:bg-muted -mx-1 rounded px-1 py-0.5 tabular-nums transition-colors",
              custom && "text-warning-foreground dark:text-warning underline decoration-dotted underline-offset-2"
            )}
            onClick={(e) => e.stopPropagation()}
            type="button"
          />
        }
      >
        {fmtPrice(m)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Цена за 1M токенов, {m.price.currency === "RUB" ? "₽" : "$"}</span>
          <PriceFields
            onCommit={(v) => {
              onChange(v);
              setOpen(false);
            }}
            price={{ input: m.price.input, output: m.price.output }}
            withSave
          />
          <span className="text-muted-foreground text-xs">Своя цена не перетирается при синхронизации с провайдером.</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};
