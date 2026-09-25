"use client";

import type { SourceInput, SourceKind } from "@metobe/contracts/models";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@metobe/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@metobe/ui/components/item";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@metobe/ui/components/reui/alert";
import { Badge } from "@metobe/ui/components/reui/badge";
import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@metobe/ui/components/reui/stepper";
import { SecretInput } from "@metobe/ui/components/secret-input";
import { cn } from "@metobe/ui/lib/utils";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Globe,
  KeyRound,
  LoaderCircle,
  Network,
  Route,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { sourceLogo } from "@/lib/source-logo";

import { connect, sync } from "./actions";
import type { ConnectState, FieldErrors } from "./actions";
import { failureText } from "./failure";

// «Подключить источник» (prototype P7): pick a kind → key (and a folder or an address) → a real check in stages
// «ключ → маршрут → модели». Unreachable directly → a working proxy is offered, or one can be typed right here.

const KINDS: SourceKind[] = [
  "openai",
  "anthropic",
  "gateway",
  "yandex",
  "openai-compatible",
];

const KEY_LABEL = {
  anthropic: "apiKey",
  gateway: "gatewayKey",
  openai: "apiKey",
  "openai-compatible": "compatibleKey",
  yandex: "yandexKey",
} as const;

const KEY_PLACEHOLDER: Record<SourceKind, string> = {
  anthropic: "sk-ant-…",
  gateway: "vck_…",
  openai: "sk-proj-…",
  "openai-compatible": "",
  yandex: "AQVN…",
};

/** Where the check stands; the step numbers are the stepper's. */
type Phase =
  | { kind: "idle" }
  | { kind: "checking"; proxyUrl?: string }
  | { kind: "proxy-found"; proxy: { id: string; title: string } }
  | { kind: "blocked"; error?: "proxy-invalid" | "proxy-unreachable" }
  | { kind: "declined" }
  | { kind: "models"; route: string | null }
  | { kind: "done"; route: string | null; count: number }
  | { kind: "failed"; state: Extract<ConnectState, { status: "failed" }> };

const stepOf = (phase: Phase) => {
  switch (phase.kind) {
    case "checking": {
      return 1;
    }
    case "proxy-found":
    case "blocked":
    case "declined": {
      return 2;
    }
    case "models": {
      return 3;
    }
    case "done": {
      return 4;
    }
    default: {
      return 0;
    }
  }
};

