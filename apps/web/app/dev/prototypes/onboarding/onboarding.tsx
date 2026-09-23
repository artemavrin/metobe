"use client";

// Onboarding, direction "Шаги": one decision per screen, then the way into chat.
import { Button } from "@purr/ui/components/button";
import { Checkbox } from "@purr/ui/components/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@purr/ui/components/empty";
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
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@purr/ui/components/reui/stepper";
import { cn } from "@purr/ui/lib/utils";
import { ArrowLeft, Check, MessageSquare, Plus } from "lucide-react";
import { useCallback, useState } from "react";

import { ConnectForm, ProviderList } from "../_p7/connect";
import { fmtContext, fmtPrice, models as nModels, type ProviderKind, providerBy, recommendedIds } from "../_p7/mock";
import { CapIcons, enter, ProviderMark, RouteBadge, type RouteChoice } from "../_p7/shared";

type Connected = { kind: ProviderKind; models: Set<string>; route: RouteChoice };
type Step = "pick" | "key" | "models" | "summary";

const STEP_INDEX: Record<Step, number> = { key: 2, models: 3, pick: 1, summary: 4 };

const Screen = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div
    className={cn(
      "animate-in fade-in slide-in-from-bottom-2 fill-mode-both flex w-full max-w-xl flex-col duration-200 ease-out motion-reduce:animate-none",
      className
    )}
  >
    {children}
  </div>
);

