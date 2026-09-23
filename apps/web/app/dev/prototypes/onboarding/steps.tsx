"use client";

// Onboarding content shared by the layouts: the flow is chosen ("Шаги"), the layouts differ only in chrome.
import { Button } from "@purr/ui/components/button";
import { Checkbox } from "@purr/ui/components/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@purr/ui/components/item";
import { Badge } from "@purr/ui/components/reui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@purr/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@purr/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@purr/ui/components/tooltip";
import { cn } from "@purr/ui/lib/utils";
import { Brain, Eye, MessageSquare, Plus, Search, Wrench } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ConnectForm, ProviderList } from "../_p7/connect";
import {
  byNewest,
  fmtContext,
  fmtPrice,
  isNew,
  models as nModels,
  type ProviderKind,
  type Proxy,
  providerBy,
} from "../_p7/mock";
import { enter, NO_AUTOFILL, ProviderMark, RouteBadge, type RouteChoice } from "../_p7/shared";

/** A fresh install has no proxies: a blocked provider asks for one instead of "finding" it. */
const NO_PROXIES: Proxy[] = [];

export type Step = "pick" | "key" | "models" | "done";
export type Connected = { kind: ProviderKind; models: Set<string>; route: RouteChoice };

export const STEPS: { id: Exclude<Step, "done">; title: string }[] = [
  { id: "pick", title: "Провайдер" },
  { id: "key", title: "Ключ" },
  { id: "models", title: "Модели" },
];
export const stepNumber = (s: Step) => ({ done: 4, key: 2, models: 3, pick: 1 })[s];

export type OnboardingState = { step: Step; kind: ProviderKind; connected: Connected[] };

/** The finish line, to review the last screen without walking the flow: OpenAI behind a proxy the user typed in. */
export const DONE_STATE: OnboardingState = {
  connected: [
    {
      kind: "openai",
      models: new Set(["gpt-5.2", "gpt-5.2-mini"]),
      route: { kind: "proxy", proxy: { country: "DE", id: "new", latency: 52, title: "proxy.corp.local", type: "http" } },
    },
  ],
  kind: "openai",
  step: "done",
};

/** The finish line with a lot selected: to check that the finish screen doesn't try to list them all. */
export const DONE_MANY_STATE: OnboardingState = {
  connected: [
    DONE_STATE.connected[0] as Connected,
    { kind: "gateway", models: new Set(providerBy("gateway").models.slice(0, 40).map((m) => m.id)), route: { kind: "direct" } },
  ],
  kind: "gateway",
  step: "done",
};

/** The models step with AI Gateway connected — the provider with the longest list. */
export const MODELS_STATE: OnboardingState = {
  connected: [{ kind: "gateway", models: new Set(), route: { kind: "direct" } }],
  kind: "gateway",
  step: "models",
};

export const useOnboarding = (initial?: OnboardingState) => {
  const [step, setStep] = useState<Step>(initial?.step ?? "pick");
  const [kind, setKind] = useState<ProviderKind>(initial?.kind ?? "openai");
  const [connected, setConnected] = useState<Connected[]>(initial?.connected ?? []);
  const current = connected.find((c) => c.kind === kind);

  const pick = (k: ProviderKind) => {
    setKind(k);
    setStep("key");
  };
  const onConnected = useCallback(
    (route: RouteChoice) => {
      // Nothing is pre-selected: providers don't tell us what to recommend, and we don't guess.
      setConnected((c) => [...c.filter((x) => x.kind !== kind), { kind, models: new Set(), route }]);
      setStep("models");
    },
    [kind]
  );
  const setModels = (models: Set<string>) =>
    setConnected((c) => c.map((x) => (x.kind === kind ? { ...x, models } : x)));
  const back = () => setStep((s) => (s === "models" ? "key" : "pick"));
  const total = connected.reduce((n, c) => n + c.models.size, 0);

  return { back, connected, current, kind, onConnected, pick, setModels, setStep, step, total };
};

export type Onboarding = ReturnType<typeof useOnboarding>;

