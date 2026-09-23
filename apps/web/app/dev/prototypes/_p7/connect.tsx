"use client";

import { Button } from "@purr/ui/components/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@purr/ui/components/field";
import { Input } from "@purr/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@purr/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@purr/ui/components/item";
import { Alert, AlertDescription, AlertTitle } from "@purr/ui/components/reui/alert";
import { Badge } from "@purr/ui/components/reui/badge";
import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@purr/ui/components/reui/stepper";
import { cn } from "@purr/ui/lib/utils";
import { ArrowLeftRight, Check, ChevronRight, CircleAlert, Globe, KeyRound, LoaderCircle, Network, Route } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { PROXIES, PROVIDERS, type ProviderKind, type Proxy, providerBy, SAMPLE_KEYS } from "./mock";
import { busy, enter, MASKED, NO_AUTOFILL, type Phase, ProviderMark, type RouteChoice, useConnection } from "./shared";

// --- provider choice ------------------------------------------------------------------------------

export const ProviderList = ({
  connected,
  onPick,
  size = "default",
}: {
  connected: ProviderKind[];
  onPick: (k: ProviderKind) => void;
  size?: "default" | "sm";
}) => (
  <ItemGroup className={size === "sm" ? "gap-2" : "gap-2.5"}>
    {PROVIDERS.map((p, i) => {
      const done = connected.includes(p.kind);
      const e = enter(i);
      return (
        <Item
          className={cn("hover:bg-muted/50 cursor-pointer transition-colors active:scale-[0.99]", e.className)}
          key={p.kind}
          render={<button onClick={() => onPick(p.kind)} type="button" />}
          size={size}
          style={e.style}
          variant="outline"
        >
          <ItemMedia>
            <ProviderMark kind={p.kind} size={size === "sm" ? "sm" : "default"} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{p.title}</ItemTitle>
            <ItemDescription>{p.blurb}</ItemDescription>
          </ItemContent>
          <ItemActions>
            {done ? (
              <Badge size="sm" variant="success-light">
                <Check /> подключён
              </Badge>
            ) : (
              <ChevronRight className="text-muted-foreground size-4" />
            )}
          </ItemActions>
        </Item>
      );
    })}
  </ItemGroup>
);

// --- check progress on the ReUI Stepper -----------------------------------------------------------

const activeStep = (p: Phase) => ({ blocked: 2, direct: 1, models: 3, probing: 2, proxyFound: 2 })[p as "direct"] ?? 4;

export const CheckSteps = ({ phase, route, title, blocked }: { phase: Phase; route: RouteChoice; title: string; blocked: boolean }) => {
  const step = activeStep(phase);
  const steps = [
    { description: step === 1 ? `Спрашиваем у ${title}…` : "Ключ подошёл", title: "Ключ" },
    {
      description:
        step < 2
          ? blocked
            ? "Напрямую или через прокси"
            : "Напрямую"
          : phase === "blocked"
            ? "Напрямую не отвечает — нужен прокси"
            : phase === "probing"
              ? "Пробуем через прокси…"
            : route.kind === "proxy"
              ? `Через «${route.proxy.title}» · ${route.proxy.latency} мс`
              : "Напрямую",
      title: "Маршрут",
    },
    { description: step === 3 ? "Загружаем список…" : step > 3 ? "Готово" : "Список и цены", title: "Модели" },
  ];
  return (
    <Stepper
      indicators={{
        completed: <Check className="size-3.5" />,
        loading: <LoaderCircle className="size-3.5 animate-spin" />,
      }}
      orientation="vertical"
      value={step}
    >
      <StepperNav>
        {steps.map((s, i) => (
          <StepperItem
            className="relative items-start not-last:flex-1"
            key={s.title}
            loading={busy(phase) && phase !== "proxyFound"}
            step={i + 1}
          >
            <StepperTrigger className="pointer-events-none items-start gap-2.5 pb-6 last:pb-0">
              <StepperIndicator className="data-[state=completed]:bg-success data-[state=completed]:text-white">{i + 1}</StepperIndicator>
              <div className="mt-0.5 text-left">
                <StepperTitle>{s.title}</StepperTitle>
                <StepperDescription>{s.description}</StepperDescription>
              </div>
            </StepperTrigger>
            {i < steps.length - 1 && (
              <StepperSeparator className="group-data-[state=completed]/step:bg-success absolute inset-y-0 top-7 left-3 -order-1 m-0 -translate-x-1/2 group-data-[orientation=vertical]/stepper-nav:h-[calc(100%-2rem)]" />
            )}
          </StepperItem>
        ))}
      </StepperNav>
    </Stepper>
  );
};

// --- the form -------------------------------------------------------------------------------------

