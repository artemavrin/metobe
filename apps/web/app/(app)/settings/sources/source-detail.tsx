"use client";

import type { SourceDetail as Detail } from "@metobe/core/sources-read";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metobe/ui/components/dialog";
import { Input } from "@metobe/ui/components/input";
import { InputGroup, InputGroupAddon } from "@metobe/ui/components/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metobe/ui/components/popover";
import { SecretInput } from "@metobe/ui/components/secret-input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { KeyRound, RefreshCw } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import type { ReactNode } from "react";

import { LogoPicker } from "@/components/logo-picker";
import { Row, Rows, Section } from "@/components/settings/rows";
import { sourceLogo } from "@/lib/source-logo";

import {
  recheck,
  remove,
  rename,
  replaceKey,
  setEnabled,
  setLogo,
  setRoute,
  updateConfig,
} from "./actions";
import { failureText } from "./failure";
import { SourceModels } from "./source-models";

// One source (prototype P7, «Погружение»): what it is and whether it works, how it is reached, its models, and how
// to disconnect it. Every change goes through a server action; the page re-renders with fresh data.

type T = ReturnType<typeof useTranslations<"sources">>;

/** The last check as a pill; the popover tells what exactly was checked and over which route. */
type HealthTone = "busy" | "ok" | "error" | "never";
const DOT_CLASS: Record<HealthTone, string> = {
  busy: "bg-warning animate-pulse",
  error: "bg-destructive",
  never: "bg-muted-foreground/40",
  ok: "bg-success",
};

const healthTone = (
  health: Detail["source"]["health"],
  busy: boolean
): HealthTone => {
  if (busy) {
    return "busy";
  }
  if (!health) {
    return "never";
  }
  return health.state;
};

/** The last check as a pill; the popover tells what exactly was checked and over which route. */
const HealthPill = ({ detail, busy }: { detail: Detail; busy: boolean }) => {
  const t = useTranslations("sources");
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const h = detail.source.health;
  const { title } = detail.source;
  // The page's «now» is when it was rendered; a check made after that is «just now», never «in 3 seconds».
  const checked = h ? new Date(h.checkedAt) : null;
  const when = checked
    ? format.relativeTime(checked > now ? now : checked, now)
    : null;
  const failure =
    h?.state === "error" && h.reason
      ? failureText(t, h.reason, title, h.status)
      : null;
  const { route } = detail;
  const via =
    route.kind === "proxy"
      ? detail.proxies.find((p) => p.id === route.proxyId)?.title
      : undefined;
  const tone = healthTone(h, busy);
  const label = {
    busy: () => t("detail.checking"),
    error: () => t("detail.health.error"),
    never: () => t("detail.health.never"),
    ok: () => t("detail.health.ok", { ms: h?.latencyMs ?? 0 }),
  }[tone]();
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            aria-label={`${t("detail.health.last")}: ${label}`}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors duration-150",
              tone === "error" && "border-destructive/40 text-destructive"
            )}
            type="button"
          />
        }
      >
        <span
          className={cn(
            "size-1.5 rounded-full transition-colors duration-200",
            DOT_CLASS[tone]
          )}
        />
        {label}
        {when && !busy && (
          <span className="text-muted-foreground">· {when}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 text-sm">
        <p className="font-medium">{t("detail.health.last")}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted-foreground">{t("detail.health.when")}</dt>
          <dd>{when ?? t("detail.health.never")}</dd>
          <dt className="text-muted-foreground">{t("detail.health.result")}</dt>
          <dd className={cn(failure && "text-destructive")}>
            {failure ? failure.title : label}
          </dd>
          <dt className="text-muted-foreground">{t("detail.health.route")}</dt>
          <dd>
            {via
              ? t("detail.health.viaProxy", { proxy: via })
              : t("detail.health.direct")}
          </dd>
        </dl>
        {failure && (
          <p className="text-muted-foreground mt-2 text-xs">{failure.text}</p>
        )}
        <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
          {t("detail.health.footnote")}
        </p>
      </PopoverContent>
    </Popover>
  );
};