/** Heading and lead for the current step. */
export const copy = (o: Onboarding): { title: string; description: string } => {
  const spec = providerBy(o.kind);
  switch (o.step) {
    case "pick":
      return o.connected.length
        ? { description: "В чате модели всех провайдеров будут в одном списке.", title: "Какого провайдера добавим?" }
        : {
            description: "Чат откроется, как только появится хотя бы одна модель. Остальное можно добавить позже.",
            title: "Откуда брать модели?",
          };
    case "key":
      return { description: `${spec.blurb}. Ключ проверим сразу.`, title: `Ключ ${spec.title}` };
    case "models":
      return {
        description: "Выберите, что увидят пользователи в чате. Новые сверху, остальное можно включить позже.",
        title: `Нашлось ${nModels(spec.models.length)} для чата`,
      };
    case "done":
      return { description: "Провайдеров и модели можно поменять в настройках в любой момент.", title: `Готово — ${nModels(o.total)} в чате` };
  }
};

export const StepBody = ({ o, large }: { o: Onboarding; large?: boolean }) => {
  if (o.step === "pick") return <ProviderList connected={o.connected.map((c) => c.kind)} onPick={o.pick} />;
  if (o.step === "key")
    return (
      <ConnectForm
        key={o.kind}
        kind={o.kind}
        large={large}
        onDone={o.onConnected}
        onSwitchProvider={() => o.setStep("pick")}
        proxies={NO_PROXIES}
      />
    );
  if (o.step === "models" && o.current) return <ModelsBody current={o.current} o={o} />;
  return <DoneBody o={o} />;
};

type CapKey = "tools" | "vision" | "reasoning";
const CAP_FILTERS: { key: CapKey; label: string; icon: typeof Wrench }[] = [
  { icon: Wrench, key: "tools", label: "Инструменты" },
  { icon: Eye, key: "vision", label: "Картинки" },
  { icon: Brain, key: "reasoning", label: "Рассуждение" },
];

