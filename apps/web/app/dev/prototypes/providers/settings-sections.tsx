"use client";

// Direction: one document — every provider is a Frame section with its models as a switch list; proxies at the end.
import { Button } from "@purr/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@purr/ui/components/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@purr/ui/components/item";
import { Badge } from "@purr/ui/components/reui/badge";
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import { Switch } from "@purr/ui/components/switch";
import { cn } from "@purr/ui/lib/utils";
import { ChevronDown, Ellipsis, Globe, MessageSquare, Network, Plus } from "lucide-react";
import { useState } from "react";

import { ConnectDialog, type Connected, seedConnected } from "../_p7/connect-dialog";
import { byNewest, fmtContext, fmtPrice, isNew, models as nModels, PROXIES, providerBy } from "../_p7/mock";
import { CapIcons, enter, ProviderMark, RouteBadge } from "../_p7/shared";

/** The providers page body, without app chrome — the app shell prototype mounts it inside its layout. */
export const ProvidersSettings = () => {
  const [connected, setConnected] = useState<Connected[]>(seedConnected);
  const [dialog, setDialog] = useState(false);
  const enabled = connected.reduce((n, c) => n + c.models.size, 0);

  const update = (c: Connected) => setConnected((all) => all.map((x) => (x.kind === c.kind ? c : x)));

  return (
    <>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10 pb-32">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Провайдеры и модели</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              В чате доступно {nModels(enabled)} от {connected.length} провайдеров. Выключенные модели пользователи не видят.
            </p>
          </div>
          <Button onClick={() => setDialog(true)}>
            <Plus /> Подключить провайдера
          </Button>
        </div>

        {connected.map((c) => (
          <ProviderSection connected={c} key={c.kind} onChange={update} />
        ))}

        <Frame stacked>
          <FrameHeader className="flex-row items-center gap-3">
            <IconTile size="xs" variant="frame">
              <Network />
            </IconTile>
            <div className="flex-1">
              <FrameTitle>Прокси</FrameTitle>
              <FrameDescription>По умолчанию всё напрямую. Через прокси идёт только то, что отмечено.</FrameDescription>
            </div>
            <Button size="sm" variant="ghost">
              Управлять
            </Button>
          </FrameHeader>
          <FramePanel className="p-1!">
            <ItemGroup className="gap-0!">
              {PROXIES.map((p) => {
                const through = connected.filter((c) => c.route.kind === "proxy" && c.route.proxy.id === p.id);
                return (
                  <Item key={p.id} size="sm">
                    <ItemMedia>
                      <span className="bg-success size-2 rounded-full" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>
                        {p.title}
                        <Badge size="sm" variant="outline">
                          {p.type} · {p.country} · {p.latency} мс
                        </Badge>
                      </ItemTitle>
                      <ItemDescription>
                        {through.length ? `Через него: ${through.map((c) => providerBy(c.kind).title).join(", ")}` : "Пока ничего не идёт"}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="flex -space-x-1.5">
                      {through.map((c) => (
                        <ProviderMark key={c.kind} kind={c.kind} size="xs" />
                      ))}
                    </ItemActions>
                  </Item>
                );
              })}
              <Item size="sm">
                <ItemMedia>
                  <Globe className="text-muted-foreground size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Напрямую</ItemTitle>
                  <ItemDescription>
                    {connected.filter((c) => c.route.kind === "direct").map((c) => providerBy(c.kind).title).join(", ") || "—"}, поиск, почта
                  </ItemDescription>
                </ItemContent>
              </Item>
            </ItemGroup>
          </FramePanel>
        </Frame>
      </main>

      <ConnectDialog
        connected={connected.map((c) => c.kind)}
        onConnected={(c) => setConnected((all) => [...all.filter((x) => x.kind !== c.kind), c])}
        onOpenChange={setDialog}
        open={dialog}
      />
    </>
  );
};

export const SettingsSections = () => (
  <div className="bg-background min-h-dvh">
    <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center justify-between border-b px-6 backdrop-blur">
      <span className="text-sm font-semibold">Purr · Настройки</span>
      <Button size="sm" variant="outline">
        <MessageSquare /> Чат
      </Button>
    </header>
    <ProvidersSettings />
  </div>
);

const ProviderSection = ({ connected, onChange }: { connected: Connected; onChange: (c: Connected) => void }) => {
  const spec = providerBy(connected.kind);
  const [expanded, setExpanded] = useState(Boolean(connected.fresh));
  const sorted = [...spec.models].sort(byNewest);
  const visible = expanded ? sorted : sorted.filter((m) => connected.models.has(m.id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(connected.models);
    if (on) next.add(id);
    else next.delete(id);
    onChange({ ...connected, fresh: false, models: next });
  };

  return (
    <Frame className={cn(connected.fresh && "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out")} stacked>
      <FrameHeader className="flex-row items-center gap-3">
        <ProviderMark kind={spec.kind} />
        <div className="flex flex-1 flex-col gap-1">
          <FrameTitle className="flex items-center gap-2">
            {spec.title}
            {connected.fresh && (
              <Badge size="sm" variant="success-light">
                только что
              </Badge>
            )}
          </FrameTitle>
          <div className="flex items-center gap-2">
            <RouteBadge route={connected.route} />
            <FrameDescription>
              {connected.models.size} из {spec.models.length} включено
            </FrameDescription>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label="Действия" size="icon-sm" variant="ghost" />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Проверить ключ</DropdownMenuItem>
            <DropdownMenuItem>Сменить ключ</DropdownMenuItem>
            <DropdownMenuItem>Маршрут: напрямую или через прокси</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Отключить провайдера</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </FrameHeader>
      <FramePanel className="p-1!">
        {visible.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-sm">Все модели выключены — провайдер не виден в чате.</p>
        ) : (
          <div className="flex flex-col">
            {visible.map((m, i) => {
              const id = `sw-${spec.kind}-${m.id}`;
              const e = enter(i);
              return (
                <label
                  className={cn("hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5", e.className)}
                  htmlFor={id}
                  key={m.id}
                  style={e.style}
                >
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {m.title}
                      {isNew(m) && (
                        <Badge size="xs" variant="info-light">
                          новая
                        </Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {m.vendor} · {fmtContext(m.context)} · {fmtPrice(m)} за 1M
                    </span>
                  </div>
                  <CapIcons caps={m.caps} />
                  <Switch checked={connected.models.has(m.id)} id={id} onCheckedChange={(v) => toggle(m.id, v)} size="sm" />
                </label>
              );
            })}
          </div>
        )}
      </FramePanel>
      <FrameFooter className="flex-row items-center justify-between">
        <Button onClick={() => setExpanded((v) => !v)} size="xs" variant="ghost">
          <ChevronDown className={cn("transition-transform duration-200 ease-out", expanded && "rotate-180")} />
          {expanded ? "Только включённые" : `Все модели · ${spec.models.length}`}
        </Button>
        {spec.hiddenCount > 0 && <FrameDescription>ещё {spec.hiddenCount} не для чата</FrameDescription>}
      </FrameFooter>
    </Frame>
  );
};
