"use client";

// Shared pieces of the «Панель» riffs: provider state with health, the providers column, key / route / danger blocks.
import { Button } from "@purr/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@purr/ui/components/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@purr/ui/components/field";
import { Input } from "@purr/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@purr/ui/components/input-group";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@purr/ui/components/item";
import { Badge } from "@purr/ui/components/reui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@purr/ui/components/select";
import { Spinner } from "@purr/ui/components/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@purr/ui/components/tooltip";
import { cn } from "@purr/ui/lib/utils";
import { Check, KeyRound, Plus, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";

import type { Connected } from "../../_p7/connect-dialog";
import { type Model, PROXIES, type ProviderKind, providerBy, SAMPLE_KEYS } from "../../_p7/mock";
import { MASKED, NO_AUTOFILL, ProviderMark, type RouteChoice } from "../../_p7/shared";

// --- state ----------------------------------------------------------------------------------------

export type Health = { state: "ok"; checked: string } | { state: "error"; message: string; since: string } | { state: "checking" };
export type PanelProvider = Connected & { health: Health; keyTail: string; routeMode: "auto" | "direct" | string };

const proxy = PROXIES[0] as (typeof PROXIES)[number];

export const seedPanel = (): PanelProvider[] => [
  {
    health: { checked: "2 мин назад", state: "ok" },
    keyTail: SAMPLE_KEYS.openai.slice(-4),
    kind: "openai",
    models: new Set(["gpt-5.2", "gpt-5.2-mini"]),
    route: { kind: "proxy", proxy },
    routeMode: "auto",
  },
  {
    health: { message: "Ключ отозван: Anthropic отвечает 401. Модели скрыты из чата, пока ключ не заменят.", since: "2 ч назад", state: "error" },
    keyTail: SAMPLE_KEYS.anthropic.slice(-4),
    kind: "anthropic",
    models: new Set(["claude-opus-5-5", "claude-sonnet-5"]),
    route: { kind: "proxy", proxy },
    routeMode: proxy.id,
  },
  {
    health: { checked: "5 мин назад", state: "ok" },
    keyTail: SAMPLE_KEYS.yandex.slice(-4),
    kind: "yandex",
    models: new Set(["aliceai-llm", "yandexgpt-5.1"]),
    route: { kind: "direct" },
    routeMode: "direct",
  },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Provider list state with the actions every riff needs. */
export const usePanel = () => {
  const [list, setList] = useState<PanelProvider[]>(seedPanel);
  const [selected, setSelected] = useState<ProviderKind>("openai");
  const current = list.find((p) => p.kind === selected) ?? list[0];

  const patch = (kind: ProviderKind, f: (p: PanelProvider) => PanelProvider) => setList((all) => all.map((p) => (p.kind === kind ? f(p) : p)));

  const recheck = async (kind: ProviderKind) => {
    const before = list.find((p) => p.kind === kind);
    patch(kind, (p) => ({ ...p, health: { state: "checking" } }));
    await wait(900);
    patch(kind, (p) => ({ ...p, health: before?.health.state === "error" ? before.health : { checked: "только что", state: "ok" } }));
  };
  /** A new key: checked, then stored. `bad` in the key fails the check, like in the rest of the prototypes. */
  const replaceKey = async (kind: ProviderKind, key: string) => {
    patch(kind, (p) => ({ ...p, health: { state: "checking" } }));
    await wait(1000);
    if (key.includes("bad")) {
      patch(kind, (p) => ({ ...p, health: { message: `${providerBy(kind).title} ответил 401 и на новый ключ.`, since: "только что", state: "error" } }));
      return false;
    }
    patch(kind, (p) => ({ ...p, health: { checked: "только что", state: "ok" }, keyTail: key.trim().slice(-4) }));
    return true;
  };
  const setRoute = (kind: ProviderKind, mode: string) =>
    patch(kind, (p) => {
      const route: RouteChoice =
        mode === "direct" ? { kind: "direct" } : mode === "auto" ? p.route : { kind: "proxy", proxy: PROXIES.find((x) => x.id === mode) ?? proxy };
      return { ...p, route, routeMode: mode };
    });
  const setModels = (kind: ProviderKind, models: Set<string>) => patch(kind, (p) => ({ ...p, fresh: false, models }));
  const toggleModel = (kind: ProviderKind, id: string, on: boolean) =>
    patch(kind, (p) => {
      const next = new Set(p.models);
      if (on) next.add(id);
      else next.delete(id);
      return { ...p, fresh: false, models: next };
    });
  const remove = (kind: ProviderKind) => {
    setList((all) => {
      const rest = all.filter((p) => p.kind !== kind);
      if (rest[0]) setSelected(rest[0].kind);
      return rest;
    });
  };
  const add = (c: Connected) => {
    setList((all) => [
      ...all.filter((p) => p.kind !== c.kind),
      { ...c, health: { checked: "только что", state: "ok" }, keyTail: SAMPLE_KEYS[c.kind].slice(-4), routeMode: c.route.kind === "direct" ? "auto" : c.route.proxy.id },
    ]);
    setSelected(c.kind);
  };

  return { add, current, list, recheck, remove, replaceKey, selected, setModels, setRoute, setSelected, toggleModel };
};

export type Panel = ReturnType<typeof usePanel>;

/** Chat sees a provider's models only while its key works. */
export const visibleInChat = (p: PanelProvider) => (p.health.state === "error" ? 0 : p.models.size);

// --- usage from our own model_runs (mock, deterministic) ------------------------------------------

export const usageOf = (kind: ProviderKind, m: Model, on: boolean) => {
  if (!on) return { cost: 0, days: [0, 0, 0, 0, 0, 0, 0], requests: 0 };
  const seed = [...`${kind}${m.id}`].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const days = Array.from({ length: 7 }, (_, i) => Math.round(((seed * (i + 3)) % 97) + 12));
  const requests = days.reduce((a, b) => a + b, 0);
  const cost = m.price ? Math.round(requests * 1800 * ((m.price.input + m.price.output * 0.4) / 1_000_000) * 100) / 100 : 0;
  return { cost, days, requests };
};

export const Sparkline = ({ days }: { days: number[] }) => {
  const max = Math.max(1, ...days);
  return (
    <span aria-hidden className="flex h-5 items-end gap-0.5">
      {days.map((d, i) => (
        <span className="bg-primary/60 w-1 rounded-[1px]" key={i} style={{ height: `${Math.max(8, (d / max) * 100)}%` }} />
      ))}
    </span>
  );
};

// --- pieces ---------------------------------------------------------------------------------------

export const HealthDot = ({ health }: { health: Health }) => (
  <span
    className={cn(
      "size-1.5 shrink-0 rounded-full",
      health.state === "ok" && "bg-success",
      health.state === "error" && "bg-destructive",
      health.state === "checking" && "bg-warning animate-pulse"
    )}
  />
);

export const HealthBadge = ({ health }: { health: Health }) =>
  health.state === "ok" ? (
    <Badge variant="success-light">работает</Badge>
  ) : health.state === "error" ? (
    <Badge variant="destructive-light">ключ не работает</Badge>
  ) : (
    <Badge variant="warning-light">
      <Spinner className="size-3" /> проверяем
    </Badge>
  );

export const routeLabel = (p: PanelProvider) => (p.route.kind === "direct" ? "напрямую" : p.route.proxy.title);

/** The providers column. `compact` turns it into a rail of marks. */
export const ProvidersColumn = ({ panel, onAdd, compact = false }: { panel: Panel; onAdd: () => void; compact?: boolean }) =>
  compact ? (
    <section className="flex w-16 shrink-0 flex-col items-center gap-2 border-r py-3">
      {panel.list.map((p) => (
        <Tooltip key={p.kind}>
          <TooltipTrigger
            render={
              <button
                aria-label={providerBy(p.kind).title}
                className={cn(
                  "relative rounded-xl p-1 transition-colors duration-150 ease-out",
                  panel.current?.kind === p.kind ? "bg-muted ring-border ring-1" : "hover:bg-muted/60"
                )}
                onClick={() => panel.setSelected(p.kind)}
                type="button"
              />
            }
          >
            <ProviderMark kind={p.kind} size="default" />
            <span className="ring-background absolute -top-0.5 -right-0.5 flex rounded-full ring-2">
              <HealthDot health={p.health} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            {providerBy(p.kind).title} · {visibleInChat(p)} в чате · {routeLabel(p)}
          </TooltipContent>
        </Tooltip>
      ))}
      <Tooltip>
        <TooltipTrigger render={<Button aria-label="Добавить провайдера" className="rounded-xl border-dashed" onClick={onAdd} size="icon-lg" variant="outline" />}>
          <Plus />
        </TooltipTrigger>
        <TooltipContent side="right">Добавить провайдера</TooltipContent>
      </Tooltip>
    </section>
  ) : (
    <section className="flex w-64 shrink-0 flex-col border-r">
      <div className="flex h-12 items-center justify-between border-b px-3">
        <span className="font-medium">Провайдеры</span>
        <Button onClick={onAdd} size="sm" variant="ghost">
          <Plus /> Добавить
        </Button>
      </div>
      <ItemGroup className="gap-1 p-2">
        {panel.list.map((p) => (
          <Item
            className={cn("cursor-pointer", panel.current?.kind === p.kind ? "bg-muted" : "hover:bg-muted/50")}
            key={p.kind}
            render={<button onClick={() => panel.setSelected(p.kind)} type="button" />}
            size="sm"
          >
            <ItemMedia>
              <ProviderMark kind={p.kind} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                {providerBy(p.kind).title}
                <HealthDot health={p.health} />
              </ItemTitle>
              <ItemDescription className={cn(p.health.state === "error" && "text-destructive")}>
                {p.health.state === "error" ? "ключ не работает" : `${visibleInChat(p)} в чате · ${routeLabel(p)}`}
              </ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </section>
  );

/** Replace the key: a masked text field that password managers leave alone, checked before it is stored. */
export const KeyField = ({ panel, p, onDone }: { panel: Panel; p: PanelProvider; onDone?: () => void }) => {
  const [key, setKey] = useState("");
  const [failed, setFailed] = useState(false);
  const checking = p.health.state === "checking";
  const spec = providerBy(p.kind);
  return (
    <form
      autoComplete="off"
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!key.trim()) return;
        const ok = await panel.replaceKey(p.kind, key);
        setFailed(!ok);
        if (ok) {
          setKey("");
          onDone?.();
        }
      }}
    >
      <Field data-invalid={failed || undefined}>
        <FieldLabel htmlFor={`key-${p.kind}`}>Новый ключ</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <KeyRound />
          </InputGroupAddon>
          <InputGroupInput
            {...NO_AUTOFILL}
            aria-invalid={failed || undefined}
            className={cn("font-mono", key && MASKED)}
            disabled={checking}
            id={`key-${p.kind}`}
            onChange={(e) => {
              setKey(e.target.value);
              setFailed(false);
            }}
            placeholder={spec.keyPlaceholder}
            value={key}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton disabled={checking} onClick={() => setKey(SAMPLE_KEYS[p.kind])} size="xs">
              Пример
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {failed ? (
          <FieldError>Ключ не подошёл — старый остаётся в силе.</FieldError>
        ) : (
          <FieldDescription>Сейчас: ••••{p.keyTail}. Новый сохранится только после проверки.</FieldDescription>
        )}
      </Field>
      <Button className="w-fit" disabled={checking || !key.trim()} size="sm" type="submit">
        {checking ? <Spinner className="size-3.5" /> : <Check />} Проверить и сохранить
      </Button>
    </form>
  );
};

export const RouteSelect = ({ panel, p, className }: { panel: Panel; p: PanelProvider; className?: string }) => (
  <Select onValueChange={(v) => panel.setRoute(p.kind, String(v))} value={p.routeMode}>
    <SelectTrigger className={cn("w-60", className)}>
      <SelectValue>
        {p.routeMode === "auto" ? `Авто · сейчас ${routeLabel(p)}` : p.routeMode === "direct" ? "Только напрямую" : `Через ${PROXIES.find((x) => x.id === p.routeMode)?.title}`}
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="auto">Авто — напрямую, при блокировке через прокси</SelectItem>
      <SelectItem value="direct">Только напрямую</SelectItem>
      {PROXIES.map((x) => (
        <SelectItem key={x.id} value={x.id}>
          Через {x.title} · {x.type}, {x.country}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const RecheckButton = ({ panel, p, size = "sm" }: { panel: Panel; p: PanelProvider; size?: "sm" | "xs" }) => (
  <Button disabled={p.health.state === "checking"} onClick={() => void panel.recheck(p.kind)} size={size} variant="outline">
    <RefreshCw className={cn(p.health.state === "checking" && "animate-spin")} /> Проверить
  </Button>
);

/** Disconnecting drops the key and hides the models from chat; history stays. */
export const DisconnectButton = ({ panel, p, compact = false }: { panel: Panel; p: PanelProvider; compact?: boolean }) => {
  const title = providerBy(p.kind).title;
  return (
    <Dialog>
      {compact ? (
        <DialogTrigger render={<Button aria-label={`Отключить ${title}`} size="icon-sm" title={`Отключить ${title}`} variant="ghost" />}>
          <Unplug />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" variant="destructive" />}>Отключить {title}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Отключить {title}?</DialogTitle>
          <DialogDescription>
            Ключ удалится, {visibleInChat(p)} моделей пропадут из выбора в чате. История чатов с ними останется. Подключить снова можно в любой момент.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Отмена</DialogClose>
          <DialogClose render={<Button onClick={() => panel.remove(p.kind)} variant="destructive" />}>Отключить</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


/**
 * Price inputs keep a string draft while typing ("0." must survive), and commit a parsed value
 * on blur / Enter, or on «Сохранить» when `withSave` is set (inside a table cell, where every commit re-renders).
 */
export const PriceFields = ({
  price,
  onCommit,
  withSave = false,
  className,
}: {
  price: { input: number; output: number };
  onCommit: (v: { input: number; output: number }) => void;
  withSave?: boolean;
  className?: string;
}) => {
  const [draft, setDraft] = useState({ input: String(price.input), output: String(price.output) });
  const parse = (v: string) => Number(v.replace(",", ".").trim());
  const valid = (v: string) => v.trim() !== "" && !Number.isNaN(parse(v)) && parse(v) >= 0;
  const commit = () => {
    if (valid(draft.input) && valid(draft.output)) onCommit({ input: parse(draft.input), output: parse(draft.output) });
  };
  return (
    <form
      className={cn("flex flex-col gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        {(["input", "output"] as const).map((k) => (
          <label className="flex flex-col gap-1" key={k}>
            <span className="text-muted-foreground text-xs">{k === "input" ? "Вход" : "Выход"}</span>
            <Input
              {...NO_AUTOFILL}
              aria-invalid={!valid(draft[k]) || undefined}
              className="tabular-nums"
              inputMode="decimal"
              onBlur={withSave ? undefined : commit}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              value={draft[k]}
            />
          </label>
        ))}
      </div>
      {withSave && (
        <Button className="w-fit" disabled={!valid(draft.input) || !valid(draft.output)} size="xs" type="submit">
          Сохранить
        </Button>
      )}
    </form>
  );
};