/** An editor that opens under its row: the field on the whole width, «Отмена» and the main action, the error below. */
const RowEditor = ({
  field,
  error,
  hint,
  onCancel,
  primary,
}: {
  field: ReactNode;
  error?: string | null;
  hint?: string;
  onCancel?: () => void;
  primary: ReactNode;
}) => {
  const t = useTranslations("sources.detail");
  return (
    <div className="animate-in fade-in fill-mode-both flex flex-col gap-2 px-4 pb-4 duration-150">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          {field}
        </div>
        {onCancel && (
          <Button onClick={onCancel} type="button" variant="ghost">
            {t("cancel")}
          </Button>
        )}
        {primary}
      </div>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        hint && <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
};

const KeyRow = ({ detail, t }: { detail: Detail; t: T }) => {
  const broken = detail.source.health?.reason === "auth";
  const [open, setOpen] = useState(broken);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const result = await replaceKey(detail.source.id, value);
      if (result.ok) {
        setOpen(false);
        setValue("");
      } else {
        setError(
          `${t("detail.keyRejected")} ${failureText(t, result.reason, detail.source.title, result.httpStatus).title}.`
        );
      }
    });
  return (
    <div id="source-key">
      <Row
        action={
          !open && (
            <Button onClick={() => setOpen(true)} size="sm" variant="ghost">
              {t("detail.replace")}
            </Button>
          )
        }
        hint={t("detail.keyStored")}
        label={t("detail.key")}
      >
        <span
          className={cn(
            "font-mono text-sm",
            broken && "text-destructive",
            !detail.keyHint && "text-muted-foreground font-sans"
          )}
        >
          {detail.keyHint ?? t("detail.noKey")}
        </span>
      </Row>
      {open && (
        <RowEditor
          error={error}
          field={
            <InputGroup>
              <InputGroupAddon>
                <KeyRound />
              </InputGroupAddon>
              <SecretInput
                aria-label={t("detail.newKey")}
                autoFocus
                disabled={pending}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && value.trim()) {
                    submit();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setOpen(false);
                  }
                }}
                value={value}
              />
            </InputGroup>
          }
          hint={
            detail.keyHint
              ? t("detail.keyNow", { hint: detail.keyHint })
              : undefined
          }
          onCancel={pending ? undefined : () => setOpen(false)}
          primary={
            <Button disabled={!value.trim() || pending} onClick={submit}>
              {pending && <Spinner />}
              {t("detail.check")}
            </Button>
          }
        />
      )}
    </div>
  );
};

/** The Yandex folder or the OpenAI-compatible address: saved only if the source answers with it. */
const ConfigRow = ({ detail, t }: { detail: Detail; t: T }) => {
  const { source } = detail;
  const yandex = source.kind === "yandex";
  const folder =
    source.options.kind === "yandex" ? source.options.folderId : "";
  const current = yandex ? folder : (source.baseUrl ?? "");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const result = await updateConfig(
        source.id,
        yandex ? { folderId: value } : { baseUrl: value }
      );
      if (result.ok) {
        setOpen(false);
      } else if ("invalid" in result) {
        setError(result.invalid);
      } else {
        setError(
          `${t("detail.configRejected")} ${failureText(t, result.reason, source.title, result.httpStatus).title}.`
        );
      }
    });
  return (
    <div>
      <Row
        action={
          !open && (
            <Button
              onClick={() => {
                setValue(current);
                setOpen(true);
              }}
              size="sm"
              variant="ghost"
            >
              {t("detail.edit")}
            </Button>
          )
        }
        hint={yandex ? t("connect.folderHint") : t("connect.baseUrlHint")}
        label={yandex ? t("connect.folder") : t("connect.baseUrl")}
      >
        <span className="font-mono text-sm break-all">
          {current || t("detail.notSet")}
        </span>
      </Row>
      {open && (
        <RowEditor
          error={error}
          field={
            <Input
              autoComplete="off"
              autoFocus
              className="font-mono"
              disabled={pending}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  submit();
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              value={value}
            />
          }
          onCancel={pending ? undefined : () => setOpen(false)}
          primary={
            <Button disabled={!value.trim() || pending} onClick={submit}>
              {pending && <Spinner />}
              {t("detail.save")}
            </Button>
          }
        />
      )}
    </div>
  );
};

