"use client";

import { currencies } from "@metobe/contracts/models";
import type { Capabilities, Currency } from "@metobe/contracts/models";
import type { SourceDetail } from "@metobe/core/sources-read";
import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@metobe/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@metobe/ui/components/sheet";
import { Spinner } from "@metobe/ui/components/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@metobe/ui/components/tabs";
import { cn } from "@metobe/ui/lib/utils";
import { Check, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { canConvert, convert } from "@/lib/price-units";

import { setCapabilities, setPricing } from "./actions";

// A model of a source in a floating drawer (prototype «Редактор модели», «Панель · Вкладки»): capabilities by
// hand, prices per any number of tokens, what is known about the model. One «Сохранить» for all of it.

type Model = SourceDetail["models"][number];
type CapKey = keyof Capabilities;
type Tri = "yes" | "no" | "unknown";
type PriceKey = "input" | "output" | "cacheRead" | "cacheWrite";

const CAP_KEYS: CapKey[] = ["tools", "vision", "reasoning", "structured"];
const PRICE_KEYS: PriceKey[] = ["input", "output", "cacheRead", "cacheWrite"];
const PRICE_COLUMN = {
  cacheRead: "priceCacheRead",
  cacheWrite: "priceCacheWrite",
  input: "priceInput",
  output: "priceOutput",
} as const;
const QUICK_UNITS = [
  { label: "1", value: 1 },
  { label: "1K", value: 1000 },
  { label: "1M", value: 1_000_000 },
];
const MILLION = 1_000_000;
const SYMBOL: Record<Currency, string> = { RUB: "₽", USD: "$" };

const blank = (v: string) => (v.trim() === "" ? null : v.trim());

const toTri = (v: boolean | null): Tri => {
  if (v === null) {
    return "unknown";
  }
  return v ? "yes" : "no";
};
const fromTri = (v: Tri) => (v === "unknown" ? null : v === "yes");

/** Three options in one pill (real radio buttons underneath); the chosen one's background slides to it. */
const TriSwitch = ({
  value,
  onChange,
  label,
}: {
  value: Tri;
  onChange: (v: Tri) => void;
  label: string;
}) => {
  const t = useTranslations("sources.detail.models.caps");
  const name = useId();
  const options: { v: Tri; name: string; node: React.ReactNode }[] = [
    { name: t("yes"), node: <Check className="size-3.5" />, v: "yes" },
    { name: t("no"), node: <X className="size-3.5" />, v: "no" },
    { name: t("unset"), node: "?", v: "unknown" },
  ];
  const index = options.findIndex((o) => o.v === value);
  return (
    <fieldset className="bg-muted/60 relative m-0 flex h-7 shrink-0 rounded-md border-0 p-0.5">
      <legend className="sr-only">{label}</legend>
      <span
        aria-hidden
        className="bg-background absolute top-0.5 bottom-0.5 left-0.5 w-8 rounded-[5px] shadow-xs transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 32}px)` }}
      />
      {options.map((o) => (
        <label
          className={cn(
            "has-[:focus-visible]:ring-ring/50 relative z-[1] flex w-8 cursor-pointer items-center justify-center text-xs font-medium transition-colors duration-150 has-[:focus-visible]:rounded-[5px] has-[:focus-visible]:ring-2",
            o.v === value
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          key={o.v}
          title={o.name}
        >
          <input
            checked={o.v === value}
            className="sr-only"
            name={name}
            onChange={() => onChange(o.v)}
            type="radio"
            value={o.v}
          />
          <span aria-hidden>{o.node}</span>
          <span className="sr-only">{o.name}</span>
        </label>
      ))}
    </fieldset>
  );
};

/** Prices as the drawer shows them: a price per 1, 10, 100… tokens is shown per 1M, exactly; any other unit as is. */
const initialPrices = (m: Model) => {
  const stored = m.priceUnitTokens ?? MILLION;
  const unit = canConvert(stored, MILLION) ? MILLION : stored;
  const values = Object.fromEntries(
    PRICE_KEYS.map((k) => {
      const v = m[PRICE_COLUMN[k]];
      return [k, v === null ? "" : convert(v, stored, unit)];
    })
  ) as Record<PriceKey, string>;
  return {
    currency: (m.priceCurrency ?? "USD") as Currency,
    unit: String(unit),
    values,
  };
};

const Drawer = ({
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
  const format = useFormatter();
  const [tab, setTab] = useState("caps");
  const [caps, setCaps] = useState(model.capabilities);
  const [capsReset, setCapsReset] = useState(false);
  const start = initialPrices(model);
  const [values, setValues] = useState(start.values);
  const [unit, setUnit] = useState(start.unit);
  const [currency, setCurrency] = useState(start.currency);
  const [error, setError] = useState<string | null>(null);
  const [pending, begin] = useTransition();

  const capsChanged =
    capsReset || JSON.stringify(caps) !== JSON.stringify(model.capabilities);
  const pricesChanged =
    JSON.stringify([values, unit, currency]) !==
    JSON.stringify([start.values, start.unit, start.currency]);
  const dirty = capsChanged || pricesChanged;

  const reset = () => {
    setCaps(model.capabilities);
    setCapsReset(false);
    setValues(start.values);
    setUnit(start.unit);
    setCurrency(start.currency);
    setError(null);
  };

  const save = () =>
    begin(async () => {
      setError(null);
      if (pricesChanged) {
        const empty = PRICE_KEYS.every((k) => blank(values[k]) === null);
        const result = await setPricing(
          sourceId,
          model.id,
          empty
            ? null
            : {
                cacheRead: blank(values.cacheRead),
                cacheWrite: blank(values.cacheWrite),
                currency,
                input: blank(values.input),
                output: blank(values.output),
                unitTokens: Number(unit),
              }
        );
        if (!result.ok) {
          setError(result.error);
          setTab("prices");
          return;
        }
      }
      if (capsChanged) {
        await setCapabilities(sourceId, model.id, capsReset ? null : caps);
      }
      onClose();
    });

  const released = model.releasedAt
    ? format.dateTime(new Date(model.releasedAt), {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : t("drawer.notReported");
  const context = model.contextWindow
    ? format.number(model.contextWindow)
    : t("drawer.notReported");

  return (
    <>
      <SheetHeader className="border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <BrandLogo
            label={model.provider.title}
            logo={model.provider.logo ?? undefined}
            size={36}
          />
          <div className="min-w-0">
            <SheetTitle>{model.title}</SheetTitle>
            <SheetDescription className="truncate font-mono text-xs">
              {model.modelId}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4 pb-5"
        onValueChange={(v) => setTab(String(v))}
        value={tab}
      >
        <TabsList className="w-full">
          <TabsTrigger value="caps">{t("drawer.caps")}</TabsTrigger>
          <TabsTrigger value="prices">{t("drawer.prices")}</TabsTrigger>
          <TabsTrigger value="about">{t("drawer.about")}</TabsTrigger>
        </TabsList>

        <TabsContent className="flex flex-col gap-3" value="caps">
          <div className="divide-y">
            {CAP_KEYS.map((key) => (
              <div
                className="flex items-center justify-between gap-4 py-3 first:pt-0"
                key={key}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{t(`models.caps.${key}`)}</span>
                  <span className="text-muted-foreground text-xs">
                    {t(`drawer.capHint.${key}`)}
                  </span>
                </span>
                <TriSwitch
                  label={t(`models.caps.${key}`)}
                  onChange={(v) => {
                    setCapsReset(false);
                    setCaps({ ...caps, [key]: fromTri(v) });
                  }}
                  value={toTri(caps[key])}
                />
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            {t("models.caps.hint")}
          </p>
          {model.capabilitiesSource === "manual" && !capsReset && (
            <button
              className="text-muted-foreground hover:text-foreground self-start text-xs underline-offset-4 transition-colors duration-150 hover:underline"
              onClick={() => setCapsReset(true)}
              type="button"
            >
              {t("drawer.backToSource")}
            </button>
          )}
          {capsReset && <p className="text-xs">{t("drawer.backOnSave")}</p>}
        </TabsContent>

        <TabsContent className="flex flex-col gap-3" value="prices">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t("drawer.per")}</span>
            <Input
              aria-label={t("pricing.unit")}
              autoComplete="off"
              className="h-8 w-28 font-mono tabular-nums"
              inputMode="numeric"
              onChange={(e) => setUnit(e.target.value.replaceAll(/\D/gu, ""))}
              value={unit}
            />
            {QUICK_UNITS.map((u) => (
              <Button
                className={cn(String(u.value) === unit && "bg-muted")}
                key={u.value}
                onClick={() => setUnit(String(u.value))}
                size="sm"
                type="button"
                variant="ghost"
              >
                {u.label}
              </Button>
            ))}
            <span className="text-muted-foreground">{t("drawer.tokens")}</span>
            <Select
              onValueChange={(v) => setCurrency(v as Currency)}
              value={currency}
            >
              <SelectTrigger className="ml-auto w-20" size="sm">
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
          </div>
          <div className="divide-y rounded-lg border">
            {PRICE_KEYS.map((k) => (
              <label
                className="flex items-center justify-between gap-3 px-3 py-2"
                key={k}
              >
                <span>{t(`pricing.${k}`)}</span>
                <InputGroup className="w-40">
                  <InputGroupAddon>{SYMBOL[currency]}</InputGroupAddon>
                  <InputGroupInput
                    autoComplete="off"
                    className="text-right font-mono tabular-nums"
                    inputMode="decimal"
                    onChange={(e) =>
                      setValues({ ...values, [k]: e.target.value })
                    }
                    placeholder="—"
                    value={values[k]}
                  />
                </InputGroup>
              </label>
            ))}
          </div>
          <p
            className={cn(
              "text-xs",
              error ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {error ??
              (fromSource ? t("pricing.fromSource") : t("drawer.unitHint"))}
          </p>
        </TabsContent>

        <TabsContent value="about">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-muted-foreground">{t("drawer.maker")}</dt>
            <dd>{model.provider.title}</dd>
            <dt className="text-muted-foreground">{t("drawer.context")}</dt>
            <dd className="tabular-nums">{context}</dd>
            <dt className="text-muted-foreground">{t("drawer.released")}</dt>
            <dd>{released}</dd>
            <dt className="text-muted-foreground">{t("drawer.id")}</dt>
            <dd className="font-mono text-xs break-all">{model.modelId}</dd>
          </dl>
        </TabsContent>
      </Tabs>
      <SheetFooter className="bg-muted/50 mt-0 grid grid-cols-2 gap-3 border-t p-4">
        <Button
          className="h-9"
          disabled={!dirty || pending}
          onClick={reset}
          variant="outline"
        >
          {t("drawer.reset")}
        </Button>
        <Button className="h-9" disabled={!dirty || pending} onClick={save}>
          {pending && <Spinner />}
          {t("save")}
        </Button>
      </SheetFooter>
    </>
  );
};

/** The drawer over the models list; `model` null keeps it closed. */
export const ModelDrawer = ({
  model,
  sourceId,
  fromSource,
  onClose,
}: {
  model: Model | null;
  sourceId: string;
  fromSource: boolean;
  onClose: () => void;
}) => (
  <Sheet onOpenChange={(open) => !open && onClose()} open={Boolean(model)}>
    {/* Floating: inset from the edges, rounded, like a card over the page */}
    <SheetContent className="gap-0 overflow-hidden rounded-2xl border shadow-xl data-[side=right]:inset-y-3 data-[side=right]:right-3 data-[side=right]:h-[calc(100%-1.5rem)] data-[side=right]:w-[calc(100%-1.5rem)] data-[side=right]:sm:max-w-md">
      {model && (
        <Drawer
          fromSource={fromSource}
          key={model.id}
          model={model}
          onClose={onClose}
          sourceId={sourceId}
        />
      )}
    </SheetContent>
  </Sheet>
);
