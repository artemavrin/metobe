"use client";

import { currencies } from "@metobe/contracts/models";
import type { Currency } from "@metobe/contracts/models";
import type { SourceDetail } from "@metobe/core/sources-read";
import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@metobe/ui/components/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metobe/ui/components/popover";
import { Badge } from "@metobe/ui/components/reui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import {
  Braces,
  Brain,
  ChevronDown,
  Eye,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useOptimistic, useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Section } from "@/components/settings/rows";

import { setPricing, sync, toggleModels } from "./actions";
import type { PricingState } from "./actions";

// A source's models (ARCH §7.1): nothing is on until the admin turns it on; newest first, «новая» for under 90 days;
// grouped by maker, a group switch for all of them; prices per any number of tokens, shown per 1M to compare.

type Model = SourceDetail["models"][number];

const NEW_DAYS = 90;
const SYMBOL: Record<Currency, string> = { RUB: "₽", USD: "$" };

const isNew = (released: string | null) =>
  released !== null &&
  Date.now() - new Date(released).getTime() < NEW_DAYS * 24 * 3600 * 1000;

const contextLabel = (tokens: number | null) => {
  if (!tokens) {
    return null;
  }
  return tokens >= 1_000_000
    ? `${+(tokens / 1_000_000).toFixed(1)}M`
    : `${Math.round(tokens / 1000)}K`;
};

/** A stored price (per `unitTokens`) shown per 1M tokens, rounded only for display. */
const perMillion = (value: string | null, unit: number | null) => {
  if (value === null || !unit) {
    return null;
  }
  const n = (Number(value) * 1_000_000) / unit;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: n < 1 ? 4 : 2,
  }).format(n);
};

const priceLabel = (m: Model) => {
  const input = perMillion(m.priceInput, m.priceUnitTokens);
  const output = perMillion(m.priceOutput, m.priceUnitTokens);
  if (input === null && output === null) {
    return null;
  }
  const s = SYMBOL[(m.priceCurrency ?? "USD") as Currency];
  return `${s}${input ?? "—"} / ${s}${output ?? "—"}`;
};

const CAPS = [
  { icon: Wrench, key: "tools" },
  { icon: Eye, key: "vision" },
  { icon: Brain, key: "reasoning" },
  { icon: Braces, key: "structured" },
] as const;

const CAP_ANSWER = { false: "no", null: "unknown", true: "yes" } as const;

