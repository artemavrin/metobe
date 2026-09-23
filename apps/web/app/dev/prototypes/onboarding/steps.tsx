"use client";

// Onboarding content shared by the layouts: the flow is chosen ("Шаги"), the layouts differ only in chrome.
import { Button } from "@purr/ui/components/button";
import { Checkbox } from "@purr/ui/components/checkbox";
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
import { cn } from "@purr/ui/lib/utils";
import { MessageSquare, Plus } from "lucide-react";
import { useCallback, useState } from "react";

import { ConnectForm, ProviderList } from "../_p7/connect";
import {
  fmtContext,
  fmtPrice,
  models as nModels,
  type ProviderKind,
  type Proxy,
  providerBy,
  recommendedIds,
} from "../_p7/mock";
import { CapIcons, enter, ProviderMark, RouteBadge, type RouteChoice } from "../_p7/shared";

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

export const useOnboarding = () => {
  const [step, setStep] = useState<Step>("pick");
  const [kind, setKind] = useState<ProviderKind>("openai");
  const [connected, setConnected] = useState<Connected[]>([]);
  const current = connected.find((c) => c.kind === kind);

  const pick = (k: ProviderKind) => {
    setKind(k);
    setStep("key");
  };
  const onConnected = useCallback(
    (route: RouteChoice) => {
      setConnected((c) => [...c.filter((x) => x.kind !== kind), { kind, models: recommendedIds(providerBy(kind)), route }]);
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
        description: "Мы отметили рекомендованные. Включённые увидят все пользователи в выборе модели.",
        title: `Нашлось ${nModels(spec.models.length + spec.hiddenCount)}`,
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

const ModelsBody = ({ o, current }: { o: Onboarding; current: Connected }) => {
  const spec = providerBy(current.kind);
  const all = current.models.size === spec.models.length;
  const toggle = (id: string, on: boolean) => {
    const next = new Set(current.models);
    if (on) next.add(id);
    else next.delete(id);
    o.setModels(next);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          <ProviderMark kind={spec.kind} size="xs" /> {spec.title}
          <RouteBadge route={current.route} />
        </span>
        <Button onClick={() => o.setModels(all ? recommendedIds(spec) : new Set(spec.models.map((m) => m.id)))} size="xs" variant="ghost">
          {all ? "Только рекомендованные" : "Выбрать все"}
        </Button>
      </div>
      <ItemGroup className="gap-0! divide-y rounded-xl border">
        {spec.models.map((m, i) => {
          const e = enter(i);
          const id = `ob-${m.id}`;
          return (
            <Item className={cn("hover:bg-muted/40 cursor-pointer rounded-none", e.className)} key={m.id} render={<label htmlFor={id} />} size="sm" style={e.style}>
              <ItemMedia>
                <Checkbox checked={current.models.has(m.id)} id={id} onCheckedChange={(v) => toggle(m.id, v)} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {m.title}
                  {m.recommended && (
                    <Badge size="sm" variant="primary-light">
                      рекомендуем
                    </Badge>
                  )}
                </ItemTitle>
                <ItemDescription>
                  {m.vendor} · {fmtContext(m.context)} · {fmtPrice(m)} за 1M
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <CapIcons caps={m.caps} />
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
      {spec.hiddenCount > 0 && (
        <p className="text-muted-foreground text-xs">
          Ещё {spec.hiddenCount} не для чата ({spec.hiddenNote}) — они в настройках.
        </p>
      )}
      <Button className="h-10" disabled={current.models.size === 0} onClick={() => o.setStep("done")}>
        {current.models.size === 0 ? "Выберите хотя бы одну" : `Включить ${nModels(current.models.size)}`}
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