const ModelsBody = ({ o, current }: { o: Onboarding; current: Connected }) => {
  const spec = providerBy(current.kind);
  const [q, setQ] = useState("");
  const [vendor, setVendor] = useState("all");
  const [caps, setCaps] = useState<string[]>([]);
  const vendors = useMemo(() => [...new Set(spec.models.map((m) => m.vendor))].sort(), [spec]);
  const shown = useMemo(
    () =>
      [...spec.models]
        .sort(byNewest)
        .filter((m) => vendor === "all" || m.vendor === vendor)
        .filter((m) => caps.every((k) => m.caps[k as CapKey] === true))
        .filter((m) => `${m.title} ${m.id} ${m.vendor}`.toLowerCase().includes(q.trim().toLowerCase())),
    [spec, vendor, caps, q]
  );
  const toggle = (id: string, on: boolean) => {
    const next = new Set(current.models);
    if (on) next.add(id);
    else next.delete(id);
    o.setModels(next);
  };
  const selectShown = () => o.setModels(new Set([...current.models, ...shown.map((m) => m.id)]));
  const many = spec.models.length > 8;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          <ProviderMark kind={spec.kind} size="xs" /> {spec.title}
          <RouteBadge route={current.route} />
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">Выбрано {current.models.size}</span>
      </div>

      {many && (
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="min-w-40 flex-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput {...NO_AUTOFILL} onChange={(e) => setQ(e.target.value)} placeholder="Найти модель" value={q} />
          </InputGroup>
          {vendors.length > 1 && (
            <Select onValueChange={(v) => setVendor(String(v))} value={vendor}>
              <SelectTrigger className="w-40">
                <SelectValue>{vendor === "all" ? "Все вендоры" : vendor}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все вендоры</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <ToggleGroup multiple onValueChange={setCaps} spacing={0} value={caps} variant="outline">
            {CAP_FILTERS.map(({ key, label, icon: Icon }) => (
              <Tooltip key={key}>
                <TooltipTrigger render={<ToggleGroupItem aria-label={label} value={key} />}>
                  <Icon />
                </TooltipTrigger>
                <TooltipContent>Только с «{label.toLowerCase()}»</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        </div>
      )}

      {/* Capped height: a provider with hundreds of models scrolls inside the card, the card stays put */}
      <div className="max-h-80 overflow-y-auto overscroll-contain rounded-xl border">
        {shown.length === 0 ? (
          <p className="text-muted-foreground px-4 py-10 text-center text-sm">Ничего не нашлось</p>
        ) : (
          <ul className="divide-y">
            {shown.map((m, i) => {
              const id = `ob-${m.id}`;
              const e = enter(Math.min(i, 8));
              return (
                <li className={e.className} key={m.id} style={e.style}>
                  <label className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-3 py-2 text-sm" htmlFor={id}>
                    <Checkbox checked={current.models.has(m.id)} id={id} onCheckedChange={(v) => toggle(m.id, v)} />
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate font-medium">{m.title}</span>
                      {isNew(m) && (
                        <Badge size="sm" variant="info-light">
                          новая
                        </Badge>
                      )}
                      {vendors.length > 1 && <span className="text-muted-foreground truncate text-xs">{m.vendor}</span>}
                    </span>
                    <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:inline">{fmtContext(m.context)}</span>
                    <span className="text-muted-foreground w-28 shrink-0 text-right text-xs tabular-nums">{fmtPrice(m)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button disabled={shown.length === 0} onClick={selectShown} size="xs" variant="ghost">
            Выбрать показанные · {shown.length}
          </Button>
          {current.models.size > 0 && (
            <Button onClick={() => o.setModels(new Set())} size="xs" variant="ghost">
              Снять все
            </Button>
          )}
        </div>
        {spec.hiddenCount > 0 && (
          <Tooltip>
            <TooltipTrigger render={<span className="text-muted-foreground cursor-default text-xs underline decoration-dotted underline-offset-2" />}>
              Ещё {spec.hiddenCount} не для чата
            </TooltipTrigger>
            <TooltipContent>{spec.hiddenNote} — включаются в настройках</TooltipContent>
          </Tooltip>
        )}
      </div>

      <Button className="mt-1 h-10" disabled={current.models.size === 0} onClick={() => o.setStep("done")}>
        {current.models.size === 0 ? "Выберите хотя бы одну модель" : `Включить ${nModels(current.models.size)}`}
      </Button>
    </div>
  );
};

const DoneBody = ({ o }: { o: Onboarding }) => (
  <div className="flex flex-col gap-4">
    <ItemGroup className="gap-2">
      {o.connected.map((c, i) => {
        const e = enter(i);
        return (
          <Item className={e.className} key={c.kind} style={e.style} variant="outline">
            <ItemMedia>
              <ProviderMark kind={c.kind} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{providerBy(c.kind).title}</ItemTitle>
              <ItemDescription>
                <RouteBadge route={c.route} />
              </ItemDescription>
            </ItemContent>
            <ItemActions className="text-muted-foreground text-sm">{nModels(c.models.size)}</ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
    <Button className="h-10">
      <MessageSquare /> Открыть чат
    </Button>
    <Button className="h-10" onClick={() => o.setStep("pick")} variant="ghost">
      <Plus /> Подключить ещё провайдера
    </Button>
  </div>
);

/** One-line summary of a finished step, for layouts that show progress as text. */
export const stepSummary = (o: Onboarding, id: Exclude<Step, "done">) => {
  const c = o.connected.find((x) => x.kind === o.kind);
  if (id === "pick") return providerBy(o.kind).title;
  if (id === "key") return c ? (c.route.kind === "proxy" ? `через ${c.route.proxy.title}` : "напрямую") : "";
  return c ? nModels(c.models.size) : "";
};

export const PurrMark = ({ className }: { className?: string }) => (
  <span className={cn("flex items-center gap-2 text-sm font-semibold", className)}>
    <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs">P</span>
    Purr
  </span>
);
