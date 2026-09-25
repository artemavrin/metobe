"use client";

import { proxyTypes } from "@metobe/contracts/proxies";
import type { ProxyDetail as Detail } from "@metobe/core/proxies";
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
import { InputGroup } from "@metobe/ui/components/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metobe/ui/components/popover";
import { SecretInput } from "@metobe/ui/components/secret-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { RefreshCw, X } from "lucide-react";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { ProxyMark } from "@/components/proxy-mark";
import { Row, Rows, Section } from "@/components/settings/rows";
import { flagOf } from "@/lib/proxy-flag";
import { sourceLogo } from "@/lib/source-logo";

import {
  addDomain,
  recheck,
  remove,
  removeDomain,
  rename,
  routeSource,
  setAddress,
  setCredentials,
  setEnabled,
  setType,
} from "./actions";

// One proxy (prototype P7, «Погружение»): whether it works and where it exits, how to reach it, what goes through
// it (sources it serves and the domains it claims for «Авто»), and how to remove it.

type T = ReturnType<typeof useTranslations<"proxies.detail">>;
const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-bwignore": true,
  "data-form-type": "other",
  "data-lpignore": "true",
  spellCheck: false,
} as const;

type Health = Detail["proxy"]["health"];

const pillLabel = (h: Health, busy: boolean, t: T) => {
  if (busy) {
    return t("checking");
  }
  if (h?.state === "ok") {
    return t("pill.ok", { ms: h.latencyMs ?? 0 });
  }
  return h ? t("pill.error") : t("pill.never");
};

const pillDot = (h: Health, busy: boolean) => {
  if (busy) {
    return "bg-warning animate-pulse";
  }
  if (!h) {
    return "bg-muted-foreground/40";
  }
  return h.state === "ok" ? "bg-success" : "bg-destructive";
};

/** What the last check found: when, the request's answer, the exit address and its country. */
const CheckFacts = ({
  h,
  when,
  t,
}: {
  h: NonNullable<Health>;
  when: string | null;
  t: T;
}) => {
  const locale = useLocale();
  const country = h.country
    ? new Intl.DisplayNames([locale], { type: "region" }).of(h.country)
    : null;
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      <dt className="text-muted-foreground">{t("check.when")}</dt>
      <dd>{when}</dd>
      <dt className="text-muted-foreground">{t("check.request")}</dt>
      <dd
        className={cn(
          "font-mono text-xs",
          h.state === "error" && "text-destructive"
        )}
      >
        {h.state === "ok"
          ? `GET ipinfo.io · 200 · ${h.latencyMs ?? 0} ms`
          : h.error}
      </dd>
      {h.ip && (
        <>
          <dt className="text-muted-foreground">{t("check.ip")}</dt>
          <dd className="font-mono text-xs">{h.ip}</dd>
        </>
      )}
      {country && (
        <>
          <dt className="text-muted-foreground">{t("check.country")}</dt>
          <dd>
            {flagOf(h.country)} {country}
          </dd>
        </>
      )}
    </dl>
  );
};

/** The last check as a pill; the popover tells where the traffic exits. */
const CheckPill = ({
  detail,
  busy,
  t,
}: {
  detail: Detail;
  busy: boolean;
  t: T;
}) => {
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const h = detail.proxy.health;
  const checked = h ? new Date(h.checkedAt) : null;
  const when = checked
    ? format.relativeTime(checked > now ? now : checked, now)
    : null;
  const label = pillLabel(h, busy, t);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            aria-label={`${t("check.title")}: ${label}`}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors duration-150",
              h?.state === "error" &&
                !busy &&
                "border-destructive/40 text-destructive"
            )}
            type="button"
          />
        }
      >
        <span
          className={cn(
            "size-1.5 rounded-full transition-colors duration-200",
            pillDot(h, busy)
          )}
        />
        {label}
        {when && !busy && (
          <span className="text-muted-foreground">· {when}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 text-sm">
        <p className="font-medium">{t("check.title")}</p>
        {h ? (
          <CheckFacts h={h} t={t} when={when} />
        ) : (
          <p className="text-muted-foreground mt-2">{t("pill.never")}</p>
        )}
        <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
          {t("check.footnote")}
        </p>
      </PopoverContent>
    </Popover>
  );
};

