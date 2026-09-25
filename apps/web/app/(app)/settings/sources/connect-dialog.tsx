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
  TriangleAlert,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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

/** Where the check stands. */
type Phase =
  | { kind: "idle" }
  | { kind: "checking"; via?: "proxy" }
  | { kind: "proxy-found"; proxy: { id: string; title: string } }
  | { kind: "blocked"; error?: "proxy-invalid" | "proxy-unreachable" }
  | { kind: "declined" }
  | { kind: "models"; route: string | null }
  | { kind: "done"; route: string | null; count: number }
  | { kind: "failed"; state: Extract<ConnectState, { status: "failed" }> };

type StepState = "done" | "active" | "error" | "warn" | "idle";
interface Step {
  title: string;
  state: StepState;
  description?: string;
}

type TC = ReturnType<typeof useTranslations<"sources">>;

const idle = (name: string): Step => ({ state: "idle", title: name });

/**
 * The steps «ключ → маршрут → модели», only once something went wrong: they show where the check stopped. A check
 * that simply works shows none — the button's own spinner is enough.
 */
const stepsOf = (phase: Phase, t: TC, title: string): Step[] => {
  const key = t("connect.steps.key");
  const route = t("connect.steps.route");
  const models = t("connect.steps.models");
  switch (phase.kind) {
    case "failed": {
      // Short here; the alert under the steps says what to do.
      const short = {
        auth: () => t("status.auth"),
        http: () => t("status.http", { status: phase.state.httpStatus ?? "" }),
        invalid: () => t("status.invalid"),
        "not-found": () => t("status.notFound"),
        unreachable: () => t("status.unreachable"),
      }[phase.state.reason]();
      return [
        { description: short, state: "error", title: key },
        idle(route),
        idle(models),
      ];
    }
    case "blocked":
    case "declined": {
      const proxyError =
        phase.kind === "blocked" && phase.error
          ? failureText(t, phase.error, title).title
          : t("connect.steps.routeFailed");
      return [
        {
          description: t("connect.steps.keyUnknown"),
          state: "warn",
          title: key,
        },
        { description: proxyError, state: "error", title: route },
        idle(models),
      ];
    }
    case "proxy-found": {
      return [
        { description: t("connect.steps.keyDone"), state: "done", title: key },
        {
          description: t("connect.steps.routeFound", {
            proxy: phase.proxy.title,
          }),
          state: "warn",
          title: route,
        },
        idle(models),
      ];
    }
    case "checking": {
      return phase.via
        ? [
            { state: "idle", title: key },
            {
              description: t("connect.steps.routeTrying"),
              state: "active",
              title: route,
            },
            idle(models),
          ]
        : [
            {
              description: t("connect.steps.keyActive", { title }),
              state: "active",
              title: key,
            },
            idle(route),
            idle(models),
          ];
    }
    case "models":
    case "done": {
      const via = phase.route
        ? t("connect.steps.routeProxy", { proxy: phase.route })
        : t("connect.steps.routeDirect");
      return [
        { description: t("connect.steps.keyDone"), state: "done", title: key },
        { description: via, state: "done", title: route },
        phase.kind === "done"
          ? {
              description: t("connect.steps.modelsDone", {
                count: phase.count,
              }),
              state: "done",
              title: models,
            }
          : {
              description: t("connect.steps.modelsActive"),
              state: "active",
              title: models,
            },
      ];
    }
    default: {
      return [];
    }
  }
};

const STEP_ICON: Record<StepState, string> = {
  active: "border-foreground/20 text-foreground",
  done: "border-success bg-success text-white",
  error: "border-destructive bg-destructive text-white",
  idle: "border-border text-muted-foreground",
  warn: "border-warning bg-warning text-white",
};

/** The button tells the happy path by itself: checking → models → connected. */
const SubmitLabel = ({ phase }: { phase: Phase }) => {
  const t = useTranslations("sources.connect");
  const label = {
    checking: t("checking"),
    done: t("done"),
    models: t("loadingModels"),
  }[phase.kind as "checking"];
  return (
    <span
      className="animate-in fade-in flex items-center gap-2 duration-150"
      key={label ? phase.kind : "idle"}
    >
      {phase.kind === "done" && <Check />}
      {(phase.kind === "checking" || phase.kind === "models") && (
        <LoaderCircle className="animate-spin" />
      )}
      {label ?? t("submit")}
    </span>
  );
};