export const Onboarding = () => {
  const [step, setStep] = useState<Step>("pick");
  const [kind, setKind] = useState<ProviderKind>("openai");
  const [connected, setConnected] = useState<Connected[]>([]);

  const onConnected = useCallback(
    (route: RouteChoice) => {
      setConnected((c) => [...c.filter((x) => x.kind !== kind), { kind, models: recommendedIds(providerBy(kind)), route }]);
      setStep("models");
    },
    [kind]
  );

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <header className="grid h-16 grid-cols-[1fr_auto_1fr] items-center border-b px-6">
        <span className="text-sm font-semibold">Purr</span>
        <Stepper className="w-[420px]" indicators={{ completed: <Check className="size-3.5" /> }} value={STEP_INDEX[step]}>
          <StepperNav>
            {["Провайдер", "Ключ", "Модели"].map((title, i) => (
              <StepperItem className="not-last:flex-1" key={title} step={i + 1}>
                <StepperTrigger className="pointer-events-none gap-2">
                  <StepperIndicator>{i + 1}</StepperIndicator>
                  <StepperTitle>{title}</StepperTitle>
                </StepperTrigger>
                {i < 2 && <StepperSeparator className="group-data-[state=completed]/step:bg-primary mx-2" />}
              </StepperItem>
            ))}
          </StepperNav>
        </Stepper>
        <span className="text-muted-foreground text-right text-xs">Артём · админ</span>
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pt-[7vh] pb-24">
        {step === "pick" && (
          <Screen>
            <h1 className="text-2xl font-semibold tracking-tight">
              {connected.length ? "Какого провайдера добавим?" : "Откуда брать модели?"}
            </h1>
            <p className="text-muted-foreground mt-2 mb-8 text-sm">
              {connected.length
                ? "В чате модели всех провайдеров будут в одном списке."
                : "Чат откроется, как только появится хотя бы одна модель. Остальное можно добавить позже в настройках."}
            </p>
            <ProviderList
              connected={connected.map((c) => c.kind)}
              onPick={(k) => {
                setKind(k);
                setStep("key");
              }}
            />
          </Screen>
        )}

        {step === "key" && (
          <Screen key={kind}>
            <Button className="-ml-2 w-fit" onClick={() => setStep("pick")} size="sm" variant="ghost">
              <ArrowLeft /> Все провайдеры
            </Button>
            <div className="mt-5 mb-7 flex items-center gap-3">
              <ProviderMark kind={kind} size="lg" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{providerBy(kind).title}</h1>
                <p className="text-muted-foreground text-sm">{providerBy(kind).blurb}</p>
              </div>
            </div>
            <ConnectForm kind={kind} large onDone={onConnected} />
          </Screen>
        )}

        {step === "models" && (
          <ModelsStep
            connected={connected.find((c) => c.kind === kind) as Connected}
            onChange={(m) => setConnected((c) => c.map((x) => (x.kind === kind ? { ...x, models: m } : x)))}
            onDone={() => setStep("summary")}
          />
        )}

        {step === "summary" && (
          <Screen className="max-w-lg">
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyMedia>
                  <IconTile className="text-success animate-in zoom-in-90 fade-in fill-mode-both duration-300 ease-out" size="xl" variant="soft">
                    <Check />
                  </IconTile>
                </EmptyMedia>
                <EmptyTitle className="text-2xl">Всё готово — {nModels(connected.reduce((n, c) => n + c.models.size, 0))} в чате</EmptyTitle>
                <EmptyDescription>Провайдеров, модели и прокси можно поменять в настройках в любой момент.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="w-full max-w-none">
                <ItemGroup className="w-full gap-2">
                  {connected.map((c, i) => {
                    const e = enter(i + 1);
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
                <div className="mt-4 flex w-full flex-col gap-2">
                  <Button className="h-10">
                    <MessageSquare /> Открыть чат
                  </Button>
                  <Button className="h-10" onClick={() => setStep("pick")} variant="ghost">
                    <Plus /> Подключить ещё провайдера
                  </Button>
                </div>
              </EmptyContent>
            </Empty>
          </Screen>
        )}
      </main>
    </div>
  );
};

const ModelsStep = ({
  connected,
  onChange,
  onDone,
}: {
  connected: Connected;
  onChange: (m: Set<string>) => void;
  onDone: () => void;
}) => {
  const spec = providerBy(connected.kind);
  const all = connected.models.size === spec.models.length;
  const toggle = (id: string, on: boolean) => {
    const next = new Set(connected.models);
    if (on) next.add(id);
    else next.delete(id);
    onChange(next);
  };

  return (
    <Screen className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Нашлось {nModels(spec.models.length + spec.hiddenCount)}</h1>
      <p className="text-muted-foreground mt-2 mb-6 text-sm">
        Мы отметили рекомендованные. Включённые увидят все пользователи в выборе модели.
      </p>
      <Frame stacked>
        <FrameHeader className="flex-row items-center gap-3">
          <ProviderMark kind={spec.kind} size="xs" />
          <FrameTitle className="flex-1">{spec.title}</FrameTitle>
          <RouteBadge route={connected.route} />
        </FrameHeader>
        <FramePanel className="p-1!">
          <ItemGroup className="gap-0!">
            {spec.models.map((m, i) => {
              const on = connected.models.has(m.id);
              const e = enter(i);
              const id = `model-${m.id}`;
              return (
                <Item
                  className={cn("hover:bg-muted/40 cursor-pointer", e.className)}
                  key={m.id}
                  render={<label htmlFor={id} />}
                  size="sm"
                  style={e.style}
                >
                  <ItemMedia>
                    <Checkbox checked={on} id={id} onCheckedChange={(v) => toggle(m.id, v)} />
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
                      {m.vendor} · {fmtContext(m.context)} контекст · {fmtPrice(m)} за 1M
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <CapIcons caps={m.caps} />
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        </FramePanel>
        <FrameFooter className="flex-row items-center justify-between">
          <FrameDescription>
            Выбрано {connected.models.size} из {spec.models.length}
            {spec.hiddenCount > 0 && ` · ещё ${spec.hiddenCount} не для чата (${spec.hiddenNote})`}
          </FrameDescription>
          <Button
            onClick={() => onChange(all ? recommendedIds(spec) : new Set(spec.models.map((m) => m.id)))}
            size="xs"
            variant="ghost"
          >
            {all ? "Только рекомендованные" : "Выбрать все"}
          </Button>
        </FrameFooter>
      </Frame>
      <Button className="mt-6 h-10" disabled={connected.models.size === 0} onClick={onDone}>
        {connected.models.size === 0 ? "Выберите хотя бы одну" : `Включить ${nModels(connected.models.size)}`}
      </Button>
    </Screen>
  );
};