/** A row whose value opens into an editor under it: the field, «Отмена», the main action, the error below. */
const EditRow = ({
  label,
  hint,
  value,
  editor,
  onSave,
  t,
}: {
  label: string;
  hint?: string;
  value: ReactNode;
  /** The field(s); Enter inside saves, Esc cancels. */
  editor: ReactNode;
  onSave: () => Promise<string | null>;
  t: T;
}) => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Esc inside the editor cancels it; captured first, so the settings shell doesn't close on the same key.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && formRef.current?.contains(e.target as Node)) {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const problem = await onSave();
      if (problem) {
        setError(problem);
      } else {
        setOpen(false);
      }
    });
  return (
    <div>
      <Row
        action={
          !open && (
            <Button onClick={() => setOpen(true)} size="sm" variant="ghost">
              {t("edit")}
            </Button>
          )
        }
        hint={hint}
        label={label}
      >
        {value}
      </Row>
      {open && (
        // A form: Enter in a field saves; Esc cancels without closing settings.
        <form
          ref={formRef}
          className="animate-in fade-in fill-mode-both flex flex-col gap-2 px-4 pb-4 duration-150"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) {
              submit();
            }
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 basis-full flex-wrap gap-2 sm:flex-1 sm:basis-auto">
              {editor}
            </div>
            {!pending && (
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="ghost"
              >
                {t("cancel")}
              </Button>
            )}
            <Button aria-disabled={pending} type="submit">
              {pending && <Spinner />}
              {t("save")}
            </Button>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </form>
      )}
    </div>
  );
};

/** Why a source's traffic goes where it goes, from this proxy's point of view. */
const noteOf = (
  s: Detail["sources"][number],
  proxyId: string,
  titleOf: (id: string) => string,
  t: T
) => {
  const { route } = s;
  if (route.kind === "proxy" && route.proxyId === proxyId) {
    return route.why === "domain"
      ? t("note.domain", { domain: route.domain })
      : t("note.explicit");
  }
  if (route.kind === "proxy") {
    return t("note.other", { proxy: titleOf(route.proxyId) });
  }
  return s.proxyMode === "direct" ? t("note.direct") : t("note.auto");
};