const Steps = ({ steps }: { steps: Step[] }) => (
  <ol className="animate-in fade-in slide-in-from-top-1 fill-mode-both motion-reduce:slide-in-from-top-0 flex flex-col rounded-xl border p-4 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]">
    {steps.map((s, i) => (
      <li className="relative flex gap-3 pb-5 last:pb-0" key={s.title}>
        {i < steps.length - 1 && (
          <span
            aria-hidden
            className={cn(
              "absolute top-7 bottom-1 left-3 w-px -translate-x-1/2 transition-colors duration-200",
              s.state === "done" ? "bg-success" : "bg-border"
            )}
          />
        )}
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors duration-200",
            STEP_ICON[s.state]
          )}
        >
          {s.state === "done" && <Check className="size-3.5" />}
          {s.state === "active" && (
            <LoaderCircle className="size-3.5 animate-spin" />
          )}
          {s.state === "error" && <X className="size-3.5" />}
          {s.state === "warn" && <TriangleAlert className="size-3" />}
          {s.state === "idle" && i + 1}
        </span>
        <span className="flex min-w-0 flex-col pt-0.5">
          <span
            className={cn(
              "text-sm font-medium",
              s.state === "idle" && "text-muted-foreground"
            )}
          >
            {s.title}
          </span>
          {s.description && (
            <span
              className={cn(
                "text-xs",
                s.state === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {s.description}
            </span>
          )}
        </span>
      </li>
    ))}
  </ol>
);

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

/** How long «Готово» stays on screen before the new source opens. */
const DONE_HOLD_MS = 600;

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
  // Steps appear once something went wrong and stay for the retry; a check that just works shows none.
  const [shownSteps, setShownSteps] = useState(false);
  const problem = ["failed", "blocked", "declined", "proxy-found"].includes(
    phase.kind
  );
  if (problem && !shownSteps) {
    setShownSteps(true);
  }
  const troubled = problem || (phase.kind !== "idle" && shownSteps);
  const busy = phase.kind === "checking" || phase.kind === "models";
  // While checking and once connected the form holds still: fields read-only rather than greyed out, the button
  // in full colour — nothing flickers between «disabled» and back.
  const locked = busy || phase.kind === "done";

  const input = (): SourceInput => ({
    apiKey: apiKey.trim() || undefined,
    baseUrl: kind === "openai-compatible" ? baseUrl.trim() : undefined,
    kind,
    options:
      kind === "yandex"
        ? { folderId: folderId.trim(), kind: "yandex" }
        : ({ kind } as SourceInput["options"]),
  });

  /**
   * One round: check (and connect when it works), then pull the models. A plain async function, not a transition:
   * updates inside a transition wait for its end, so the steps would only show once the server had answered.
   */
  const run = async (via?: { proxyId: string } | { proxyUrl: string }) => {
    setErrors({});
    setPhase(via ? { kind: "checking", via: "proxy" } : { kind: "checking" });
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
        // Let the finished steps be seen before the source's page takes over.
        setTimeout(() => onDone(result.sourceId), DONE_HOLD_MS);
      }
    }
  };

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
        if (!locked) {
          void run();
        }
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
              readOnly={locked}
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
              readOnly={locked}
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
              readOnly={locked}
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

      {troubled && phase.kind !== "idle" && (
        <Steps steps={stepsOf(phase, t, title)} />
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
        <Button
          disabled={locked}
          onClick={onBack}
          type="button"
          variant="ghost"
        >
          <ArrowLeft /> {t("connect.back")}
        </Button>
        <Button className="min-w-44" aria-disabled={locked} type="submit">
          <SubmitLabel phase={phase} />
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
  const close = () => router.replace(pathname, { scroll: false });
  return (
    <Dialog
      // Back to the list of kinds only once the dialog is gone, so the list never flashes on the way out.
      onOpenChange={(next) => !next && close()}
      onOpenChangeComplete={(next) => !next && setKind(null)}
      open={open}
    >
      <DialogContent className="sm:max-w-lg">
        {kind ? (
          <ConnectForm
            key={kind}
            kind={kind}
            onBack={() => setKind(null)}
            // The new page has no ?connect, so the dialog closes on its own as it opens.
            onDone={(id) => router.push(`/settings/sources/${id}`)}
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