export const ConnectForm = ({
  kind,
  onDone,
  footer,
  large,
  proxies = PROXIES,
  onSwitchProvider,
}: {
  kind: ProviderKind;
  onDone: (route: RouteChoice) => void;
  footer?: (state: { busy: boolean }) => React.ReactNode;
  large?: boolean;
  /** Proxies already configured. A fresh install has none. */
  proxies?: Proxy[];
  onSwitchProvider?: () => void;
}) => {
  const spec = providerBy(kind);
  const conn = useConnection(spec, proxies);
  const [proxyUrl, setProxyUrl] = useState("");
  const [key, setKey] = useState("");
  const [extra, setExtra] = useState("");
  const id = useId();
  const locked = busy(conn.phase);
  const checking = conn.phase !== "idle" && conn.phase !== "error";
  const blockedFlow = conn.phase === "blocked" || (conn.phase === "probing" && !proxies.length);

  useEffect(() => {
    if (conn.phase === "done") onDone(conn.route);
  }, [conn.phase, conn.route, onDone]);

  const fillSample = () => {
    if (kind !== "compatible") setKey(SAMPLE_KEYS[kind]);
    if (spec.extraField) setExtra(kind === "yandex" ? "b1g8f2k4m9q1r7t3v5x0" : SAMPLE_KEYS[kind]);
  };

  return (
    <form
      autoComplete="off"
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void conn.start(key, extra);
      }}
    >
      <FieldGroup className="gap-4">
        {spec.extraField && (
          <Field data-invalid={conn.error?.field === "extra" || undefined}>
            <FieldLabel htmlFor={`${id}-extra`}>{spec.extraField.label}</FieldLabel>
            <Input
              {...NO_AUTOFILL}
              aria-invalid={conn.error?.field === "extra" || undefined}
              className={cn("font-mono", large && "h-10")}
              disabled={locked}
              id={`${id}-extra`}
              onChange={(e) => setExtra(e.target.value)}
              placeholder={spec.extraField.placeholder}
              value={extra}
            />
            <FieldDescription>{spec.extraField.hint}</FieldDescription>
          </Field>
        )}
        <Field data-invalid={conn.error?.field === "key" || undefined}>
          <FieldLabel htmlFor={`${id}-key`}>{spec.keyLabel}</FieldLabel>
          <InputGroup className={cn(large && "h-10")}>
            <InputGroupAddon>
              <KeyRound />
            </InputGroupAddon>
            <InputGroupInput
              {...NO_AUTOFILL}
              aria-invalid={conn.error?.field === "key" || undefined}
              autoFocus
              className={cn("font-mono", key && MASKED)}
              disabled={locked}
              id={`${id}-key`}
              onChange={(e) => setKey(e.target.value)}
              placeholder={spec.keyPlaceholder}
              type="text"
              value={key}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton disabled={locked} onClick={fillSample} size="xs">
                Пример
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {conn.error?.field ? (
            <FieldError>{conn.error.title}</FieldError>
          ) : (
            <FieldDescription>Ключ шифруется и больше не показывается целиком.</FieldDescription>
          )}
        </Field>
      </FieldGroup>

      {conn.error && conn.error.field !== "proxy" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{conn.error.title}</AlertTitle>
          <AlertDescription>{conn.error.hint}</AlertDescription>
        </Alert>
      )}

      {checking && !blockedFlow && (
        <div className="animate-in fade-in fill-mode-both rounded-xl border p-4 duration-200 ease-out">
          <CheckSteps blocked={spec.directBlocked} phase={conn.phase} route={conn.route} title={spec.title} />
        </div>
      )}

      {blockedFlow && (
        <Alert className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 ease-out" variant="warning">
          <Globe />
          <AlertTitle>Ключ подошёл, но {spec.title} из этой сети не отвечает</AlertTitle>
          <AlertDescription>
            Похоже на гео-блок. Укажите прокси — через него пойдёт только {spec.title}, остальное напрямую. Или подключите
            провайдера, который доступен отсюда.
          </AlertDescription>
          <div className="col-start-2 mt-3 flex flex-col gap-2">
            <InputGroup>
              <InputGroupAddon>
                <Network />
              </InputGroupAddon>
              <InputGroupInput
                {...NO_AUTOFILL}
                aria-invalid={conn.error?.field === "proxy" || undefined}
                aria-label="Адрес прокси"
                className="font-mono"
                disabled={conn.phase === "probing"}
                onChange={(e) => setProxyUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void conn.tryProxy(proxyUrl);
                  }
                }}
                placeholder="http://host:3128 или socks5://host:1080"
                value={proxyUrl}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton disabled={conn.phase === "probing"} onClick={() => setProxyUrl("http://proxy.corp.local:3128")} size="xs">
                  Пример
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {conn.error?.field === "proxy" && (
              <p className="text-destructive text-xs">
                <span className="font-medium">{conn.error.title}.</span> {conn.error.hint}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={conn.phase === "probing"} onClick={() => void conn.tryProxy(proxyUrl)} size="sm" type="button">
                {conn.phase === "probing" ? "Проверяем…" : "Проверить через прокси"}
              </Button>
              {onSwitchProvider && (
                <Button disabled={conn.phase === "probing"} onClick={onSwitchProvider} size="sm" type="button" variant="ghost">
                  <ArrowLeftRight /> Другой провайдер
                </Button>
              )}
            </div>
          </div>
        </Alert>
      )}

      {conn.phase === "proxyFound" && conn.route.kind === "proxy" && (
        <Alert className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 ease-out" variant="info">
          <Route />
          <AlertTitle>Пускать {spec.title} через «{conn.route.proxy.title}»?</AlertTitle>
          <AlertDescription>Через прокси пойдёт только {spec.title}, остальное — по-прежнему напрямую.</AlertDescription>
          <div className="col-start-2 mt-2 flex gap-2">
            <Button onClick={() => void conn.acceptProxy()} size="sm" type="button">
              Да, через прокси
            </Button>
            <Button onClick={conn.declineProxy} size="sm" type="button" variant="ghost">
              Нет
            </Button>
          </div>
        </Alert>
      )}

      {footer
        ? footer({ busy: locked })
        : !checking && (
            <Button className={cn(large && "h-10")} type="submit">
              {conn.error ? "Проверить ещё раз" : "Проверить и подключить"}
            </Button>
          )}
    </form>
  );
};