export const ProxyDetail = ({ detail }: { detail: Detail }) => {
  const t = useTranslations("proxies.detail");
  const tt = useTranslations("proxies.types");
  const router = useRouter();
  const { proxy, sources, domains } = detail;
  const [name, setName] = useState(proxy.title);
  const [checking, startCheck] = useTransition();
  const [, startChange] = useTransition();
  const [addressDraft, setAddressDraft] = useState(
    `${proxy.host}:${proxy.port}`
  );
  const [login, setLogin] = useState(proxy.username ?? "");
  const [password, setPassword] = useState("");
  const [domain, setDomain] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const [enabled, setOptimisticEnabled] = useOptimistic(proxy.enabled);
  const mine = (s: Detail["sources"][number]) =>
    s.route.kind === "proxy" && s.route.proxyId === proxy.id;
  const [routedHere, setOptimisticRoute] = useOptimistic(
    new Set(sources.filter(mine).map((s) => s.id)),
    (current, change: { id: string; on: boolean }) => {
      const next = new Set(current);
      if (change.on) {
        next.add(change.id);
      } else {
        next.delete(change.id);
      }
      return next;
    }
  );
  const through = sources.filter((s) => routedHere.has(s.id));
  const names = through.map((s) => s.title).join(", ");
  const h = proxy.health;

  const saveName = () => {
    const next = name.trim();
    if (!next) {
      setName(proxy.title);
      return;
    }
    if (next !== proxy.title) {
      startChange(() => rename(proxy.id, next));
    }
  };

  const submitDomain = () =>
    startChange(async () => {
      if (!domain.trim()) {
        return;
      }
      setDomainError(null);
      const result = await addDomain(proxy.id, domain);
      if (result.ok) {
        setDomain("");
      } else if ("invalid" in result) {
        setDomainError(t("domainInvalid"));
      } else {
        setDomainError(t("domainTaken", { proxy: result.takenBy }));
      }
    });

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ProxyMark
            flag={h?.state === "ok" ? flagOf(h.country) : null}
            size={48}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <Input
              {...NO_AUTOFILL}
              aria-label={t("name")}
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
              <CheckPill busy={checking} detail={detail} t={t} />
              {h?.state === "ok" && h.ip && (
                <span className="text-muted-foreground font-mono text-xs">
                  {t("exit", { ip: h.ip })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label
            className="flex items-center gap-2 text-sm"
            title={t("enabledHint")}
          >
            {t("enabled")}
            <Switch
              checked={enabled}
              onCheckedChange={(on) =>
                startChange(async () => {
                  setOptimisticEnabled(on);
                  await setEnabled(proxy.id, on);
                })
              }
            />
          </label>
          <Button
            disabled={checking}
            onClick={() =>
              startCheck(async () => {
                await recheck(proxy.id);
              })
            }
            size="sm"
            variant="outline"
          >
            <RefreshCw className={cn(checking && "animate-spin")} />
            {t("recheck")}
          </Button>
        </div>
      </header>

      <Section title={t("connection")}>
        <Rows>
          <Row hint={tt(`${proxy.type}.hint`)} label={t("type")}>
            <Select
              onValueChange={(v) =>
                startChange(() => setType(proxy.id, String(v)))
              }
              value={proxy.type}
            >
              <SelectTrigger className="w-full md:w-40">
                <SelectValue>{tt(`${proxy.type}.label`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {proxyTypes.map((x) => (
                  <SelectItem key={x} value={x}>
                    {tt(`${x}.label`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <EditRow
            editor={
              <Input
                {...NO_AUTOFILL}
                autoFocus
                className="font-mono"
                onChange={(e) => setAddressDraft(e.target.value)}
                placeholder="proxy.corp.local:3128"
                value={addressDraft}
              />
            }
            hint={t("addressHint")}
            label={t("address")}
            onSave={async () => {
              const result = await setAddress(
                proxy.id,
                addressDraft,
                proxy.type
              );
              return result.ok ? null : t("addressInvalid");
            }}
            t={t}
            value={
              <span className="font-mono text-sm">{`${proxy.host}:${proxy.port}`}</span>
            }
          />
          <EditRow
            editor={
              <>
                <Input
                  {...NO_AUTOFILL}
                  aria-label={t("username")}
                  autoFocus
                  className="w-full font-mono sm:w-48"
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder={t("username")}
                  value={login}
                />
                <InputGroup className="w-full sm:w-56">
                  <SecretInput
                    aria-label={t("password")}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      detail.hasPassword ? t("passwordKeep") : t("password")
                    }
                    value={password}
                  />
                </InputGroup>
              </>
            }
            hint={t("loginHint")}
            label={t("login")}
            onSave={async () => {
              await setCredentials(proxy.id, login, password);
              setPassword("");
              return null;
            }}
            t={t}
            value={
              proxy.username ? (
                <span className="font-mono text-sm">
                  {proxy.username}
                  {detail.hasPassword && " · ••••••"}
                </span>
              ) : (
                <span className="text-muted-foreground text-sm">
                  {t("noLogin")}
                </span>
              )
            }
          />
        </Rows>
      </Section>

      <Section
        meta={
          through.length
            ? t("throughMeta", { on: through.length, total: sources.length })
            : t("nothing")
        }
        title={t("through")}
      >
        {sources.length > 0 && (
          <Rows>
            {sources.map((s) => {
              const on = routedHere.has(s.id);
              return (
                <div className="flex items-center gap-3 px-4 py-2.5" key={s.id}>
                  <BrandLogo label={s.title} logo={sourceLogo(s)} size={28} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        "truncate font-medium",
                        !on && "text-muted-foreground"
                      )}
                    >
                      {s.title}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      <span className="font-mono">{s.host}</span> ·{" "}
                      {noteOf(
                        s,
                        proxy.id,
                        (id) =>
                          detail.others.find((o) => o.id === id)?.title ?? "",
                        t
                      )}
                    </span>
                  </span>
                  <Switch
                    aria-label={s.title}
                    checked={on}
                    onCheckedChange={(next) =>
                      startChange(async () => {
                        setOptimisticRoute({ id: s.id, on: next });
                        await routeSource(s.id, proxy.id, next);
                      })
                    }
                    size="sm"
                  />
                </div>
              );
            })}
          </Rows>
        )}
        <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
          <span className="font-medium">{t("domains")}</span>
          <span className="text-muted-foreground text-xs">
            {t("domainsHint")}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {domains.map((d) => (
              <span
                className="bg-muted flex h-7 items-center gap-1 rounded-md pr-1 pl-2 font-mono text-xs"
                key={d}
              >
                {d}
                <button
                  aria-label={t("domainRemove", { domain: d })}
                  className="hover:bg-background text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors duration-150"
                  onClick={() => startChange(() => removeDomain(proxy.id, d))}
                  type="button"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <Input
              {...NO_AUTOFILL}
              aria-label={t("domains")}
              className="h-7 w-56 font-mono text-xs"
              onChange={(e) => {
                setDomain(e.target.value);
                setDomainError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitDomain();
                }
              }}
              placeholder={t("domainPlaceholder")}
              value={domain}
            />
          </div>
          {domainError && (
            <p className="text-destructive text-xs">{domainError}</p>
          )}
        </div>
      </Section>

      <Section title={t("remove.section")}>
        <Rows>
          <Row
            action={
              <Dialog>
                <DialogTrigger
                  render={<Button size="sm" variant="destructive" />}
                >
                  {t("remove.action")}
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {t("remove.confirm", { title: proxy.title })}
                    </DialogTitle>
                    <DialogDescription>
                      {through.length
                        ? t("remove.confirmWith", { names })
                        : t("remove.confirmNone")}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                      {t("remove.cancel")}
                    </DialogClose>
                    <Button
                      disabled={removing}
                      onClick={() =>
                        startRemove(async () => {
                          await remove(proxy.id);
                          router.replace("/settings/proxies");
                        })
                      }
                      variant="destructive"
                    >
                      {removing && <Spinner />}
                      {t("remove.action")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            }
            hint={
              through.length
                ? t("remove.withSources", { names })
                : t("remove.noSources")
            }
            label={t("remove.title", { title: proxy.title })}
          />
        </Rows>
      </Section>
    </>
  );
};