const Caps = ({ model }: { model: Model }) => {
  const t = useTranslations("sources.detail.models.caps");
  return (
    <span className="hidden items-center gap-1 md:inline-flex">
      {CAPS.map(({ icon: Icon, key }) => {
        const value = model.capabilities[key];
        return (
          <Tooltip key={key}>
            <TooltipTrigger
              render={
                <span
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded",
                    value === true && "text-foreground",
                    value === false && "text-muted-foreground/30",
                    value === null &&
                      "text-muted-foreground outline-muted-foreground/40 outline-1 outline-dashed"
                  )}
                />
              }
            >
              <Icon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              {t(key)}:{" "}
              {t(CAP_ANSWER[String(value) as keyof typeof CAP_ANSWER])}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
};

const UNITS = [1, 1000, 1_000_000];
const UNIT_LABEL: Record<number, string> = {
  1: "1",
  1000: "1K",
  1_000_000: "1M",
};
const blank = (v: string) => (v.trim() === "" ? null : v.trim());

/** Prices as in the provider's price list: per any number of tokens, kept exactly as typed. */
const PricingEditor = ({
  model,
  sourceId,
  fromSource,
  onClose,
}: {
  model: Model;
  sourceId: string;
  fromSource: boolean;
  onClose: () => void;
}) => {
  const t = useTranslations("sources.detail");
  const [values, setValues] = useState({
    cacheRead: model.priceCacheRead ?? "",
    cacheWrite: model.priceCacheWrite ?? "",
    input: model.priceInput ?? "",
    output: model.priceOutput ?? "",
  });
  const [unit, setUnit] = useState(String(model.priceUnitTokens ?? 1_000_000));
  const [currency, setCurrency] = useState<Currency>(
    (model.priceCurrency ?? "USD") as Currency
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = (result: PricingState) =>
    result.ok ? onClose() : setError(result.error);
  const save = () =>
    start(async () => {
      done(
        await setPricing(sourceId, model.id, {
          cacheRead: blank(values.cacheRead),
          cacheWrite: blank(values.cacheWrite),
          currency,
          input: blank(values.input),
          output: blank(values.output),
          unitTokens: Number(unit),
        })
      );
    });
  const field = (key: keyof typeof values) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{t(`pricing.${key}`)}</span>
      <InputGroup>
        <InputGroupAddon>{SYMBOL[currency]}</InputGroupAddon>
        <InputGroupInput
          autoComplete="off"
          className="font-mono tabular-nums"
          inputMode="decimal"
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          placeholder="0"
          value={values[key]}
        />
      </InputGroup>
    </label>
  );
  return (
    <div className="animate-in fade-in fill-mode-both bg-muted/30 flex flex-col gap-3 border-t px-4 py-3 duration-150 md:pl-12">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {field("input")}
        {field("output")}
        {field("cacheRead")}
        {field("cacheWrite")}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t("pricing.unit")}</span>
          <div className="flex items-center gap-1">
            <Input
              autoComplete="off"
              className="w-32 font-mono tabular-nums"
              inputMode="numeric"
              onChange={(e) => setUnit(e.target.value.replaceAll(/\D/gu, ""))}
              value={unit}
            />
            {UNITS.map((u) => (
              <Button
                className={cn(String(u) === unit && "bg-muted")}
                key={u}
                onClick={() => setUnit(String(u))}
                size="sm"
                type="button"
                variant="ghost"
              >
                {UNIT_LABEL[u]}
              </Button>
            ))}
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t("pricing.currency")}</span>
          <Select
            onValueChange={(v) => setCurrency(v as Currency)}
            value={currency}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () =>
                done(await setPricing(sourceId, model.id, null))
              )
            }
            type="button"
            variant="ghost"
          >
            {t("pricing.clear")}
          </Button>
          <Button onClick={onClose} type="button" variant="ghost">
            {t("cancel")}
          </Button>
          <Button disabled={pending} onClick={save} type="button">
            {pending && <Spinner />}
            {t("save")}
          </Button>
        </div>
      </div>
      <p
        className={cn(
          "text-xs",
          error ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {error ?? (fromSource ? t("pricing.fromSource") : t("pricing.hint"))}
      </p>
    </div>
  );
};

const CHIPS_SHOWN = 6;

/**
 * Makers of a source's models as chips, when there is more than one (the Gateway, Yandex, Ollama): the six with most
 * models in a row, the rest behind «Ещё N». Several can be picked; picking again lets go.
 */
const ProviderChips = ({
  models,
  picked,
  onPick,
}: {
  models: Model[];
  picked: Set<string>;
  onPick: (providerId: string) => void;
}) => {
  const t = useTranslations("sources.detail.models");
  const counts = new Map<string, { provider: Model["provider"]; n: number }>();
  for (const m of models) {
    const entry = counts.get(m.provider.id) ?? { n: 0, provider: m.provider };
    entry.n += 1;
    counts.set(m.provider.id, entry);
  }
  if (counts.size < 2) {
    return null;
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted is past this project's ES target
  const all = [...counts.values()].sort((a, b) => b.n - a.n);
  // A maker picked from «Ещё N» moves into the row, so every pick stays in sight.
  const shown = all.filter(
    (g, i) => i < CHIPS_SHOWN || picked.has(g.provider.id)
  );
  const rest = all.filter((g) => !shown.includes(g));
  const chip = ({ provider, n }: (typeof all)[number]) => (
    <button
      aria-pressed={picked.has(provider.id)}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg border pr-2.5 pl-1.5 text-xs transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]",
        picked.has(provider.id)
          ? "border-foreground/40 bg-muted"
          : "hover:bg-muted/60 text-muted-foreground"
      )}
      key={provider.id}
      onClick={() => onPick(provider.id)}
      type="button"
    >
      <BrandLogo
        label={provider.title}
        logo={provider.logo ?? undefined}
        size={20}
      />
      {provider.title}
      <span className="text-muted-foreground tabular-nums">{n}</span>
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map(chip)}
      {rest.length > 0 && (
        <Popover>
          <PopoverTrigger
            render={
              <button
                aria-label={t("more", { count: rest.length })}
                className="hover:bg-muted/60 text-muted-foreground flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs transition-colors duration-150"
                type="button"
              />
            }
          >
            {t("more", { count: rest.length })}
            <ChevronDown className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="flex max-h-80 w-64 flex-col gap-1 overflow-y-auto p-1.5"
          >
            {rest.map(({ provider, n }) => (
              <button
                aria-pressed={picked.has(provider.id)}
                className="hover:bg-muted flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150"
                key={provider.id}
                onClick={() => onPick(provider.id)}
                type="button"
              >
                <BrandLogo
                  label={provider.title}
                  logo={provider.logo ?? undefined}
                  size={20}
                />
                <span className="flex-1 truncate">{provider.title}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {n}
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export const SourceModels = ({
  detail,
  dimmed,
}: {
  detail: SourceDetail;
  dimmed: boolean;
}) => {
  const t = useTranslations("sources.detail");
  const sourceId = detail.source.id;
  const [query, setQuery] = useState("");
  const [onlyOn, setOnlyOn] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pick = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const [editing, setEditing] = useState<string | null>(null);
  const [syncing, startSync] = useTransition();
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [, startToggle] = useTransition();
  // Switches answer at once; the server's answer replaces the guess.
  const [enabled, setOptimistic] = useOptimistic(
    new Set(detail.models.filter((m) => m.enabled).map((m) => m.id)),
    (current, change: { ids: string[]; on: boolean }) => {
      const next = new Set(current);
      for (const id of change.ids) {
        if (change.on) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    }
  );
  const toggle = (ids: string[], on: boolean) =>
    startToggle(async () => {
      setOptimistic({ ids, on });
      await toggleModels(sourceId, ids, on);
    });

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = detail.models.filter(
      (m) =>
        (!onlyOn || enabled.has(m.id)) &&
        (picked.size === 0 || picked.has(m.provider.id)) &&
        (!q ||
          `${m.title} ${m.modelId} ${m.provider.title}`
            .toLowerCase()
            .includes(q))
    );
    const byProvider = new Map<
      string,
      { provider: Model["provider"]; models: Model[] }
    >();
    for (const m of shown) {
      const group = byProvider.get(m.provider.id) ?? {
        models: [],
        provider: m.provider,
      };
      group.models.push(m);
      byProvider.set(m.provider.id, group);
    }
    return [...byProvider.values()];
  }, [detail.models, enabled, onlyOn, picked, query]);

  const runSync = () =>
    startSync(async () => {
      const result = await sync(sourceId);
      setSyncNote(
        result.ok
          ? [
              t("models.synced", { added: result.added }),
              result.missing.length
                ? t("models.missing", {
                    list: result.missing.slice(0, 5).join(", "),
                  })
                : "",
            ]
              .filter(Boolean)
              .join(" ")
          : null
      );
    });

  return (
    <Section
      action={
        <Button
          disabled={syncing}
          onClick={runSync}
          size="sm"
          variant="outline"
        >
          <RefreshCw className={cn(syncing && "animate-spin")} />
          {syncing ? t("models.syncing") : t("models.sync")}
        </Button>
      }
      meta={t("models.meta", { on: enabled.size, total: detail.models.length })}
      title={t("models.title")}
    >
      {syncNote && (
        <p className="text-muted-foreground animate-in fade-in -mt-1 text-xs duration-150">
          {syncNote}
        </p>
      )}
      {detail.models.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="min-w-48 flex-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              autoComplete="off"
              data-1p-ignore
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("models.search")}
              value={query}
            />
          </InputGroup>
          <Button
            aria-pressed={onlyOn}
            className={cn(
              onlyOn &&
                "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
            )}
            onClick={() => setOnlyOn((v) => !v)}
            variant="outline"
          >
            {t("models.inChat")}
          </Button>
        </div>
      )}
      <ProviderChips models={detail.models} onPick={pick} picked={picked} />
      <div
        className={cn(
          "max-h-[70vh] overflow-y-auto rounded-lg border transition-opacity duration-200",
          dimmed && "opacity-60"
        )}
      >
        {(detail.models.length === 0 || groups.length === 0) && (
          <p className="text-muted-foreground px-4 py-6 text-center">
            {detail.models.length === 0
              ? t("models.empty")
              : t("models.nothing")}
          </p>
        )}
        {groups.length > 0 &&
          groups.map(({ provider, models }) => {
            const on = models.filter((m) => enabled.has(m.id)).length;
            return (
              <div className="border-b last:border-b-0" key={provider.id}>
                <div className="bg-muted/40 sticky top-0 z-[1] flex items-center gap-2.5 px-4 py-2 backdrop-blur">
                  <BrandLogo
                    label={provider.title}
                    logo={provider.logo ?? undefined}
                    size={22}
                  />
                  <span className="font-medium">{provider.title}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {on} / {models.length}
                  </span>
                  <Switch
                    aria-label={t("models.all", { provider: provider.title })}
                    checked={on === models.length}
                    className="ml-auto"
                    onCheckedChange={(next) =>
                      toggle(
                        models.map((m) => m.id),
                        next
                      )
                    }
                    size="sm"
                  />
                </div>
                <ul className="divide-y">
                  {models.map((m) => {
                    const price = priceLabel(m);
                    const context = contextLabel(m.contextWindow);
                    return (
                      <li key={m.id}>
                        <div className="flex items-center gap-3 py-2 pr-4 pl-4 md:pl-12">
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className={cn(
                                "truncate font-medium transition-colors duration-150",
                                !enabled.has(m.id) && "text-muted-foreground"
                              )}
                              title={m.modelId}
                            >
                              {m.title}
                            </span>
                            {isNew(m.releasedAt) && (
                              <Badge size="sm" variant="info-light">
                                {t("models.new")}
                              </Badge>
                            )}
                          </span>
                          <Caps model={m} />
                          {context && (
                            <span className="text-muted-foreground hidden w-12 text-right text-xs tabular-nums sm:inline">
                              {context}
                            </span>
                          )}
                          <button
                            className="text-muted-foreground hover:text-foreground w-32 truncate text-right text-xs tabular-nums transition-colors duration-150"
                            onClick={() =>
                              setEditing(editing === m.id ? null : m.id)
                            }
                            title={
                              price
                                ? `${price} ${t("models.perMillion")}`
                                : t("models.price")
                            }
                            type="button"
                          >
                            {price ?? t("models.noPrice")}
                          </button>
                          <Switch
                            aria-label={m.title}
                            checked={enabled.has(m.id)}
                            onCheckedChange={(next) => toggle([m.id], next)}
                            size="sm"
                          />
                        </div>
                        {editing === m.id && (
                          <PricingEditor
                            fromSource={detail.source.kind === "gateway"}
                            model={m}
                            onClose={() => setEditing(null)}
                            sourceId={sourceId}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
      </div>
    </Section>
  );
};