const Steps = ({ phase, title }: { phase: Phase; title: string }) => {
  const t = useTranslations("sources.connect.steps");
  const step = stepOf(phase);
  const route =
    phase.kind === "models" || phase.kind === "done" ? phase.route : null;
  const steps = [
    {
      description: step === 1 ? t("keyActive", { title }) : t("keyDone"),
      title: t("key"),
    },
    {
      description: route ? t("routeProxy", { proxy: route }) : t("routeDirect"),
      title: t("route"),
    },
    {
      description:
        phase.kind === "done"
          ? t("modelsDone", { count: phase.count })
          : t("modelsActive"),
      title: t("models"),
    },
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
            loading={phase.kind === "checking" || phase.kind === "models"}
            step={i + 1}
          >
            <StepperTrigger className="pointer-events-none items-start gap-2.5 pb-6 last:pb-0">
              <StepperIndicator className="data-[state=completed]:bg-success data-[state=completed]:text-white">
                {i + 1}
              </StepperIndicator>
              <div className="mt-0.5 text-left">
                <StepperTitle>{s.title}</StepperTitle>
                {i + 1 <= step && (
                  <StepperDescription>{s.description}</StepperDescription>
                )}
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

/** What the route step shows once connected: the proxy that was agreed to or typed, else direct. */
const routeTitle = (
  via: { proxyId: string } | { proxyUrl: string } | undefined,
  phase: Phase
) => {
  if (via && "proxyUrl" in via) {
    return new URL(via.proxyUrl).hostname;
  }
  if (via && phase.kind === "proxy-found") {
    return phase.proxy.title;
  }
  return null;
};

const enter = (i: number) => ({
  className:
    "animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:slide-in-from-bottom-0",
  style: { animationDelay: `${Math.min(i, 12) * 35}ms` },
});

const KindList = ({
  connected,
  onPick,
}: {
  connected: SourceKind[];
  onPick: (kind: SourceKind) => void;
}) => {
  const t = useTranslations("sources");
  return (
    <ItemGroup className="gap-2.5">
      {KINDS.map((kind, i) => {
        const e = enter(i);
        return (
          <Item
            className={cn(
              "hover:bg-muted/50 cursor-pointer transition-colors active:scale-[0.99]",
              e.className
            )}
            key={kind}
            render={
              <button
                aria-label={t(`kinds.${kind}.title`)}
                onClick={() => onPick(kind)}
                type="button"
              />
            }
            style={e.style}
            variant="outline"
          >
            <ItemMedia>
              <BrandLogo
                label={t(`kinds.${kind}.title`)}
                logo={sourceLogo({ baseUrl: null, kind, logo: null })}
                size={32}
              />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t(`kinds.${kind}.title`)}</ItemTitle>
              <ItemDescription>{t(`kinds.${kind}.blurb`)}</ItemDescription>
            </ItemContent>
            <ItemActions>
              {connected.includes(kind) ? (
                <Badge size="sm" variant="success-light">
                  <Check /> {t("connect.connected")}
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
};

/** After the key: a working proxy to agree to, a refusal, or no route at all — then a proxy typed right here. */
const RouteAlerts = ({
  phase,
  title,
  onUseProxy,
  onDecline,
  onProxy,
}: {
  phase: Phase;
  title: string;
  onUseProxy: (proxyId: string) => void;
  onDecline: () => void;
  onProxy: (url: string) => void;
}) => {
  const t = useTranslations("sources");
  const [proxyUrl, setProxyUrl] = useState("");
  const blockedError =
    phase.kind === "blocked" && phase.error
      ? failureText(t, phase.error, title)
      : null;
  const check = () => proxyUrl.trim() && onProxy(proxyUrl.trim());
  return (
    <>
      {phase.kind === "proxy-found" && (
        <Alert variant="info">
          <Route />
          <AlertTitle>
            {t("connect.proxyFound.title", { proxy: phase.proxy.title, title })}
          </AlertTitle>
          <AlertDescription>
            {t("connect.proxyFound.text", { title })}
            <span className="mt-3 flex gap-2">
              <Button
                onClick={() => onUseProxy(phase.proxy.id)}
                size="sm"
                type="button"
              >
                {t("connect.proxyFound.yes")}
              </Button>
              <Button
                onClick={onDecline}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("connect.proxyFound.no")}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {phase.kind === "declined" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{t("connect.declined.title", { title })}</AlertTitle>
          <AlertDescription>{t("connect.declined.text")}</AlertDescription>
        </Alert>
      )}

      {phase.kind === "blocked" && (
        <Alert variant="warning">
          <Globe />
          <AlertTitle>{t("connect.blocked.title", { title })}</AlertTitle>
          <AlertDescription>
            {t("connect.blocked.text", { title })}
            <span className="mt-3 flex w-full flex-col gap-2 sm:flex-row">
              <InputGroup className="flex-1">
                <InputGroupAddon>
                  <Network />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={t("connect.blocked.proxy")}
                  autoComplete="off"
                  className="font-mono"
                  data-1p-ignore
                  data-lpignore="true"
                  onChange={(e) => setProxyUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      check();
                    }
                  }}
                  placeholder={t("connect.blocked.placeholder")}
                  value={proxyUrl}
                />
              </InputGroup>
              <Button
                disabled={!proxyUrl.trim()}
                onClick={check}
                type="button"
                variant="outline"
              >
                {t("connect.blocked.check")}
              </Button>
            </span>
            {blockedError && (
              <span className="text-destructive mt-2 block">
                <b>{blockedError.title}.</b> {blockedError.text}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};

const ConnectForm = ({
  kind,
  onBack,
  onDone,
}: {
  kind: SourceKind;
  onBack: () => void;
  onDone: (sourceId: string) => void;
}) => {
  const t = useTranslations("sources");
  const title = t(`kinds.${kind}.title`);
  const [apiKey, setApiKey] = useState("");
  const [folderId, setFolderId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [, start] = useTransition();
  const busy = phase.kind === "checking" || phase.kind === "models";

  const input = (): SourceInput => ({
    apiKey: apiKey.trim() || undefined,
    baseUrl: kind === "openai-compatible" ? baseUrl.trim() : undefined,
    kind,
    options:
      kind === "yandex"
        ? { folderId: folderId.trim(), kind: "yandex" }
        : ({ kind } as SourceInput["options"]),
  });

  /** One round: check (and connect when it works), then pull the models. */
  const run = (via?: { proxyId: string } | { proxyUrl: string }) =>
    start(async () => {
      setErrors({});
      setPhase({
        kind: "checking",
        proxyUrl: via && "proxyUrl" in via ? via.proxyUrl : undefined,
      });
      const result = await connect(input(), via);
      switch (result.status) {
        case "invalid": {
          setErrors(result.errors);
          setPhase({ kind: "idle" });
          return;
        }
        case "proxy-found": {
          setPhase({ kind: "proxy-found", proxy: result.proxy });
          return;
        }
        case "blocked": {
          setPhase({ kind: "blocked" });
          return;
        }
        case "proxy-failed": {
          setPhase({
            error:
              result.reason === "invalid-url"
                ? "proxy-invalid"
                : "proxy-unreachable",
            kind: "blocked",
          });
          return;
        }
        case "failed": {
          setPhase({ kind: "failed", state: result });
          return;
        }
        default: {
          const route = routeTitle(via, phase);
          setPhase({ kind: "models", route });
          const synced = await sync(result.sourceId);
          setPhase({
            count: synced.ok ? synced.total : 0,
            kind: "done",
            route,
          });
          onDone(result.sourceId);
        }
      }
    });

  const failure =
    phase.kind === "failed"
      ? failureText(t, phase.state.reason, title, phase.state.httpStatus)
      : null;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <DialogHeader className="flex-row items-center gap-3">
        <BrandLogo
          label={title}
          logo={sourceLogo({ baseUrl: baseUrl || null, kind, logo: null })}
          size={36}
        />
        <div className="flex flex-col gap-0.5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t(`kinds.${kind}.blurb`)}</DialogDescription>
        </div>
      </DialogHeader>

      <FieldGroup>
        {kind === "yandex" && (
          <Field data-invalid={Boolean(errors.folderId)}>
            <FieldLabel htmlFor="source-folder">
              {t("connect.folder")}
            </FieldLabel>
            <Input
              aria-invalid={Boolean(errors.folderId)}
              autoComplete="off"
              className="font-mono"
              disabled={busy}
              id="source-folder"
              onChange={(e) => setFolderId(e.target.value)}
              placeholder="b1g…"
              value={folderId}
            />
            {errors.folderId ? (
              <FieldError>{errors.folderId}</FieldError>
            ) : (
              <FieldDescription>{t("connect.folderHint")}</FieldDescription>
            )}
          </Field>
        )}
        {kind === "openai-compatible" && (
          <Field data-invalid={Boolean(errors.baseUrl)}>
            <FieldLabel htmlFor="source-url">{t("connect.baseUrl")}</FieldLabel>
            <Input
              aria-invalid={Boolean(errors.baseUrl)}
              autoComplete="off"
              className="font-mono"
              disabled={busy}
              id="source-url"
              inputMode="url"
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://ollama:11434/v1"
              value={baseUrl}
            />
            {errors.baseUrl ? (
              <FieldError>{errors.baseUrl}</FieldError>
            ) : (
              <FieldDescription>{t("connect.baseUrlHint")}</FieldDescription>
            )}
          </Field>
        )}
        <Field data-invalid={Boolean(errors.apiKey)}>
          <FieldLabel htmlFor="source-key">
            {t(`connect.${KEY_LABEL[kind]}`)}
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <KeyRound />
            </InputGroupAddon>
            <SecretInput
              aria-invalid={Boolean(errors.apiKey)}
              autoFocus={kind !== "yandex" && kind !== "openai-compatible"}
              disabled={busy}
              id="source-key"
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                kind === "openai-compatible"
                  ? t("connect.optional")
                  : KEY_PLACEHOLDER[kind]
              }
              value={apiKey}
            />
          </InputGroup>
          {errors.apiKey ? (
            <FieldError>{errors.apiKey}</FieldError>
          ) : (
            <FieldDescription>{t("connect.keyHint")}</FieldDescription>
          )}
        </Field>
      </FieldGroup>

      {phase.kind !== "idle" && phase.kind !== "failed" && (
        <div className="rounded-xl border p-4">
          <Steps phase={phase} title={title} />
        </div>
      )}

      {failure && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{failure.title}</AlertTitle>
          <AlertDescription>{failure.text}</AlertDescription>
        </Alert>
      )}

      <RouteAlerts
        onDecline={() => setPhase({ kind: "declined" })}
        onProxy={(value) => run({ proxyUrl: value })}
        onUseProxy={(id) => run({ proxyId: id })}
        phase={phase}
        title={title}
      />

      <DialogFooter className="sm:justify-between">
        <Button disabled={busy} onClick={onBack} type="button" variant="ghost">
          <ArrowLeft /> {t("connect.back")}
        </Button>
        <Button disabled={busy || phase.kind === "done"} type="submit">
          {busy && <LoaderCircle className="animate-spin" />}
          {t("connect.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
};

/** Opens over any sources screen with `?connect=1`; a new source opens on its own page. */
export const ConnectDialog = ({
  connectedKinds,
}: {
  connectedKinds: SourceKind[];
}) => {
  const t = useTranslations("sources.connect");
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const open = params.get("connect") === "1";
  const [kind, setKind] = useState<SourceKind | null>(null);
  const close = () => {
    router.replace(pathname, { scroll: false });
    setKind(null);
  };
  return (
    <Dialog onOpenChange={(next) => !next && close()} open={open}>
      <DialogContent className="sm:max-w-lg">
        {kind ? (
          <ConnectForm
            key={kind}
            kind={kind}
            onBack={() => setKind(null)}
            onDone={(id) => {
              setKind(null);
              router.push(`/settings/sources/${id}`);
            }}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("description")}</DialogDescription>
            </DialogHeader>
            <KindList connected={connectedKinds} onPick={setKind} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