const routeLabel = (
  t: T,
  source: Detail["source"],
  via: string | undefined,
  chosen: string | undefined
) => {
  if (source.proxyMode === "auto") {
    return via
      ? t("detail.route.autoVia", { proxy: via })
      : t("detail.route.autoDirect");
  }
  if (source.proxyMode === "direct") {
    return t("detail.route.direct");
  }
  return chosen ?? t("detail.route.gone");
};

/** Why the traffic goes where it goes, in the words of the route picker. */
const routeWhy = (
  t: T,
  route: Detail["route"],
  via: string | undefined,
  host: string
) => {
  if (route.kind === "direct") {
    return route.why === "explicit"
      ? t("detail.route.whyDirect")
      : t("detail.route.whyNoMatch", { host });
  }
  return route.why === "domain"
    ? t("detail.route.whyDomain", { domain: route.domain, proxy: via ?? "" })
    : t("detail.route.whyProxy");
};

/** «Авто» (by proxy domains), «Напрямую» or one proxy — two views of one field (ARCH §18.2). */
const RouteRow = ({ detail, t }: { detail: Detail; t: T }) => {
  const { source, route, proxies } = detail;
  const [pending, start] = useTransition();
  const saved =
    source.proxyMode === "proxy"
      ? (source.proxyId ?? "gone")
      : source.proxyMode;
  // The pick shows at once; the recheck over the new route follows.
  const [value, setPicked] = useOptimistic(saved);
  const mode = value === "auto" || value === "direct" ? value : "proxy";
  const titleOf = (id: string | null | undefined) =>
    proxies.find((p) => p.id === id)?.title;
  const via = route.kind === "proxy" ? titleOf(route.proxyId) : undefined;
  const shown = routeLabel(
    t,
    { ...source, proxyMode: mode },
    via,
    titleOf(mode === "proxy" ? value : source.proxyId)
  );
  const why = routeWhy(t, route, via, detail.host);
  return (
    <Row hint={t("detail.route.hint")} label={t("detail.route.label")}>
      <div className="flex flex-col gap-1 md:items-end">
        <Select
          disabled={pending}
          onValueChange={(next) =>
            start(async () => {
              setPicked(String(next));
              const nextMode =
                next === "auto" || next === "direct" ? next : "proxy";
              await setRoute(source.id, {
                mode: nextMode,
                proxyId: nextMode === "proxy" ? String(next) : null,
              });
            })
          }
          value={value}
        >
          <SelectTrigger className="w-full md:w-72">
            <SelectValue>{shown}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              <span className="flex flex-col">
                {t("detail.route.auto")}
                <span className="text-muted-foreground text-xs">
                  {t("detail.route.autoHint")}
                </span>
              </span>
            </SelectItem>
            <SelectItem value="direct">{t("detail.route.direct")}</SelectItem>
            {proxies.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>{t("detail.route.proxies")}</SelectLabel>
                  {proxies.map((p) => (
                    <SelectItem disabled={!p.enabled} key={p.id} value={p.id}>
                      {p.title}
                      {p.health?.latencyMs !== undefined && (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {t("detail.route.latency", {
                            ms: p.health.latencyMs,
                          })}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs md:text-right">
          {pending ? t("detail.checking") : why}
        </span>
      </div>
    </Row>
  );
};

const RemoveSection = ({ detail, t }: { detail: Detail; t: T }) => {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { title } = detail.source;
  const inChat = detail.models.filter((m) => m.enabled).length;
  return (
    <Section title={t("detail.remove.section")}>
      <Rows>
        <Row
          action={
            <Dialog>
              <DialogTrigger
                render={<Button size="sm" variant="destructive" />}
              >
                {t("detail.remove.title", { title })}
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {t("detail.remove.confirm", { title })}
                  </DialogTitle>
                  <DialogDescription>
                    {t("detail.remove.text", { count: inChat })}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="ghost" />}>
                    {t("detail.cancel")}
                  </DialogClose>
                  <Button
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await remove(detail.source.id);
                        router.replace("/settings/sources");
                      })
                    }
                    variant="destructive"
                  >
                    {pending && <Spinner />}
                    {t("detail.remove.action")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
          hint={t("detail.remove.hint")}
          label={t("detail.remove.title", { title })}
        />
      </Rows>
    </Section>
  );
};

export const SourceDetail = ({ detail }: { detail: Detail }) => {
  const t = useTranslations("sources");
  const { source } = detail;
  const [checking, startCheck] = useTransition();
  const [, startToggle] = useTransition();
  // The switch moves at once; the server's answer confirms it.
  const [enabled, setOptimisticEnabled] = useOptimistic(source.enabled);
  const toggleEnabled = (on: boolean) =>
    startToggle(async () => {
      setOptimisticEnabled(on);
      await setEnabled(source.id, on);
    });
  const [name, setName] = useState(source.title);
  const broken = source.health?.state === "error";
  const hasConfig =
    source.kind === "yandex" || source.kind === "openai-compatible";

  const saveName = () => {
    const next = name.trim();
    if (!next) {
      setName(source.title);
      return;
    }
    if (next !== source.title) {
      startToggle(() => rename(source.id, next));
    }
  };

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <LogoPicker
            hosts
            label={source.title}
            onPick={(logo) => startToggle(() => setLogo(source.id, logo))}
            size={48}
            value={sourceLogo(source)}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <Input
              aria-label={t("detail.name")}
              className="hover:border-input h-8 border-transparent bg-transparent px-1.5 text-xl font-semibold shadow-none md:text-xl dark:bg-transparent"
              onBlur={saveName}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              value={name}
            />
            <div className="flex flex-wrap items-center gap-2 px-1.5">
              <HealthPill busy={checking} detail={detail} />
              <span className="text-muted-foreground text-xs">
                {t(`kinds.${source.kind}.blurb`)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            {t("detail.enabled")}
            <Switch checked={enabled} onCheckedChange={toggleEnabled} />
          </label>
          <Button
            disabled={checking}
            onClick={() =>
              startCheck(async () => {
                await recheck(source.id);
              })
            }
            size="sm"
            variant="outline"
          >
            <RefreshCw className={cn(checking && "animate-spin")} />
            {t("detail.recheck")}
          </Button>
        </div>
      </header>

      {enabled ? (
        broken &&
        source.health?.reason && (
          <div className="border-destructive/25 bg-destructive/5 animate-in fade-in slide-in-from-top-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 duration-200">
            <div>
              <p className="font-medium">{t("detail.broken.title")}</p>
              <p className="text-muted-foreground text-xs">
                {
                  failureText(
                    t,
                    source.health.reason,
                    source.title,
                    source.health.status
                  ).text
                }
              </p>
            </div>
            {source.health.reason === "auth" && (
              <Button
                onClick={() =>
                  document
                    .querySelector<HTMLInputElement>("#source-key input")
                    ?.focus()
                }
                size="sm"
                variant="outline"
              >
                {t("detail.broken.replaceKey")}
              </Button>
            )}
          </div>
        )
      ) : (
        <div className="bg-muted/40 animate-in fade-in slide-in-from-top-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 duration-200">
          <div>
            <p className="font-medium">{t("detail.off.title")}</p>
            <p className="text-muted-foreground text-xs">
              {t("detail.off.text")}
            </p>
          </div>
          <Button
            onClick={() => toggleEnabled(true)}
            size="sm"
            variant="outline"
          >
            {t("detail.off.on")}
          </Button>
        </div>
      )}

      <Section title={t("detail.connection")}>
        <Rows>
          <KeyRow detail={detail} t={t} />
          {hasConfig && <ConfigRow detail={detail} t={t} />}
          <RouteRow detail={detail} t={t} />
        </Rows>
      </Section>

      <SourceModels detail={detail} dimmed={!enabled || broken} />

      <RemoveSection detail={detail} t={t} />
    </>
  );
};
